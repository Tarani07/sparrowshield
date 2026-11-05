#!/usr/bin/env python3
"""
SparrowShield — ONNX Runtime Threat Scorer
Drop-in replacement for placeholder threat scorers.
Loads threat_model.onnx and scores OCSF event dicts.
"""

from __future__ import annotations

import os

import numpy as np

from feature_extractor import extract


class OnnxThreatScorer:
    MODEL_PATH = os.path.join(os.path.dirname(__file__), "threat_model.onnx")

    def __init__(self):
        self._sess = None
        self._load()

    def _load(self):
        try:
            import onnxruntime as ort
            self._sess = ort.InferenceSession(
                self.MODEL_PATH,
                providers=["CPUExecutionProvider"],
            )
        except Exception:
            self._sess = None  # falls back to rule-based

    def score(self, event: dict) -> float:
        """
        Score an OCSF event dict.
        Returns a float in [0.0, 1.0] — probability of malicious class.
        """
        if self._sess is None:
            return self._rule_fallback(event)
        feat = extract(event).reshape(1, -1)
        outputs = self._sess.run(None, {"features": feat})
        # outputs[0] = labels shape (1,), outputs[1] = proba shape (1, 2)
        label = outputs[0]
        prob  = outputs[1]
        # prob shape: (1, 2) — class 0=benign, 1=malicious
        return float(prob[0][1])

    def _rule_fallback(self, event: dict) -> float:
        """Rule-based fallback when ONNX model not available."""
        feat = extract(event)
        score = 0.0
        if feat[2]:   score += 0.2   # scripting runtime
        if feat[1]:   score += 0.3   # encoded cmdline
        if feat[6]:   score += 0.4   # vss touch
        if feat[7]:   score += 0.5   # credential access
        if feat[5]:   score += 0.4   # known malware name
        if feat[3]:   score += 0.4   # office shell chain
        if feat[16]:  score += 0.5   # ransomware ext
        return min(score, 1.0)
