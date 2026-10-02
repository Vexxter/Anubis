"""Final probe + ONNX INT8 encoder export, with checks that nothing broke.

Needs emb_cache.npz from probe_embed.py. Writes ./export/:
  probe.json        folded weights: score = embedding . w + b ; p = sigmoid(score)
  encoder.onnx      fp32 encoder + mean pooling   (input_ids, attention_mask -> pooled[B,768])
  encoder.int8.onnx dynamically quantized copy (what ships)
  tokenizer files   for the browser
Prints: L2 sweep, fp32-vs-int8 embedding cosine, probe AUC on synthetic set for torch/fp32/int8,
CPU ms/post (native onnxruntime; browser WASM is typically 2-4x slower).
"""
import json, os, time
import numpy as np
import torch
from tqdm import tqdm
from data import D

OUT = "export"; os.makedirs(OUT, exist_ok=True)
MAX_LEN = 128

# 1. Final probe ---------------------------------------------------------------------------
z = np.load("emb_cache.npz", allow_pickle=True)
E = {k: (z[k + "_X"], z[k + "_y"]) for k in z["names"]}

def auc(s, y):
    o = np.argsort(s, kind="stable"); r = np.empty(len(s)); r[o] = np.arange(1, len(s) + 1)
    for v in np.unique(s):
        m = s == v
        if m.sum() > 1: r[m] = r[m].mean()
    p = y == 1
    return (r[p].sum() - p.sum() * (p.sum() + 1) / 2) / (p.sum() * (~p).sum())

def fit(X, y, l2, steps=1500, lr=0.05):
    mu, sd = X.mean(0), X.std(0) + 1e-6
    Z = (X - mu) / sd; w = np.zeros(Z.shape[1]); b = 0.0
    for _ in range(steps):
        g = 1 / (1 + np.exp(-(Z @ w + b))) - y
        w -= lr * (Z.T @ g / len(y) + l2 * w / len(y)); b -= lr * g.mean()
    return w / sd, b - float(np.sum(mu * w / sd))   # folded: score = x @ w' + b'

print("L2 sweep (cross-domain AUC), picking the best average:")
best = None
for l2 in tqdm((3000, 10000, 30000, 100000), desc="L2"):
    w, b = fit(*E["tweep_train"], l2); a1 = auc(E["pairs_test"][0] @ w + b, E["pairs_test"][1])
    w, b = fit(*E["pairs_train"], l2); a2 = auc(E["tweep_test"][0] @ w + b, E["tweep_test"][1])
    tqdm.write(f"  L2={l2:<7} tweep->pairs {a1:.3f}  pairs->tweep {a2:.3f}  mean {(a1 + a2) / 2:.3f}")
    if best is None or a1 + a2 > best[0]: best = (a1 + a2, l2)
L2 = best[1]
print(f"using L2={L2}; final fit on tweep+pairs (train+test)")
X = np.vstack([E[k][0] for k in ("tweep_train", "tweep_test", "pairs_train", "pairs_test")])
y = np.concatenate([E[k][1] for k in ("tweep_train", "tweep_test", "pairs_train", "pairs_test")])
w, b = fit(X, y, L2)
json.dump({"model": "convaiinnovations/laya multilingual encoder", "pool": "mean", "max_len": MAX_LEN,
           "l2": L2, "dim": len(w), "w": w.tolist(), "b": b}, open(f"{OUT}/probe.json", "w"))
syn_texts, syn_y = [t for _, _, t in D], np.array([y_ for _, y_, _ in D])

# 2. Export encoder ------------------------------------------------------------------------
from laya import Agent
agent = Agent("convaiinnovations/laya", subfolder="multilingual")
tok, encoder = agent.tok, agent.model.encoder.cpu().eval().float()
try:
    encoder.config._attn_implementation = "eager"   # unpadded/flash paths do not export
except Exception:
    pass

class Pooled(torch.nn.Module):
    def __init__(self, enc): super().__init__(); self.enc = enc
    def forward(self, input_ids, attention_mask):
        h = self.enc(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        m = attention_mask.unsqueeze(-1).to(h.dtype)
        return (h * m).sum(1) / m.sum(1).clamp(min=1.0)

def batch(texts):
    return tok(list(texts), padding=True, truncation=True, max_length=MAX_LEN, return_tensors="pt")

model = Pooled(encoder).eval()
enc = batch(["hello world", "a somewhat longer example sentence for tracing"])
print("exporting ONNX (fp32)...")
with torch.inference_mode():
    torch.onnx.export(model, (enc["input_ids"], enc["attention_mask"]), f"{OUT}/encoder.onnx",
                      input_names=["input_ids", "attention_mask"], output_names=["pooled"],
                      dynamic_axes={"input_ids": {0: "b", 1: "s"}, "attention_mask": {0: "b", 1: "s"}, "pooled": {0: "b"}},
                      opset_version=17, dynamo=False)
tok.save_pretrained(OUT)

# 3. Quantize ------------------------------------------------------------------------------
from onnxruntime.quantization import quantize_dynamic, QuantType
print("quantizing INT8...")
quantize_dynamic(f"{OUT}/encoder.onnx", f"{OUT}/encoder.int8.onnx", weight_type=QuantType.QInt8)

# 4. Verify --------------------------------------------------------------------------------
import onnxruntime as ort
def session(path): return ort.InferenceSession(path, providers=["CPUExecutionProvider"])
def embed_ort(sess, texts):
    out = []
    for t in texts:  # batch of 1: the browser case, and no padding effects
        e = tok([t], truncation=True, max_length=MAX_LEN, return_tensors="np")
        out.append(sess.run(None, {"input_ids": e["input_ids"].astype(np.int64), "attention_mask": e["attention_mask"].astype(np.int64)})[0][0])
    return np.array(out)

with torch.inference_mode():
    ref = np.array([model(**{k: v for k, v in batch([t]).items() if k in ("input_ids", "attention_mask")})[0].numpy() for t in syn_texts])
fp32, int8 = session(f"{OUT}/encoder.onnx"), session(f"{OUT}/encoder.int8.onnx")
e32 = embed_ort(fp32, syn_texts)
t0 = time.perf_counter(); e8 = embed_ort(int8, syn_texts); ms = (time.perf_counter() - t0) * 1000 / len(syn_texts)
cos = lambda a, c: float(np.mean(np.sum(a * c, 1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(c, axis=1))))
print(f"\nembedding cosine vs torch: fp32-onnx {cos(ref, e32):.5f}   int8-onnx {cos(ref, e8):.5f}")
print(f"probe AUC on synthetic set: torch {auc(ref @ w + b, syn_y):.3f}   fp32-onnx {auc(e32 @ w + b, syn_y):.3f}   int8-onnx {auc(e8 @ w + b, syn_y):.3f}")
print(f"CPU speed (native onnxruntime, int8, batch 1): {ms:.0f} ms/post")
print("sizes:", {f: f"{os.path.getsize(os.path.join(OUT, f)) / 1e6:.0f}MB" for f in sorted(os.listdir(OUT)) if f.endswith((".onnx", ".json", ".model")) or f.startswith("tokenizer")})
