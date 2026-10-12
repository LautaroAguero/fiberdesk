#!/usr/bin/env python3
"""
Derives seed/expected-feasibility.json: the expected feasibility result for six
fixed points (A to F) and for the position of each of the 28 seed subscribers.

This is an INDEPENDENT second implementation of the feasibility engine, written
from the spec (connection-feasibility, optical-budget) and from design.md
(add-feasibility), decisions 2, 3, 4 and 10. It uses only the Python standard
library and never touches the TypeScript engine. The fixture it writes is what
the engine is tested against: if the two disagree, one of them is wrong.

Inputs:
  seed/network.json           positions of NAPs and subscribers, splitter ratios, parents
  seed/expected-budgets.json  the NAP totals, themselves derived by hand

What it does, per point:
  1. sorts every NAP by UNROUNDED straight-line distance, ties by id, and takes 3;
  2. for each: the drop (same model as derive-expected-traces.py), the free ports
     (outputs - subscribers - child NAPs), and the budget projected for a new
     subscriber at the point (the NAP's reported figures plus the drop's);
  3. reasons, in this order: too_far (the REPORTED, rounded route in metres is
     strictly greater than 600), no_free_ports (free <= 0), budget_fail
     (projected margin < 0);
  4. sorts feasible first, each group by distance, and ranks from 1.

Rounding: the engine reports Math.round(x * 100) / 100, which rounds halves up.
Python's round() is banker's rounding and must not be used, so the helpers below
use floor(x * scale + 0.5) / scale. Distances in metres are the rounded km
figures times 1000, rounded to the metre.

Run from the repository root:  python seed/derive-expected-feasibility.py
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Drop model. Owner decision 2 of the 2026-10-07 handoff; pending validation.
DROP_SLACK_FACTOR = 1.3  # route length / straight-line distance, dimensionless
DROP_CONNECTORS = 2  # connectors a drop adds: the NAP port and the ONT

# Maximum drop ROUTE length, in metres. Owner decision of 2026-10-12; pending validation.
MAX_DROP_ROUTE_M = 600

# Candidates evaluated per point. A product choice (owner, 2026-10-12), not physics.
CANDIDATE_COUNT = 3

# IUGG mean Earth radius, in km.
EARTH_RADIUS_KM = 6371.0088

# The six fixed eval points (design.md, Context table).
POINTS = {
    "A": (-27.4165, -59.0180),
    "B": (-27.4955, -58.9380),
    "C": (-27.4432, -58.9770),
    "D": (-27.4930, -59.0338),
    "E": (-27.4659, -58.9700),
    "F": (-27.4300, -58.9400),
}


def round2(x):
    return math.floor(x * 100 + 0.5) / 100


def round3(x):
    return math.floor(x * 1000 + 0.5) / 1000


def round_m(km):
    """Kilometres to whole metres, halves up."""
    return int(math.floor(km * 1000 + 0.5))


def haversine_km(lat1, lon1, lat2, lon2):
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def tidy(x):
    """Write whole-number floats the way the other fixtures do (28, not 28.0)."""
    return int(x) if float(x).is_integer() else x


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [clean(v) for v in value]
    if isinstance(value, float):
        return tidy(value)
    return value


def main():
    network = json.loads((ROOT / "network.json").read_text(encoding="utf8"))
    budgets = json.loads((ROOT / "expected-budgets.json").read_text(encoding="utf8"))

    fiber_db_per_km = budgets["loss_model"]["fiber_db_per_km"]
    connector_db = budgets["loss_model"]["connector_db"]
    budget_db = budgets["budget_db"]
    min_margin_db = budgets["min_margin_db"]
    naps = sorted(network["splitters"], key=lambda n: n["id"])

    def classify(margin):
        if margin < 0:
            return "fail"
        return "marginal" if margin < min_margin_db else "pass"

    # Free ports: outputs of the ratio, less subscribers served, less child NAPs fed.
    ports = {}
    for nap in naps:
        outputs = int(nap["ratio"].split(":")[1])
        subs = sum(1 for s in network["subscribers"] if s["nap"] == nap["id"])
        children = sum(1 for n in naps if n["parent"] == nap["id"])
        free = outputs - subs - children
        if free < 0:
            raise SystemExit(f"{nap['id']} is oversubscribed")
        ports[nap["id"]] = {
            "outputs": outputs,
            "subscribers": subs,
            "child_naps": children,
            "free": free,
        }

    drop_connectors_db = round2(DROP_CONNECTORS * connector_db)

    def evaluate(lat, lon):
        # 1. nearest three by unrounded distance, ties by id (naps is sorted by id,
        #    and Python's sort is stable).
        ordered = sorted(
            ((haversine_km(n["lat"], n["lon"], lat, lon), n) for n in naps),
            key=lambda pair: pair[0],
        )[:CANDIDATE_COUNT]

        candidates = []
        for straight, nap in ordered:
            nap_budget = budgets["naps"][nap["id"]]
            route = straight * DROP_SLACK_FACTOR

            drop_fiber_db = round2(route * fiber_db_per_km)
            drop_loss_db = round2(drop_fiber_db + drop_connectors_db)
            total_loss_db = round2(nap_budget["total_db"] + drop_loss_db)
            margin_db = round2(budget_db - total_loss_db)
            projected_status = classify(margin_db)

            straight_km = round3(straight)
            length_km = round3(route)
            route_m = round_m(length_km)
            free = ports[nap["id"]]["free"]

            reasons = []
            if route_m > MAX_DROP_ROUTE_M:
                reasons.append("too_far")
            if free <= 0:
                reasons.append("no_free_ports")
            if projected_status == "fail":
                reasons.append("budget_fail")

            candidates.append(
                (
                    straight,
                    {
                        "rank": 0,
                        "nap_id": nap["id"],
                        "nap_name": nap["name"],
                        "ratio": nap["ratio"],
                        "straight_line_m": round_m(straight_km),
                        "route_m": route_m,
                        "ports": ports[nap["id"]],
                        "drop": {
                            "straight_line_km": straight_km,
                            "slack_factor": DROP_SLACK_FACTOR,
                            "length_km": length_km,
                            "fiber_db": drop_fiber_db,
                            "connectors": DROP_CONNECTORS,
                            "connectors_db": drop_connectors_db,
                            "loss_db": drop_loss_db,
                        },
                        "nap_total_loss_db": nap_budget["total_db"],
                        "nap_margin_db": nap_budget["margin_db"],
                        "nap_status": nap_budget["status"],
                        "projected": {
                            "by_source": {
                                "fiber_db": round2(nap_budget["fiber_db"] + drop_fiber_db),
                                "splitters_db": nap_budget["splitters_db"],
                                "connectors_db": round2(nap_budget["connectors_db"] + drop_connectors_db),
                                "splices_db": nap_budget["splices_db"],
                            },
                            "total_loss_db": total_loss_db,
                            "margin_db": margin_db,
                            "status": projected_status,
                        },
                        "feasible": not reasons,
                        "reasons": reasons,
                    },
                )
            )

        # 4. feasible first, each group by distance (stable on the distance order), rank from 1.
        candidates.sort(key=lambda pair: (not pair[1]["feasible"], pair[0]))
        ranked = []
        for index, (_, candidate) in enumerate(candidates):
            candidate["rank"] = index + 1
            ranked.append(candidate)

        feasible = [c for c in ranked if c["feasible"]]
        return {
            "point": {"lat": lat, "lon": lon},
            "candidates": ranked,
            "best_nap_id": ranked[0]["nap_id"] if ranked[0]["feasible"] else None,
            "feasible_count": len(feasible),
        }

    points = {name: evaluate(lat, lon) for name, (lat, lon) in POINTS.items()}
    subscribers = {
        sub["id"]: evaluate(sub["lat"], sub["lon"]) for sub in network["subscribers"]
    }

    out = {
        "_note": (
            "Expected feasibility result per fixed point (A to F) and per seed subscriber position, "
            "derived by seed/derive-expected-feasibility.py, an independent Python implementation "
            "written from the spec and design.md (add-feasibility), never from the TypeScript "
            "engine. The engine must reproduce these numbers; if it disagrees, one of the two is "
            "wrong. Re-run the script to regenerate this file."
        ),
        "_constants_pending_validation": (
            "The drop model (slack factor, connectors per drop) and the maximum drop route length "
            "are owner-chosen, industry-typical starting points and are NOT validated against a "
            "real source. The fiber and connector losses and the NAP totals are shared with "
            "expected-budgets.json. This copy records what produced these numbers."
        ),
        "loss_model": {
            "drop_slack_factor": DROP_SLACK_FACTOR,
            "drop_connectors": DROP_CONNECTORS,
            "fiber_db_per_km": fiber_db_per_km,
            "connector_db": connector_db,
            "max_drop_route_m": MAX_DROP_ROUTE_M,
            "candidate_count": CANDIDATE_COUNT,
        },
        "gpon_class": budgets["gpon_class"],
        "budget_db": budget_db,
        "min_margin_db": min_margin_db,
        "points": points,
        "subscriber_positions": subscribers,
    }

    target = ROOT / "expected-feasibility.json"
    target.write_bytes((json.dumps(clean(out), indent=2, ensure_ascii=False) + "\n").encode("utf8"))
    print(f"wrote {target} ({len(points)} points, {len(subscribers)} subscriber positions)")


if __name__ == "__main__":
    main()
