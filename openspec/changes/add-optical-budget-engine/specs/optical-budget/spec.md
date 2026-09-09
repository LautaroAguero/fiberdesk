## Purpose

Computes how much optical signal a link loses between the OLT and a NAP, how much headroom that
leaves against the applicable GPON budget, and what that headroom means — together with a
breakdown detailed enough to explain the result rather than merely assert it.

## ADDED Requirements

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
