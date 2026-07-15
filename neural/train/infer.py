"""train/infer.py — pure-stdlib Python inference twin of infer.mjs.

Loads the exported proof-model JSON, encodes a FEN with the shared 781-dim
feature encoder (../features.py), and computes the White-relative value.
Iterates the sparse active indices in the SAME order as the JS path so the two
languages agree to floating-point tolerance. NOT wired into any engine.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from features import encode_fen  # noqa: E402


def load_model(path):
    with open(path, "r") as f:
        return json.load(f)


def forward(model, idx):
    if model.get("featureDim") != 781:
        raise ValueError("model featureDim must be 781")
    layers = model["layers"]
    out_act = model.get("outputActivation", "tanh")
    if model["kind"] == "linear":
        W = layers["W"]
        z = float(layers["b"])
        for i in idx:
            z += W[i]
    elif model["kind"] == "mlp":
        H = int(model["hidden"])
        W1 = layers["W1"]
        b1 = layers["b1"]
        W2 = layers["W2"]
        pre = list(b1)
        for i in idx:
            base = i * H
            for j in range(H):
                pre[j] += W1[base + j]
        z = float(layers["b2"])
        for j in range(H):
            hv = pre[j] if pre[j] > 0.0 else 0.0
            z += W2[j] * hv
    else:
        raise ValueError("unknown model kind: %r" % model.get("kind"))
    if out_act == "tanh":
        return math.tanh(z)
    return z


def eval_fen(model, fen):
    return forward(model, encode_fen(fen))


if __name__ == "__main__":
    # Parity mode: python infer.py <model.json> <parity.json>
    # Verifies Python output matches the stored (JS-produced) expected outputs.
    if len(sys.argv) == 3:
        model = load_model(sys.argv[1])
        with open(sys.argv[2]) as f:
            parity = json.load(f)
        tol = parity.get("tolerance", 1e-6)
        worst = 0.0
        total = 0.0
        bad = 0
        for case in parity["cases"]:
            got = eval_fen(model, case["fen"])
            diff = abs(got - case["out"])
            worst = max(worst, diff)
            total += diff
            if diff > tol:
                bad += 1
                print("MISMATCH", case["fen"], "got", got, "exp", case["out"])
        n = len(parity["cases"])
        print("checked %d cases, max|diff|=%.3e mean|diff|=%.3e mismatches>%g: %d"
              % (n, worst, total / n if n else 0.0, tol, bad))
        sys.exit(1 if bad else 0)
    else:
        # single: python infer.py <model.json> --fen "<FEN>"
        model = load_model(sys.argv[1])
        fen = sys.argv[sys.argv.index("--fen") + 1]
        print(eval_fen(model, fen))
