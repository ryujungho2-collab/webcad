"""Aggregate raw native Worker trials; no inferred percentiles or heap claims."""
import json
import statistics
from pathlib import Path

root = Path(__file__).resolve().parents[3] / "output/verification/kernel-p4"
report = json.loads((root / "native-report.json").read_text(encoding="utf-8"))
before = json.loads((root / "pre-boolean-cleanup-report.json").read_text(encoding="utf-8"))
assert report["status"] == before["status"] == "passed"
m = report["metrics"]


def summary(values):
    assert len(values) == 5
    return {"raw": values, "median": statistics.median(values), "min": min(values), "max": max(values), "count": len(values)}


for trial in m["trials"]:
    for phase in ["cold", "warm", "newSource", "reclaimed"]:
        snapshot = trial[phase]
        for cache in [snapshot, snapshot["slabs"]]:
            assert cache["estimatedBytes"] <= cache["byteLimit"]
            assert cache["entries"] <= cache["limit"]
        assert snapshot["activeOperations"] == 0

data = {
    "environment": m["environment"], "opencascadeJs": "2.0.0-beta.b5ff984",
    "sessionScope": "Independent native Workers in the same isolated browser/Vite session; browser network/compiled-code caches not reset",
    "definitions": m["definitions"],
    "separated": {mode: {phase: summary([t[phase]["lastHlr"]["totalMs"] for t in m["trials"] if t["partition"] == partition]) for phase in ["cold", "warm", "newSource", "reclaimed"]} for mode, partition in [("global", False), ("partitioned", True)]},
    "r5": {mode: {phase: summary([t[mode][phase] for t in m["r5Trials"]]) for phase in ["wallMs", "sourceMs", "boundsMs", "updateMs", "hideMs", "extractMs", "totalMs"]} for mode in ["global", "partitioned"]},
    "beforeBooleanCleanup": {phase: summary([t["global"][phase] for t in before["metrics"]["r5Trials"]]) for phase in ["sourceMs", "totalMs"]},
    "nativeChecks": report["checks"], "source": "native-report.json", "beforeSource": "pre-boolean-cleanup-report.json",
    "geometryChecks": "Native fixture asserts exact serialized curve equality including original source indices, visibility, edge class and finite curves; changed source also compared between modes",
    "limitations": ["5 samples per mode are descriptive, not a stable p95 or universal speed claim", "Before/after Boolean cleanup uses separate five-Worker runs, not randomized concurrent binary A/B", "Native bytes are accounting estimates; no actual malloc, RSS or allocator upper-bound claim"],
}
for mode, partition in [("global", False), ("partitioned", True)]:
    data["separated"][mode]["wallColdMs"] = summary([t["wallColdMs"] for t in m["trials"] if t["partition"] == partition])
a, b = data["separated"]["global"]["cold"]["median"], data["separated"]["partitioned"]["cold"]["median"]
data["separated"]["coldMedianReductionPercent"] = (1-b/a)*100
a, b = data["beforeBooleanCleanup"]["totalMs"]["median"], data["r5"]["global"]["totalMs"]["median"]
data["r5"]["beforeAfterMedianReductionPercent"] = (1-b/a)*100
(root / "benchmark-summary.json").write_text(json.dumps(data, indent=2)+"\n", encoding="utf-8")
print(json.dumps({"separated": data["separated"], "r5": data["r5"], "beforeBooleanCleanup": data["beforeBooleanCleanup"]}, indent=2))
