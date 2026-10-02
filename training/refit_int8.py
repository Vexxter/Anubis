"""Re-embed everything with the SHIPPING model (encoder.int8.onnx, batch 1, CPU) and refit the probe on it.

Why: the first probe was trained on fp32 embeddings; INT8 shifts them (cosine ~0.95).
Prints cross-domain AUC for (a) old fp32 probe applied to int8 embeddings, (b) probe refit on int8.
Writes export/probe.json (overwrites) and emb_int8_cache.npz. Same data sampling as probe_embed.py (seed 0).
Time: about 5 min (7,206 posts x ~26 ms), tqdm shown.
"""
import json, os, random, re
import numpy as np
import onnxruntime as ort
from tqdm import tqdm
from datasets import load_dataset
from transformers import AutoTokenizer
from data import D

N, MAX_LEN, OUT = 1500, 128, "export"
random.seed(0)

def tweet_sized(text):
    return " ".join(re.split(r"(?<=[.!?])\s+", text.strip())[:3])[:280]

def build():  # identical to probe_embed.build()
    out = {}
    tw = [r for r in load_dataset("KirillNik/tweepfake_synthetic", split="train") if r["tweet"] and r["src_text"]]
    random.shuffle(tw)
    cut = int(len(tw) * 0.8)
    for name, rows in (("tweep_train", tw[:cut]), ("tweep_test", tw[cut:])):
        rows = rows[: N if name == "tweep_train" else N // 4]
        out[name] = ([r["tweet"] for r in rows] + [r["src_text"] for r in rows], [1] * len(rows) + [0] * len(rows))
    for name, split, n in (("pairs_train", "train", N), ("pairs_test", "test", 200)):
        rows = list(load_dataset("arjun10g/slop-paraphrase-pairs-v2", split=split))
        random.shuffle(rows); rows = rows[:n]
        out[name] = ([tweet_sized(r["slop"]) for r in rows] + [tweet_sized(r["human"]) for r in rows],
                     [1] * len(rows) + [0] * len(rows))
    out["synthetic"] = ([t for _, _, t in D], [y for _, y, _ in D])
    return out

if os.path.exists("emb_int8_cache.npz"):
    z = np.load("emb_int8_cache.npz", allow_pickle=True)
    E = {k: (z[k + "_X"], z[k + "_y"]) for k in z["names"]}
    print("loaded cached int8 embeddings")
else:
    sets = build()
    tok = AutoTokenizer.from_pretrained(OUT)
    sess = ort.InferenceSession(f"{OUT}/encoder.int8.onnx", providers=["CPUExecutionProvider"])
    def embed(t):
        e = tok([t], truncation=True, max_length=MAX_LEN, return_tensors="np")
        return sess.run(None, {"input_ids": e["input_ids"].astype(np.int64), "attention_mask": e["attention_mask"].astype(np.int64)})[0][0]
    E = {}
    with tqdm(total=sum(len(v[0]) for v in sets.values()), unit="post", desc="int8 embedding") as bar:
        for name, (texts, y) in sets.items():
            X = []
            for t in texts:
                X.append(embed(t)); bar.update(1)
            E[name] = (np.array(X), np.array(y))
    np.savez("emb_int8_cache.npz", names=list(E), **{k + "_X": v[0] for k, v in E.items()}, **{k + "_y": v[1] for k, v in E.items()})

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
    return w / sd, b - float(np.sum(mu * w / sd))

# (a) old probe (fp32-trained) on int8 embeddings. Uses the fp32 cache from probe_embed.py.
z32 = np.load("emb_cache.npz", allow_pickle=True)
E32 = {k: (z32[k + "_X"], z32[k + "_y"]) for k in z32["names"]}
print(f"\n{'L2':>6} | tweep->pairs  pairs->tweep | (a) fp32-trained probe on int8 emb")
res = {}
for l2 in tqdm((3000, 10000, 30000), desc="fit"):
    w, b = fit(*E["tweep_train"], l2); a1 = auc(E["pairs_test"][0] @ w + b, E["pairs_test"][1])
    w2, b2 = fit(*E["pairs_train"], l2); a2 = auc(E["tweep_test"][0] @ w2 + b2, E["tweep_test"][1])
    o1, o2 = fit(*E32["tweep_train"], l2), fit(*E32["pairs_train"], l2)
    old = (auc(E["pairs_test"][0] @ o1[0] + o1[1], E["pairs_test"][1]) + auc(E["tweep_test"][0] @ o2[0] + o2[1], E["tweep_test"][1])) / 2
    res[l2] = a1 + a2
    tqdm.write(f"{l2:>6} | {a1:>12.3f}  {a2:>12.3f} | {old:.3f} (mean of both directions)")

l2 = 10000   # not the argmax: 30000 sits next to the collapse at 100000
print(f"\nfinal probe: L2={l2}, fit on all four int8 sets")
names = ("tweep_train", "tweep_test", "pairs_train", "pairs_test")
X = np.vstack([E[k][0] for k in names]); y = np.concatenate([E[k][1] for k in names])
w, b = fit(X, y, l2)
sx, sy = E["synthetic"]
print(f"synthetic set AUC (int8, final probe): {auc(sx @ w + b, sy):.3f}")
s = X @ w + b
print(f"score range on training data: p5={np.percentile(s, 5):.2f} p50={np.percentile(s, 50):.2f} p95={np.percentile(s, 95):.2f}")
json.dump({"model": "laya-multilingual encoder, int8 onnx, mean pool", "max_len": MAX_LEN, "l2": l2,
           "dim": len(w), "w": w.tolist(), "b": b}, open(f"{OUT}/probe.json", "w"))
print(f"wrote {OUT}/probe.json")
