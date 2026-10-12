## Purpose

Computes how much optical signal a link loses between the OLT and a NAP, how much headroom that
leaves against the applicable GPON budget, and what that headroom means — together with a
breakdown detailed enough to explain the result rather than merely assert it.

## Requirements

### Requirement: Link attenuation from the OLT to a NAP

The system SHALL compute the total attenuation of the downstream path from the OLT to a given NAP
by accumulating, over every hop on that path, the fiber attenuation for its route length, the
insertion loss of the splitter at its far end, and the loss of its connectors and fusion splices.

Attenuation SHALL be computed for the downstream direction only. Every loss value applied SHALL
come from the project's optical constants; the calculation SHALL NOT contain literal loss figures.

#### Scenario: A link served directly from the OLT

- **WHEN** the budget for NAP-01 is computed
- **THEN** the path is a single hop of 3.2 km with a 1:8 splitter, 2 connectors and 3 splices
- **AND** the contributions are fiber 0.80 dB, splitter 10.50 dB, connectors 0.80 dB, splices 0.24 dB
- **AND** the total attenuation is 12.34 dB

#### Scenario: A link behind a splitter cascade

- **WHEN** the budget for NAP-12 is computed
- **THEN** the path accumulates 19.8 km of fiber, a 1:2 splitter followed by a 1:16 splitter,
  6 connectors and 11 splices
- **AND** the contributions are fiber 4.95 dB, splitters 17.00 dB, connectors 2.40 dB,
  splices 0.88 dB
- **AND** the total attenuation is 25.23 dB

#### Scenario: The deepest failing link

- **WHEN** the budget for NAP-09 is computed
- **THEN** the path accumulates 20.8 km of fiber, two cascaded 1:8 splitters, 6 connectors and
  10 splices
- **AND** the total attenuation is 29.40 dB

### Requirement: Margin against the declared GPON class

The system SHALL take the link budget from the GPON class the OLT declares, and SHALL report the
margin as that budget minus the total attenuation. The class SHALL NOT be assumed.

#### Scenario: Margin under the dataset's declared class

- **WHEN** the OLT declares GPON class B+, whose budget is 28.00 dB
- **AND** the budget for NAP-12 is computed
- **THEN** the margin is 2.77 dB

#### Scenario: A different declared class yields a different margin

- **WHEN** the OLT declares GPON class C+, whose budget is 32.00 dB
- **AND** the budget for NAP-12 is computed
- **THEN** the total attenuation is still 25.23 dB
- **AND** the margin is 6.77 dB

### Requirement: Classification against the recommended minimum margin

The system SHALL classify a link as failing when its margin is below zero, as marginal when its
margin is zero or above but below the recommended minimum, and as passing otherwise.

The recommended minimum margin SHALL be a named parameter with a project-wide default, and SHALL
be overridable per call. It is an operational recommendation rather than a physical constant, and
SHALL be recorded as such.

#### Scenario: A link that fails the budget

- **WHEN** the budget for NAP-09 is computed with the default 3.00 dB minimum
- **THEN** the margin is -1.40 dB
- **AND** the link is classified as failing

#### Scenario: A link that closes without enough margin

- **WHEN** the budget for NAP-12 is computed with the default 3.00 dB minimum
- **THEN** the margin is 2.77 dB
- **AND** the link is classified as marginal

#### Scenario: A link just above the minimum

- **WHEN** the budget for NAP-06 is computed with the default 3.00 dB minimum
- **THEN** the margin is 3.44 dB
- **AND** the link is classified as passing

#### Scenario: A link with comfortable margin

- **WHEN** the budget for NAP-01 is computed with the default 3.00 dB minimum
- **THEN** the margin is 15.66 dB
- **AND** the link is classified as passing

#### Scenario: Raising the minimum reclassifies a link without changing its physics

- **WHEN** the budget for NAP-06 is computed with a 5.00 dB minimum
- **THEN** the total attenuation is still 24.56 dB and the margin is still 3.44 dB
- **AND** the link is classified as marginal

### Requirement: Loss attribution by source and by hop

The system SHALL report the total contributed by each loss source, and SHALL additionally report a
per-hop breakdown naming the fiber run traversed and the splitter that terminates it, so that a
result can be explained by pointing at the hop responsible.

The per-hop contributions SHALL account for the totals exactly.

#### Scenario: Totals by source

- **WHEN** the budget for NAP-12 is computed
- **THEN** the reported sources are fiber 4.95 dB, splitters 17.00 dB, connectors 2.40 dB and
  splices 0.88 dB
