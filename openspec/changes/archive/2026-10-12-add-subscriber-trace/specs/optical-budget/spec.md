## ADDED Requirements

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
