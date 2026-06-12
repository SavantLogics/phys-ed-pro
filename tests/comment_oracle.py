#!/usr/bin/env python3
"""PhysEd Pro v3.0 — Python test oracle for the comment ladder.

Independent re-implementation of logic.js (codes -> stats -> points
-> ladder comment). Per the owner's standing rule, the runtime JS is
only trusted when its output matches this oracle across the shared
table in cases.json.

Usage:
    node tests/cross_check.js > tests/js_output.json
    python3 tests/comment_oracle.py            # exit 0 = match
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

DEFAULT_CODES = {
    "A":   {"deduction": 10, "flags": {"absence"}},
    "N":   {"deduction": 5,  "flags": {"noDress"}},
    "P":   {"deduction": 5,  "flags": {"noPart"}},
    "NP":  {"deduction": 10, "flags": {"noDress", "noPart"}},
    "TN":  {"deduction": 5,  "flags": {"tardy", "noDress"}},
    "TP":  {"deduction": 5,  "flags": {"tardy", "noPart"}},
    "TNP": {"deduction": 10, "flags": {"tardy", "noDress", "noPart"}},
    "EX":  {"deduction": 0,  "flags": {"excused"}},
    "MED": {"deduction": 0,  "flags": {"excused"}},
    "T":   {"deduction": 0,  "flags": {"tardy"}},
}

DEFAULT_THRESHOLDS = {
    "absCritical": 2,
    "npCritical": 2,
    "dressMajor": 2,
    "tardyMinor": 2,
    "pctExcellent": 0.95,
    "pctSolid": 0.85,
}

LADDER_TEXT = {
    1: "Multiple unexcused absences this week affected the grade. Consistent attendance is needed.",
    2: "Did not participate on multiple days. Active participation is required to earn full points.",
    3: "Was not dressed out multiple times this week, which reduced points. Please come prepared.",
    4: "One unexcused absence this week. Please make up any missed participation.",
    5: "Sat out one day this week. Aim to participate every class.",
    6: "Was not dressed out once this week. Remember to bring PE clothes.",
    7: "Late to class multiple times this week. Please arrive on time.",
    9: "Had excused absence(s) this week; otherwise on track.",
    10: "Excellent week — full participation, dressed out, and on time. Keep it up!",
    11: "Solid, consistent week. Good effort.",
    12: "Met weekly expectations.",
}


def build_codes(extra_codes):
    codes = {k: dict(v) for k, v in DEFAULT_CODES.items()}
    for c in (extra_codes or []):
        codes[c["code"]] = {
            "deduction": c.get("deduction", 0),
            "flags": {k for k, v in (c.get("flags") or {}).items() if v},
        }
    return codes


def week_stats(code_list, codes, weekly_total):
    stats = {"absences": 0, "excused": 0, "tardies": 0,
             "noDress": 0, "noPart": 0, "daysRecorded": 0}
    points = weekly_total
    for code in code_list:
        if not code:
            continue
        stats["daysRecorded"] += 1
        defn = codes.get(code)
        if defn is None:
            continue  # unknown code: counted as a recorded day, no effect
        points -= defn["deduction"]
        f = defn["flags"]
        if "absence" in f:
            stats["absences"] += 1
        if "excused" in f:
            stats["excused"] += 1
        if "tardy" in f:
            stats["tardies"] += 1
        if "noDress" in f:
            stats["noDress"] += 1
        if "noPart" in f:
            stats["noPart"] += 1
    stats["points"] = max(0, points)
    stats["pct"] = stats["points"] / weekly_total if weekly_total > 0 else 0
    return stats


def ladder(stats, t):
    """First match wins, top to bottom (triage-nurse model)."""
    if stats["absences"] >= t["absCritical"]:
        return 1
    if stats["noPart"] >= t["npCritical"]:
        return 2
    if stats["noDress"] >= t["dressMajor"]:
        return 3
    if stats["absences"] >= 1:
        return 4
    if stats["noPart"] >= 1:
        return 5
    if stats["noDress"] >= 1:
        return 6
    if stats["tardies"] >= t["tardyMinor"]:
        return 7
    if stats["excused"] >= 1:
        return 9
    if stats["pct"] >= t["pctExcellent"] and stats["tardies"] == 0:
        return 10
    if stats["pct"] >= t["pctSolid"]:
        return 11
    return 12


def main():
    with open(os.path.join(HERE, "cases.json"), encoding="utf-8") as f:
        cases = json.load(f)["cases"]
    js_path = os.path.join(HERE, "js_output.json")
    if not os.path.exists(js_path):
        print("ERROR: tests/js_output.json missing. Run: node tests/cross_check.js > tests/js_output.json")
        return 2
    with open(js_path, encoding="utf-8") as f:
        js_out = json.load(f)

    mismatches = 0
    for c in cases:
        weekly_total = c.get("weeklyTotal", 100)
        thresholds = {**DEFAULT_THRESHOLDS, **c.get("thresholds", {})}
        codes = build_codes(c.get("extraCodes"))
        stats = week_stats(c["codes"], codes, weekly_total)
        rule = ladder(stats, thresholds)
        expected = {"points": stats["points"], "rule": rule, "comment": LADDER_TEXT[rule]}

        actual = js_out.get(c["name"])
        ok = actual == expected
        rule_ok = rule == c.get("expectRule", rule)
        status = "PASS" if (ok and rule_ok) else "FAIL"
        if status == "FAIL":
            mismatches += 1
            print(f"  {status}  {c['name']}")
            print(f"        python : {expected}")
            print(f"        js     : {actual}")
            if not rule_ok:
                print(f"        cases.json expectRule={c.get('expectRule')} but python computed rule={rule}")
        else:
            print(f"  {status}  {c['name']} (rule {rule}, {stats['points']} pts)")

    total = len(cases)
    print(f"\nCross-check: {total - mismatches}/{total} match between JS engine and Python oracle")
    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main())
