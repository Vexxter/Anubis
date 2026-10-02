"""Linear probe on laya-multilingual encoder embeddings: ONE forward pass per post, no questions.

Tests whether AI-vs-human is linearly readable from the mean-pooled encoder output.
  in-domain  : tweep -> tweep (held-out rows), pairs -> pairs (official test split)
  cross-domain: tweep -> pairs, pairs -> tweep   (the number that tells us if it generalizes)
  multilingual: train on both, score the 56 synthetic posts by language (rough check only)

Usage: python probe_embed.py [--n 1500]
Saves embeddings to emb_cache.npz so re-runs are instant.
"""
import argparse, os, random, re, time
import numpy as np
from tqdm import tqdm
from datasets import load_dataset
from laya import Agent
from laya.shortlist import embed_fn_from_agent
from data import D

ap = argparse.ArgumentParser()
ap.add_argument("--n", type=int, default=1500, help="posts per class per source")
args = ap.parse_args()
random.seed(0)

def tweet_sized(text):
    return " ".join(re.split(r"(?<=[.!?])\s+", text.strip())[:3])[:280]

def build():
    """-> dict name -> (texts, labels). Splits are fixed by row, so a pair never straddles train/test."""
    out = {}
    tw = [r for r in load_dataset("KirillNik/tweepfake_synthetic", split="train") if r["tweet"] and r["src_text"]]
    random.shuffle(tw)
    cut = int(len(tw) * 0.8)
    for name, rows in (("tweep_train", tw[:cut]), ("tweep_test", tw[cut:])):
        rows = rows[: args.n if name == "tweep_train" else args.n // 4]
        out[name] = ([r["tweet"] for r in rows] + [r["src_text"] for r in rows], [1] * len(rows) + [0] * len(rows))
    for name, split, n in (("pairs_train", "train", args.n), ("pairs_test", "test", 200)):
        rows = list(load_dataset("arjun10g/slop-paraphrase-pairs-v2", split=split))
        random.shuffle(rows); rows = rows[:n]
        out[name] = ([tweet_sized(r["slop"]) for r in rows] + [tweet_sized(r["human"]) for r in rows],
                     [1] * len(rows) + [0] * len(rows))
    out["synthetic"] = ([t for _, _, t in D], [y for _, y, _ in D])
    return out

if os.path.exists("emb_cache.npz"):
    z = np.load("emb_cache.npz", allow_pickle=True)
    E = {k: (z[k + "_X"], z[k + "_y"]) for k in z["names"]}
    print("loaded cached embeddings")
else:
    sets = build()
    agent = Agent("convaiinnovations/laya", subfolder="multilingual")
    embed = embed_fn_from_agent(agent, max_length=128, batch_size=32)
    embed(["warm up"])
    E, t0, total = {}, time.perf_counter(), sum(len(v[0]) for v in sets.values())
    with tqdm(total=total, unit="post", desc="embedding") as bar:
        for name, (texts, y) in sets.items():
            parts = []
            for i in range(0, len(texts), 64):
                parts.append(embed(texts[i:i + 64])); bar.update(len(texts[i:i + 64]))
            E[name] = (np.concatenate(parts), np.array(y))
    print(f"embedded {total} posts in {time.perf_counter() - t0:.0f}s ({total / (time.perf_counter() - t0):.0f} posts/s)")
    np.savez("emb_cache.npz", names=list(E), **{k + "_X": v[0] for k, v in E.items()}, **{k + "_y": v[1] for k, v in E.items()})

def auc(s, y):
    order = np.argsort(s, kind="stable"); r = np.empty(len(s)); r[order] = np.arange(1, len(s) + 1)
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
    return lambda X2: ((X2 - mu) / sd) @ w + b

def cat(*names):
    return np.vstack([E[n][0] for n in names]), np.concatenate([E[n][1] for n in names])

print(f"\n{'L2':>6} | tweep->tweep  pairs->pairs | tweep->pairs  pairs->tweep | both->synthetic")
for l2 in (10, 100, 1000, 10000):
    row = []
    for tr, te in (("tweep_train", "tweep_test"), ("pairs_train", "pairs_test"), ("tweep_train", "pairs_test"), ("pairs_train", "tweep_test")):
        row.append(auc(fit(*E[tr], l2)(E[te][0]), E[te][1]))
    Xb, yb = cat("tweep_train", "pairs_train")
    row.append(auc(fit(Xb, yb, l2)(E["synthetic"][0]), E["synthetic"][1]))
    print(f"{l2:>6} | {row[0]:>12.3f}  {row[1]:>11.3f} | {row[2]:>12.3f}  {row[3]:>12.3f} | {row[4]:>14.3f}")

# By language on the synthetic set, at a middle regularization.
Xb, yb = cat("tweep_train", "pairs_train")
s = fit(Xb, yb, 1000)(E["synthetic"][0]); ys = E["synthetic"][1]
langs = np.array([l for l, _, _ in D])
print("\nsynthetic set by language (n is small; directional only):")
for l in dict.fromkeys(langs):
    m = langs == l
    print(f"  {l}: AUC {auc(s[m], ys[m]):.2f}  (n={m.sum()})")
print("\nFor reference, 29 zero-shot questions combined scored: tweep 0.75, pairs 0.84 in-domain; 0.69 / 0.61 cross-domain.")
