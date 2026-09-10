# GPON Link Budget Fundamentals

## Overview

A GPON link budget is the total optical loss a downstream signal can tolerate between the OLT and the ONT before the link stops working reliably. Every passive element on the path — fiber, splitters, connectors, fusion splices — subtracts from the power the OLT transmits, and the link only works if what remains at the far end still clears the receiver's minimum sensitivity.

Deployments are typically budgeted, not measured after the fact: an installer sums the expected loss of every element on a planned route and checks the total against the class budget before a single fiber is pulled.

## Loss Sources

Fiber attenuation at the downstream wavelength (1490 nm) is commonly modeled at 0.22 dB per kilometer of route length for standard single-mode fiber in outside-plant conditions. Route length, not straight-line distance, is what this figure should be applied to — fiber follows ducts and poles, not a direct line between two points.

Connectors and fusion splices each contribute a small, fixed loss per instance. A connector pair is a mechanical mating point and degrades with dirt and wear; a fusion splice is a permanent weld and is comparatively stable once made correctly. Splitters, covered in detail in a companion document, are usually the single largest contributor to link loss in any deployment that uses them.

## Budget Classes

GPON defines several link budget classes, each naming the maximum loss a link in that class may accumulate between OLT and ONT. Class B+ allows 28 dB. Class C+ allows 32 dB, intended for longer or more heavily split routes than B+ comfortably supports.

A link designed right at its class limit has no room for degradation over the life of the installation — connector wear, a re-splice after a repair, or a slightly longer replacement fiber run can all push a marginal link over the edge.

## Margin Recommendations

Industry practice is to keep a margin above the class budget rather than designing to it exactly — commonly cited figures fall in the 3 to 5 dB range depending on the operator's risk tolerance and the expected lifespan of the installation before the outside plant is revisited. A link with less than that margin should be flagged for review even if it technically closes the budget today.
