#!/usr/bin/env python3
"""Run with the optional OCP-enabled Python runtime, without installing repo dependencies.

Produces reusable kernel evidence for the TypeScript mass-model regression test.
Every generated STEP is round-trip checked and then removed with its temp directory.
"""

import argparse
import importlib.util
import itertools
import json
import math
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("rod_step", ROOT / "src/lib/server/cad/rod_step.py")
CAD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CAD)

BASELINE = {"rodLengthMm": 125, "rodWidthMm": 20, "rodDepthMm": 16, "webMm": 4, "flangeMm": 3}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "docs/verification/rod-cad-kernel.json")
    args = parser.parse_args()
    cases = [BASELINE] + [dict(zip(CAD.BOUNDS, combination)) for combination in itertools.product(*CAD.BOUNDS.values())]
    reports = []
    with tempfile.TemporaryDirectory(prefix="diesel-rod-verification-") as directory:
        for params in cases:
            report = CAD.export_verified(params, directory)
            assert report["solidCount"] == 1 and report["valid"] and report["stepRoundTripValid"]
            assert report["relativeVolumeError"] < 1e-8
            assert report["stepRoundTripRelativeVolumeError"] < 1e-8
            for actual, expected in zip(report["boundsMm"]["min"], [-32, -32, -params["rodDepthMm"] / 2]):
                assert math.isclose(actual, expected, abs_tol=1e-7)
            for actual, expected in zip(report["boundsMm"]["max"], [32, params["rodLengthMm"] + 15, params["rodDepthMm"] / 2]):
                assert math.isclose(actual, expected, abs_tol=1e-7)
            reports.append({key: report[key] for key in (
                "params", "valid", "solidCount", "volumeMm3", "massKg", "boundsMm",
                "relativeVolumeError", "stepRoundTripValid", "stepRoundTripRelativeVolumeError"
            )})
    rejected = 0
    for invalid in ({}, {**BASELINE, "webMm": "4"}, {**BASELINE, "flangeMm": 8}, {**BASELINE, "rodLengthMm": float("nan")}, {**BASELINE, "rodWidthMm": True}):
        try:
            CAD.validate_params(invalid)
        except ValueError:
            rejected += 1
    assert rejected == 5
    result = {
        "schemaVersion": CAD.SCHEMA,
        "kernel": f"OCP {CAD.OCP.__version__}",
        "method": "Independent OCCT fused solid, BRepCheck, exact volume properties and STEP write/read checks; baseline and all 32 parameter-box corners.",
        "scope": "Geometry and full-solid volume only; no structural, fatigue, material or manufacturing validation.",
        "densityKgM3": CAD.DENSITY_KG_M3,
        "assumedMaterial": "Representative steel, not an asset material identification",
        "invalidCasesRejected": rejected,
        "cases": reports,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"cases": len(reports), "invalidCasesRejected": rejected, "output": str(args.output)}))


if __name__ == "__main__":
    main()