- **AND** they sum to the reported total of 25.23 dB

#### Scenario: A cascade is attributed hop by hop

- **WHEN** the budget for NAP-12 is computed
- **THEN** two hops are reported
- **AND** the first traverses run FR-03 from OLT-RES-01 to NAP-03, contributing fiber 2.80 dB,
  a 1:2 splitter at NAP-03 worth 3.50 dB, connectors 1.20 dB and splices 0.48 dB
- **AND** the second traverses run FR-12 from NAP-03 to NAP-12, contributing fiber 2.15 dB,
  a 1:16 splitter at NAP-12 worth 13.50 dB, connectors 1.20 dB and splices 0.40 dB

#### Scenario: The inherited splitter is distinguishable from the NAP's own

- **WHEN** the per-hop breakdown for NAP-12 is read
- **THEN** the 13.50 dB is attributed to the splitter at NAP-12
- **AND** the 3.50 dB is attributed to the splitter at NAP-03, a node upstream of it

#### Scenario: A direct link reports a single hop

- **WHEN** the budget for NAP-01 is computed
- **THEN** exactly one hop is reported, traversing run FR-01 from OLT-RES-01 to NAP-01

### Requirement: Received optical power is reported but does not classify

The system SHALL report the optical power arriving at the NAP, derived from the transmit power the
OLT declares less the total attenuation. This value SHALL NOT participate in the margin or the
classification, both of which follow from the GPON class budget alone.

#### Scenario: Received power on a marginal link

- **WHEN** the OLT declares a transmit power of 3.0 dBm
- **AND** the budget for NAP-12 is computed
- **THEN** the received power is reported as -22.23 dBm

#### Scenario: Received power does not rescue a failing link

- **WHEN** the OLT declares a transmit power of 3.0 dBm
- **AND** the budget for NAP-09 is computed
- **THEN** the received power is reported as -26.40 dBm
- **AND** the link is still classified as failing, on its -1.40 dB margin

### Requirement: Deterministic results

The system SHALL return identical results for identical inputs. Values SHALL be accumulated at
full precision and rounded once, when the result is produced, to two decimal places.

#### Scenario: Repeated calls agree

- **WHEN** the budget for the same NAP is computed twice
- **THEN** the two results are identical in every field

#### Scenario: Rounding is applied at the boundary

- **WHEN** the budget for NAP-12 is computed
- **THEN** the reported total is exactly 25.23 dB, with no floating-point residue
- **AND** each reported source total is likewise expressed to two decimal places

### Requirement: Every NAP can be evaluated in one pass

The system SHALL provide a way to compute the budget for every NAP in a network. It SHALL produce,
for each NAP, exactly the result that computing that NAP individually produces — there SHALL be a
single implementation of the calculation.

#### Scenario: The whole network at once

- **WHEN** budgets are computed for every NAP in the dataset
- **THEN** 12 results are returned
- **AND** NAP-09 is the only one classified as failing
- **AND** NAP-12 is the only one classified as marginal
- **AND** the remaining 10 are classified as passing

#### Scenario: Batch and individual agree

- **WHEN** a NAP's result from the whole-network pass is compared with its individually computed
  result
- **THEN** the two are identical in every field
- **AND** this holds for all 12 NAPs

### Requirement: An unknown NAP is refused, not guessed

The system SHALL raise an error naming the identifier when asked for a NAP the network does not
contain. It SHALL NOT return a zeroed, partial or otherwise fabricated result.

#### Scenario: An identifier that is not in the network

- **WHEN** a budget is requested for `NAP-99`, which the dataset does not contain
- **THEN** an error is raised
- **AND** the error names `NAP-99`
- **AND** no result is returned to the caller
### Requirement: Link attenuation from the OLT to a subscriber's ONT

The system SHALL compute the downstream link budget of one subscriber as two parts: the serving
NAP's link budget from the OLT, exactly as computed for that NAP, and the subscriber's drop. The
total attenuation SHALL be the NAP's reported total plus the drop's reported loss. The margin SHALL
be the GPON class budget minus that total.

The result SHALL carry:

- the serving NAP's own budget: its hops, totals by source, total, margin and classification;
- the drop's figures;
- the end-to-end totals by source, where fiber includes the drop's fiber and connectors include
  the drop's connectors;
- the end-to-end total, margin and classification.

Every figure SHALL be produced by deterministic code from the project's optical constants. dB
figures SHALL be rounded to two decimals and lengths in km to three. The same network and
subscriber SHALL always give the same result.

#### Scenario: A subscriber behind a splitter cascade

