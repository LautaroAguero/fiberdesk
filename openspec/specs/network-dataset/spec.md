## Purpose

Defines the synthetic FTTH network that every other FiberDesk capability reads: its entities,
the integrity rules that make it traversable, and the edge cases it must contain so that the
product's core question — which links fail their optical budget — has a real answer.

## Requirements

### Requirement: Synthetic network dataset

The system SHALL ship a seed dataset describing exactly one OLT, the splitter enclosures (NAPs)
fed by it, the fiber runs connecting them, and the subscribers served by them.

The dataset SHALL be entirely fictional. Geographic coordinates SHALL fall within Resistencia,
Chaco, Argentina, and the physics SHALL be realistic, but no element SHALL be derived from a
real operator, a real customer or a production system.

#### Scenario: Dataset is present and complete

- **WHEN** the seed dataset is loaded
- **THEN** it contains exactly 1 OLT, 12 NAPs, 12 fiber runs and at least 20 subscribers
- **AND** every NAP is reachable from the OLT

#### Scenario: Coordinates fall inside the modelled city

- **WHEN** any entity carrying a position is read
- **THEN** its latitude lies between -27.50 and -27.40
- **AND** its longitude lies between -59.05 and -58.93

### Requirement: Entity contract

Each entity SHALL carry every field needed to compute an optical power budget without
consulting any other source.

The OLT SHALL declare an identifier, a position, a transmit power in dBm and a GPON class.
A NAP SHALL declare an identifier, a human-readable name, a position, a splitter ratio and the
identifier of its parent — either the OLT or another NAP.
A fiber run SHALL declare an identifier, its two endpoints, its route length in kilometres, its
count of fusion splices, its count of connectors, and a line geometry for map rendering.
A subscriber SHALL declare an identifier, a position and the NAP that serves it.

#### Scenario: A fiber run carries its own loss contributors

- **WHEN** the run from the OLT to NAP-07 is read
- **THEN** it reports `length_km` 12.4, `splices` 6 and `connectors` 4
- **AND** those three values are sufficient to derive its contribution to the link budget

#### Scenario: Route length exceeds straight-line distance

- **WHEN** a fiber run's `length_km` is compared against the great-circle distance between its
  endpoints
- **THEN** `length_km` is the larger of the two, because fiber follows streets and ducts rather
  than a straight line

### Requirement: Topology integrity

The dataset SHALL form a single tree rooted at the OLT, and loading SHALL reject any dataset
that violates this.

#### Scenario: Every parent reference resolves

- **WHEN** the dataset is validated
- **THEN** every NAP's parent identifier matches the OLT or another NAP in the same dataset
- **AND** every subscriber's serving NAP exists
- **AND** every fiber run's two endpoints exist

#### Scenario: A cycle is rejected

- **WHEN** a dataset declares NAP-A whose parent is NAP-B and NAP-B whose parent is NAP-A
- **THEN** validation fails
- **AND** the error names both NAP-A and NAP-B

#### Scenario: A second root is rejected

- **WHEN** a dataset declares a NAP with no parent, or with a parent that is not the OLT and not
  another NAP
- **THEN** validation fails
- **AND** the error names the orphaned NAP

#### Scenario: An unsupported splitter ratio is rejected

- **WHEN** a NAP declares a ratio outside `1:2`, `1:4`, `1:8`, `1:16` and `1:32`
- **THEN** validation fails
- **AND** the error names the NAP and the offending ratio

#### Scenario: Negative physical quantities are rejected

- **WHEN** a fiber run declares a `length_km`, `splices` or `connectors` value below zero
- **THEN** validation fails
- **AND** the error names the run and the offending field

### Requirement: Loading fails loudly

Loading SHALL either return a fully valid network or fail with an error that names the offending
entity and field. It SHALL NOT return a partially loaded network, silently drop invalid entities,
or substitute defaults for missing values.

#### Scenario: An invalid dataset yields no network

- **WHEN** a dataset fails any integrity rule
- **THEN** the load raises an error rather than returning a value
- **AND** no caller receives a network object built from that dataset

### Requirement: Deliberate edge-case coverage

The dataset SHALL be constructed so that, under GPON class B+ (28.00 dB budget, 3.00 dB minimum
recommended margin), it contains at least one link that fails the budget, at least one link that
passes but falls below the minimum margin, and at least one splitter cascade.

The loss figures in the scenarios below are the values documented in the project brief and are
**pending validation** against real specifications: fiber 0.25 dB/km, connector 0.40 dB, fusion
splice 0.08 dB, and splitters 3.50 / 7.20 / 10.50 / 13.50 / 17.00 dB for 1:2 / 1:4 / 1:8 / 1:16 /
1:32. This capability does not own those constants; it only guarantees that the dataset produces
the outcomes below when they are applied.

#### Scenario: NAP-09 fails the optical budget

- **WHEN** the path from NAP-09 to the OLT is traversed
- **THEN** it accumulates 20.8 km of fiber, two cascaded 1:8 splitters, 6 connectors and 10 splices
- **AND** the losses total 29.40 dB — fiber 5.20, splitters 21.00, connectors 2.40, splices 0.80
- **AND** the margin against the 28.00 dB budget is -1.40 dB
- **AND** the link is classified as failing

#### Scenario: NAP-12 passes but below the minimum margin

- **WHEN** the path from NAP-12 to the OLT is traversed
- **THEN** it accumulates 19.8 km of fiber, a 1:2 splitter cascading into a 1:16 splitter,
  6 connectors and 11 splices
- **AND** the losses total 25.23 dB — fiber 4.95, splitters 17.00, connectors 2.40, splices 0.88
- **AND** the margin against the 28.00 dB budget is 2.77 dB
- **AND** the link is classified as marginal, because 2.77 dB is below the 3.00 dB minimum

#### Scenario: A splitter cascade dominates the loss

- **WHEN** NAP-12's 25.23 dB total is broken down by source
- **THEN** the two cascaded splitters contribute 17.00 dB, more than the other three sources
  combined
- **AND** NAP-12's own 1:16 splitter alone contributes 13.50 dB, with the inherited 1:2 splitter
  adding the remaining 3.50 dB

#### Scenario: A link sits just above the minimum margin

- **WHEN** the path from NAP-06 to the OLT is traversed
- **THEN** the losses total 24.56 dB and the margin is 3.44 dB
- **AND** the link is classified as passing, because 3.44 dB clears the 3.00 dB minimum

#### Scenario: A link passes with comfortable margin

- **WHEN** the path from NAP-01 to the OLT is traversed
- **THEN** the losses total 12.34 dB and the margin is 15.66 dB
- **AND** the link is classified as passing

#### Scenario: Exactly one link fails and exactly one is marginal

- **WHEN** all 12 NAPs are evaluated
- **THEN** NAP-09 is the only failing link
- **AND** NAP-12 is the only marginal link
- **AND** the remaining 10 NAPs pass with at least 3.00 dB of margin

### Requirement: Failing links serve real subscribers

Every NAP that fails or is marginal SHALL serve at least one subscriber, so that a question about
affected customers has an answer rather than an empty set.

#### Scenario: The failing NAP has subscribers

- **WHEN** the subscribers served by NAP-09 are listed
- **THEN** the list is not empty

#### Scenario: The marginal NAP has subscribers

- **WHEN** the subscribers served by NAP-12 are listed
- **THEN** the list is not empty
