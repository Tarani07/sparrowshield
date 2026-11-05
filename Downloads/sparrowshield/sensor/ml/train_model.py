#!/usr/bin/env python3
"""
SparrowShield — Train RandomForest and export to ONNX.

Run once to generate threat_model.onnx:
  python train_model.py

Requires: scikit-learn, skl2onnx, onnxruntime, numpy
  pip install scikit-learn skl2onnx onnxruntime numpy
"""

from __future__ import annotations

import os
import sys

import numpy as np

# ── Check deps ─────────────────────────────────────────────────────────────────
try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score
except ImportError:
    sys.exit("scikit-learn not found. pip install scikit-learn")

try:
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
except ImportError:
    sys.exit("skl2onnx not found. pip install skl2onnx")

NUM_FEATURES = 22
N_SAMPLES    = 4000
N_BENIGN     = 2000
N_MALICIOUS  = 2000
RANDOM_STATE = 42

OUTPUT_PATH  = os.path.join(os.path.dirname(__file__), "threat_model.onnx")


def _generate_benign(n: int, rng: np.random.Generator) -> np.ndarray:
    """
    Benign samples: mostly zeros; threat_score_raw < 0.2;
    occasional noise on non-attack features.
    """
    X = np.zeros((n, NUM_FEATURES), dtype=np.float32)

    # feature 20: severity_id occasionally 1-3 (not high)
    X[:, 20] = 0.0  # severity_high = 0

    # feature 21: threat_score_raw low
    X[:, 21] = rng.uniform(0.0, 0.2, size=n).astype(np.float32)

    # Add small noise on "network" features that are common for benign traffic
    # feature 11 (beacon_port 443/80) — web browsing
    beacon_mask = rng.random(n) < 0.3
    X[beacon_mask, 11] = 1.0

    # feature 13 (loopback) — local services
    loop_mask = rng.random(n) < 0.15
    X[loop_mask, 13] = 1.0

    # feature 2 (scripting_runtime) — developers occasionally run python
    script_mask = rng.random(n) < 0.1
    X[script_mask, 2] = 1.0

    return X


def _generate_malicious(n: int, rng: np.random.Generator) -> np.ndarray:
    """
    Malicious samples: random combinations of attack features set to 1;
    at least 3 of first 20 features are set OR threat_score_raw > 0.5.
    """
    X = np.zeros((n, NUM_FEATURES), dtype=np.float32)

    attack_feature_indices = list(range(0, 20))  # first 20 features

    for i in range(n):
        # Choose attack strategy: heavy IOC hits or high threat score
        strategy = rng.integers(0, 3)

        if strategy == 0:
            # Multi-IOC: 3-8 attack features triggered
            k = int(rng.integers(3, 9))
            chosen = rng.choice(attack_feature_indices, size=min(k, len(attack_feature_indices)), replace=False)
            X[i, chosen] = 1.0
            X[i, 21] = float(rng.uniform(0.3, 0.7))

        elif strategy == 1:
            # High threat score primary signal
            X[i, 21] = float(rng.uniform(0.5, 1.0))
            # 1-2 supporting features
            k = int(rng.integers(1, 4))
            chosen = rng.choice(attack_feature_indices, size=min(k, len(attack_feature_indices)), replace=False)
            X[i, chosen] = 1.0

        else:
            # Critical combo: credential access + encoded cmdline + scripting
            for fi in [1, 2, 7]:   # encoded_cmdline, scripting_runtime, credential_access
                X[i, fi] = 1.0
            # Bonus features
            k = int(rng.integers(0, 4))
            if k > 0:
                extra = [f for f in attack_feature_indices if f not in (1, 2, 7)]
                chosen = rng.choice(extra, size=min(k, len(extra)), replace=False)
                X[i, chosen] = 1.0
            X[i, 21] = float(rng.uniform(0.4, 1.0))

        # Severity high for most malicious
        if rng.random() > 0.3:
            X[i, 20] = 1.0

    return X


def _compute_labels(X: np.ndarray) -> np.ndarray:
    """
    Label = 1 if ≥ 3 of the first 20 features are set OR threat_score_raw > 0.5.
    """
    attack_count = X[:, :20].sum(axis=1)
    threat_high  = X[:, 21] > 0.5
    return ((attack_count >= 3) | threat_high).astype(np.int32)


def main():
    rng = np.random.default_rng(RANDOM_STATE)

    print("Generating synthetic training data …")
    X_benign    = _generate_benign(N_BENIGN, rng)
    X_malicious = _generate_malicious(N_MALICIOUS, rng)

    X = np.vstack([X_benign, X_malicious])
    y = _compute_labels(X)

    print(f"  Total samples : {len(X)}")
    print(f"  Benign (0)    : {(y == 0).sum()}")
    print(f"  Malicious (1) : {(y == 1).sum()}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )

    print("Training RandomForestClassifier …")
    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=8,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"Hold-out accuracy: {acc:.4f}  ({int(acc * len(y_test))}/{len(y_test)} correct)")

    print("Exporting to ONNX …")
    initial_type = [("features", FloatTensorType([None, NUM_FEATURES]))]
    onnx_model   = convert_sklearn(
        clf,
        initial_types=initial_type,
        target_opset=17,
    )

    with open(OUTPUT_PATH, "wb") as f:
        f.write(onnx_model.SerializeToString())

    print(f"Saved: {OUTPUT_PATH}")
    print("Done.")


if __name__ == "__main__":
    main()