- **WHEN** the link budget of SUB-025, served by NAP-12, is computed
- **THEN** the NAP part is NAP-12's own budget: hops FR-03 (1:2 at NAP-03) then FR-12 (1:16 at
  NAP-12), total 25.23 dB
- **AND** the drop adds 0.92 dB
- **AND** the end-to-end totals by source are fiber 5.07 dB, splitters 17.00 dB, connectors
  3.20 dB, splices 0.88 dB
- **AND** the total attenuation is 26.15 dB, the margin against the B+ budget of 28.00 dB is
  1.85 dB, and the classification is `marginal`

#### Scenario: A subscriber served directly from the OLT

- **WHEN** the link budget of SUB-014, served by NAP-07, is computed
- **THEN** the NAP part is a single hop, FR-07, with a total of 15.68 dB
- **AND** the total attenuation is 16.60 dB, the margin is 11.40 dB and the classification is
  `pass`

#### Scenario: A subscriber on the failing NAP

- **WHEN** the link budget of SUB-018, served by NAP-09, is computed
- **THEN** the total attenuation is 30.32 dB, the margin is −2.32 dB and the classification is
  `fail`

#### Scenario: Every subscriber matches the committed oracle

- **WHEN** the link budget of each of the 28 subscribers is computed
- **THEN** every drop figure, total, margin and classification equals the hand-derived values
  committed in `seed/expected-traces.json`

### Requirement: The drop is modelled, not measured

The drop length SHALL be the straight-line distance on the Earth's surface from the serving NAP to
the subscriber, multiplied by a slack factor that accounts for the route a drop cable actually
takes. The drop loss SHALL be that length times the fiber attenuation constant, plus a fixed number
of connectors times the connector loss constant.

The slack factor and the number of connectors per drop SHALL live in the optical constants with
their unit, their source and a pending-validation mark, like every other constant. The drop SHALL
reuse the existing fiber attenuation and connector loss, and SHALL NOT contain literal loss
figures. The result SHALL state the straight-line distance, the slack factor and the modelled
length, so that a reader can see the drop is an estimate.

#### Scenario: The drop of a cascaded subscriber

- **WHEN** the drop of SUB-025 is computed, with a slack factor of 1.3 and 2 connectors per drop
- **THEN** the straight-line distance is 0.383 km and the modelled length is 0.498 km
- **AND** the drop's fiber loss is 0.12 dB (at 0.25 dB/km) and its connector loss is 0.80 dB
  (2 × 0.40 dB)
- **AND** the drop loss is 0.92 dB

#### Scenario: A shorter drop

- **WHEN** the drop of SUB-026, also served by NAP-12, is computed
- **THEN** the modelled length is 0.458 km and the drop loss is 0.91 dB
- **AND** the total attenuation is 26.14 dB and the margin is 1.86 dB

### Requirement: A subscriber is classified on its own link

A subscriber's classification SHALL be computed from its own end-to-end margin, by the same rule
and the same recommended minimum margin as a NAP's. It SHALL NOT be inherited from the serving
NAP. The result SHALL carry both classifications, so that a subscriber whose NAP passes but whose
link does not can be told apart.

#### Scenario: A passing NAP with a marginal subscriber

- **WHEN** the link budget of SUB-011, served by NAP-06, is computed
- **THEN** NAP-06's own classification is `pass`, with a margin of 3.44 dB
- **AND** the subscriber's total attenuation is 25.48 dB and its margin is 2.52 dB, below the
  recommended 3.00 dB
- **AND** the subscriber's classification is `marginal`

### Requirement: Received power at the ONT is an estimate and does not classify

The result SHALL report the estimated optical power at the subscriber's ONT, in dBm: the OLT's
declared transmit power minus the end-to-end total attenuation. Like the power at a NAP, it SHALL
NOT take part in the margin or the classification. No receiver sensitivity is modelled, so the
result SHALL NOT state whether the ONT can decode that power.

#### Scenario: Power at a cascaded subscriber's ONT

- **WHEN** the link budget of SUB-025 is computed, with the OLT transmitting at 3.00 dBm
- **THEN** the estimated received power is −23.15 dBm
- **AND** the result carries no field that claims the ONT will or will not work

### Requirement: An unknown subscriber is refused, not guessed

When asked for a subscriber the network does not contain, the system SHALL refuse with an error
naming the identifier. It SHALL NOT return a zeroed, partial or estimated result.

#### Scenario: A subscriber that does not exist

- **WHEN** the link budget of SUB-099 is requested
- **THEN** the request fails with an error naming SUB-099, and no figure is produced
