#!/usr/bin/env python3
"""
Derives seed/expected-traces.json: the expected link budget of every subscriber.

This is an INDEPENDENT second implementation of the subscriber trace, written
from the spec (optical-budget, "The drop is modelled, not measured") and from
design.md (add-subscriber-trace), decisions 2 to 5. It uses only the Python
standard library and never touches the TypeScript engine. The fixture it writes
is what the engine is tested against: if the two disagree, one of them is wrong.

Inputs:
  seed/network.json           raw positions of NAPs and subscribers, OLT power
  seed/expected-budgets.json  the NAP totals, themselves derived by hand

Rounding: the engine reports Math.round(x * 100) / 100, which rounds halves up.
Python's round() is banker's rounding and must not be used, so the helpers below
use floor(x * scale + 0.5) / scale. Every link figure is computed from the
already-reported (rounded) figures, as the spec and design.md decision 2 say.

Run from the repository root:  python seed/derive-expected-traces.py
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Drop model. Owner decision 2 of the 2026-10-07 handoff; pending validation.
DROP_SLACK_FACTOR = 1.3  # route length / straight-line distance, dimensionless
DROP_CONNECTORS = 2  # connectors a drop adds: the NAP port and the ONT

# IUGG mean Earth radius, in km.
EARTH_RADIUS_KM = 6371.0088


def round2(x):
    return math.floor(x * 100 + 0.5) / 100


def round3(x):
    return math.floor(x * 1000 + 0.5) / 1000


def haversine_km(lat1, lon1, lat2, lon2):
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def tidy(x):
    """Write whole-number floats the way expected-budgets.json does (28, not 28.0)."""
    return int(x) if float(x).is_integer() else x


def main():
    network = json.loads((ROOT / "network.json").read_text(encoding="utf8"))
    budgets = json.loads((ROOT / "expected-budgets.json").read_text(encoding="utf8"))

    fiber_db_per_km = budgets["loss_model"]["fiber_db_per_km"]
    connector_db = budgets["loss_model"]["connector_db"]
    budget_db = budgets["budget_db"]
    min_margin_db = budgets["min_margin_db"]
    tx_power_dbm = network["olt"]["tx_power_dbm"]
    naps = {n["id"]: n for n in network["splitters"]}

    def classify(margin):
        if margin < 0:
            return "fail"
        return "marginal" if margin < min_margin_db else "pass"

    drop_connectors_db = round2(DROP_CONNECTORS * connector_db)

    subscribers = {}
    for sub in network["subscribers"]:
        nap = naps[sub["nap"]]
        nap_budget = budgets["naps"][nap["id"]]

        straight = haversine_km(nap["lat"], nap["lon"], sub["lat"], sub["lon"])
        route = straight * DROP_SLACK_FACTOR

        drop_fiber_db = round2(route * fiber_db_per_km)
        drop_loss_db = round2(drop_fiber_db + drop_connectors_db)
        total_loss_db = round2(nap_budget["total_db"] + drop_loss_db)
        margin_db = round2(budget_db - total_loss_db)
        rx_power_dbm = round2(tx_power_dbm - total_loss_db)

        subscribers[sub["id"]] = {
            "nap_id": nap["id"],
            "straight_line_km": round3(straight),
            "length_km": round3(route),
            "drop_fiber_db": drop_fiber_db,
            "drop_connectors_db": drop_connectors_db,
            "drop_loss_db": drop_loss_db,
            "total_loss_db": total_loss_db,
            "margin_db": margin_db,
            "status": classify(margin_db),
            "rx_power_dbm": rx_power_dbm,
            "nap_status": nap_budget["status"],
        }

    out = {
        "_note": (
            "Expected link budget per subscriber, derived by seed/derive-expected-traces.py, "
            "an independent Python implementation written from the spec and design.md "
            "(add-subscriber-trace), never from the TypeScript engine. The engine must reproduce "
            "these numbers; if it disagrees, one of the two is wrong. Re-run the script to "
            "regenerate this file."
        ),
        "_constants_pending_validation": (
            "The drop model (slack factor, connectors per drop) is an owner-chosen, "
            "industry-typical starting point and is NOT validated against a real source. "
            "The fiber and connector losses are shared with expected-budgets.json. "
            "This copy records what produced these numbers."
        ),
        "loss_model": {
            "drop_slack_factor": DROP_SLACK_FACTOR,
            "drop_connectors": DROP_CONNECTORS,
            "fiber_db_per_km": fiber_db_per_km,
            "connector_db": connector_db,
        },
        "subscribers": subscribers,
    }

    def clean(value):
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items()}
        if isinstance(value, float):
            return tidy(value)
        return value

    target = ROOT / "expected-traces.json"
    target.write_text(json.dumps(clean(out), indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print(f"wrote {target} ({len(subscribers)} subscribers)")


if __name__ == "__main__":
    main()
