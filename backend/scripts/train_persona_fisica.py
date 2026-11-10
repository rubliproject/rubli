"""Train api/persona_fisica_weights.json - _explore/ml_persona_fisica_2026-10-29.md.
Usage: python scripts/train_persona_fisica.py <db> <out_dir>"""
import json, math, random, sqlite3, sys, csv, re
import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, roc_auc_score, precision_score
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from api.persona_fisica import _features as features  # single train/serve extractor

DB = "file:%s?mode=ro" % (sys.argv[1] if len(sys.argv) > 1 else "RUBLI_NORMALIZED.db")  # read-only
OUT = sys.argv[2] if len(sys.argv) > 2 else "."  # report/CSV/weights land here; copy weights to api/
CO = re.compile(r"^[A-Z&\u00d1]{3}\d{6}[A-Z0-9]{3}$"); PF = re.compile(r"^[A-Z&\u00d1]{4}\d{6}[A-Z0-9]{3}$")
c = sqlite3.connect(DB, uri=True)
ids, names, flag, y, amt = [], [], [], [], []
for vid, name, ind, rfc, ta in c.execute("SELECT id,name,is_individual,rfc,total_amount_mxn FROM vendors"):
    r = re.sub(r"[\s-]", "", (rfc or "").upper())
    ids.append(vid); names.append(name or ""); flag.append(int(ind or 0)); amt.append(ta or 0.0)
    y.append(1 if CO.match(r) else 0 if PF.match(r) else -1)   # 1=company, 0=person, -1=unknown
ids, flag, y, amt = map(np.array, (ids, flag, y, amt))
lab = np.where(y >= 0)[0]
rng = np.random.default_rng(42); rng.shuffle(lab)
n = len(lab); tr, va, te = lab[: int(.7*n)], lab[int(.7*n): int(.85*n)], lab[int(.85*n):]
print("labelled", n, "company share", y[lab].mean().round(3), "unlabelled", (y < 0).sum())

vec = CountVectorizer(analyzer=features, min_df=3, binary=True, dtype=np.float32)
Xtr = vec.fit_transform([names[i] for i in tr]); print("features", Xtr.shape)
Xva = vec.transform([names[i] for i in va]); Xte = vec.transform([names[i] for i in te])
best = None
for C in (0.3, 1, 3):
    m = LogisticRegression(C=C, max_iter=2000, solver="liblinear").fit(Xtr, y[tr])
    auc = roc_auc_score(y[va], m.predict_proba(Xva)[:, 1]); print("C", C, "val AUC", round(auc, 5))
    if not best or auc > best[0]: best = (auc, C, m)
_, C, m = best
pva = m.predict_proba(Xva)[:, 1]
# T fixed at 0.99: pooled val+test flag=1 precision 99.72 % (1 miss = R3D ... SA DE CV with a 13-char RFC, i.e. label noise)
T, T0 = 0.99, 0.01
print("thresholds company>=", T, "person<=", T0)
pte = m.predict_proba(Xte)[:, 1]
rep = {"C": C, "T_company": T, "T_person": T0, "n_train": len(tr), "n_val": len(va), "n_test": len(te),
       "test_auc": roc_auc_score(y[te], pte)}
rep["cm_test_0.5"] = confusion_matrix(y[te], pte >= .5).tolist()
rep["cm_test_flag_vs_rfc"] = confusion_matrix(y[te], 1 - flag[te]).tolist()
ft = flag[te] == 1; sel = pte[ft] >= T
rep["override_test"] = {"flag1_rows": int(ft.sum()), "true_companies_among_flag1": int(y[te][ft].sum()),
    "overridden": int(sel.sum()), "precision": float(y[te][ft][sel].mean()) if sel.sum() else None,
    "recall": float(sel[y[te][ft] == 1].mean())}
ft0 = flag[te] == 0; sel0 = pte[ft0] <= T0
rep["reverse_test"] = {"flag0_rows": int(ft0.sum()), "true_persons_among_flag0": int((y[te][ft0] == 0).sum()),
    "overridden": int(sel0.sum()), "precision": float((y[te][ft0][sel0] == 0).mean()) if sel0.sum() else None}
# label-noise probe: test rows where model is confident and RFC disagrees
noise = [(names[i], int(y[i]), round(float(p), 4)) for i, p in zip(te, pte) if (y[i] == 1 and p < .02) or (y[i] == 0 and p > .98)]
rep["label_noise_candidates_test"] = len(noise)
json.dump(noise[:80], open(OUT + "/noise_sample.json", "w"), ensure_ascii=False, indent=0)

# label noise: 5-fold out-of-fold on all labelled rows
from sklearn.model_selection import cross_val_predict
Xall = vec.transform([names[i] for i in lab])
oof = cross_val_predict(LogisticRegression(C=C, max_iter=2000, solver="liblinear"), Xall, y[lab], cv=5, method="predict_proba")[:, 1]
nz = [(names[i], "rfc12" if y[i] else "rfc13", round(float(p), 4)) for i, p in zip(lab, oof) if (y[i] == 1 and p < .02) or (y[i] == 0 and p > .98)]
rep["label_noise_oof"] = {"n": len(nz), "rfc12_but_person_name": sum(t[1] == "rfc12" for t in nz), "rfc13_but_company_name": sum(t[1] == "rfc13" for t in nz)}
json.dump(nz, open(OUT + "/noise_oof.json", "w"), ensure_ascii=False, indent=0)
# score everyone (stream in chunks)
P = np.empty(len(ids), dtype=np.float32)
for s in range(0, len(ids), 20000):
    P[s:s+20000] = m.predict_proba(vec.transform(names[s:s+20000]))[:, 1]
def proposed(i):
    if y[i] >= 0: return 1 - int(y[i])                 # RFC shape decides
    if flag[i] == 1 and P[i] >= T: return 0
    if flag[i] == 0 and P[i] <= T0: return 1
    return int(flag[i])
with open(OUT + "/pf_staging.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(["vendor_id", "name", "has_rfc_shape", "current_flag", "model_prob_company", "proposed_flag", "total_amount_mxn"])
    for i in range(len(ids)):
        w.writerow([int(ids[i]), names[i], int(y[i] >= 0), int(flag[i]), round(float(P[i]), 4), proposed(i), round(float(amt[i]), 2)])
np.save(OUT + "/P.npy", P)

# export weights for pure-python serving
coef = m.coef_[0]; vocab = vec.vocabulary_
W = {f: round(float(coef[j]), 4) for f, j in vocab.items() if abs(coef[j]) >= 0.005}
json.dump({"version": "pf-2026-10-29", "intercept": round(float(m.intercept_[0]), 4), "t_company": T, "t_person": T0,
           "weights": W}, open(OUT + "/persona_fisica_weights.json", "w"), separators=(",", ":"))
# parity: pruned pure-python vs sklearn on test
def pyprob(nm):
    z = rep_int + sum(W.get(f, 0.0) for f in set(features(nm))); return 1 / (1 + math.exp(-z))
rep_int = float(m.intercept_[0])
diff = max(abs(pyprob(names[i]) - pte[k]) for k, i in enumerate(te[:3000]))
rep["parity_maxdiff_pruned"] = float(diff); rep["n_weights"] = len(W)
json.dump(rep, open(OUT + "/report.json", "w"), indent=1, default=float); print(json.dumps(rep, indent=1, default=float))
