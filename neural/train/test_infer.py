"""test_infer.py — pure-stdlib tests for the Python inference twin.

Run:  python -m unittest neural/train/test_infer.py
  or: python neural/train/test_infer.py
"""
import json
import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from infer import forward, eval_fen, load_model  # noqa: E402


class TestInfer(unittest.TestCase):
    def test_linear_forward(self):
        m = {"featureDim": 781, "kind": "linear", "outputActivation": "tanh",
             "layers": {"W": [0.0] * 781, "b": 0.0}}
        m["layers"]["W"][5] = 0.5
        m["layers"]["W"][10] = 0.5
        self.assertAlmostEqual(forward(m, [5, 10]), math.tanh(1.0), places=12)
        m["layers"]["b"] = 0.25
        self.assertAlmostEqual(forward(m, [10]), math.tanh(0.75), places=12)

    def test_relu(self):
        def mk(b1):
            return {"featureDim": 781, "kind": "mlp", "hidden": 1, "outputActivation": "tanh",
                    "layers": {"W1": [0.0] * 781, "b1": [b1], "W2": [1.0], "b2": 0.0}}
        self.assertAlmostEqual(forward(mk(-5.0), [0, 1, 2]), 0.0, places=12)
        self.assertAlmostEqual(forward(mk(5.0), [0, 1, 2]), math.tanh(5.0), places=12)

    def test_malformed_rejected(self):
        with self.assertRaises(ValueError):
            forward({"featureDim": 100, "kind": "linear", "layers": {"W": [], "b": 0}}, [])
        with self.assertRaises(ValueError):
            forward({"featureDim": 781, "kind": "bogus", "layers": {}}, [])

    def test_parity_fixture(self):
        model = load_model(os.path.join(HERE, "fixtures", "proof-model-fixture.json"))
        with open(os.path.join(HERE, "fixtures", "inference-parity.json")) as f:
            parity = json.load(f)
        tol = parity.get("tolerance", 1e-6)
        worst = max(abs(eval_fen(model, c["fen"]) - c["out"]) for c in parity["cases"])
        self.assertLessEqual(worst, tol, "max|diff| %.3e > tol %g" % (worst, tol))
        self.assertGreaterEqual(len(parity["cases"]), 27)


if __name__ == "__main__":
    unittest.main(verbosity=2)
