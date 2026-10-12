## Purpose

Answers "can a new customer be connected here?" for a point on the map. It evaluates the NAPs
nearest to the point against drop distance, free ports and the projected optical budget, all in
deterministic code, and names every check a NAP fails.

## ADDED Requirements

### Requirement: The three NAPs nearest to a point are evaluated

Given a point, the system SHALL evaluate the three NAPs nearest to it by straight-line distance on
the Earth's surface. A tie in distance SHALL be broken by NAP identifier. Every one of the three
SHALL be returned with its evaluation, whether it is feasible or not. A NAP is never left out for
being too far, full or failing. The result SHALL also state the point it evaluated.

Each candidate SHALL state:

- its straight-line distance and its modelled drop route length, in metres rounded to the metre;
- its free ports;
- the drop, as the subscriber trace states it;
- the projected link of a new subscriber at the point.

The result SHALL list the feasible candidates first, then the rest. Within each group, candidates
are ordered by distance. Each candidate SHALL carry its rank in that order, from 1. The result SHALL
name the best candidate, the first feasible one, or state that there is none. It SHALL also state
how many candidates are feasible, so that no caller has to count.

#### Scenario: The nearest NAP is full

- **WHEN** the point is (-27.4165, -59.0180), 167 m from NAP-03
- **THEN** the candidates are NAP-03, NAP-08 and NAP-12
- **AND** none is feasible, there is no best candidate, and the feasible count is 0

#### Scenario: Two NAPs are feasible

- **WHEN** the point is (-27.4659, -58.9700), between NAP-11 and NAP-05
- **THEN** NAP-11 is ranked 1 and NAP-05 is ranked 2, both feasible
- **AND** NAP-04 is ranked 3, not feasible
- **AND** the best candidate is NAP-11 and the feasible count is 2

#### Scenario: Feasible candidates come before nearer infeasible ones

- **WHEN** the nearest NAP to a point is infeasible and the second nearest is feasible
- **THEN** the second nearest is ranked 1 and named the best candidate

#### Scenario: The evaluated point is echoed

- **WHEN** any point is evaluated
- **THEN** the result states that point's latitude and longitude as given

### Requirement: Free ports count every output already in use

A NAP's free ports SHALL be the number of outputs of its splitter ratio, less the subscribers it
serves, less the child NAPs it feeds. Feeding a child NAP consumes one output of the parent's
splitter. A NAP with no free port SHALL NOT be feasible.

A NAP whose subscribers and child NAPs outnumber its outputs SHALL be refused with an error naming
it. The system SHALL NOT report negative free ports.

#### Scenario: A splitter that feeds a cascade

- **WHEN** the free ports of NAP-03 (1:2, one subscriber, feeding NAP-12) are computed
- **THEN** they are 0

#### Scenario: A splitter with room

- **WHEN** the free ports of NAP-10 (1:4, two subscribers, no child) are computed
- **THEN** they are 2

#### Scenario: The child NAP of a cascade

- **WHEN** the free ports of NAP-12 (1:16, four subscribers, no child) are computed
- **THEN** they are 12

#### Scenario: An oversubscribed NAP

- **WHEN** a hand-built network gives a 1:2 NAP two subscribers and one child NAP
- **THEN** evaluating it fails with an error naming that NAP
- **AND** no candidate list is returned

### Requirement: A candidate's budget is projected for the new subscriber

For each candidate, the system SHALL project the link of a new subscriber at the point. The NAP's
budget comes exactly as the budget engine reports it. The drop comes from the same drop model the
subscriber trace uses, from the NAP to the point. The projected total attenuation, margin against
the GPON class budget and classification SHALL be computed the way a subscriber's own link is. The
projection SHALL be computed for every candidate, including one that is too far or full, so that
every failing check can be named.

#### Scenario: A failing NAP stays failing

- **WHEN** the point is (-27.4955, -58.9380), 167 m from NAP-09
- **THEN** NAP-09's drop route length is 217 m and its drop loss is 0.85 dB
- **AND** its projected total attenuation is 30.25 dB and its projected margin -2.25 dB, classified
  `fail`

#### Scenario: A passing NAP projects to marginal

- **WHEN** the point is (-27.4930, -59.0338), 414 m from NAP-06
- **THEN** NAP-06's drop route length is 539 m and its drop loss is 0.93 dB
- **AND** its projected total attenuation is 25.49 dB and its projected margin 2.51 dB, classified
  `marginal`, although NAP-06 itself passes with 3.44 dB

#### Scenario: The projection matches a real subscriber's trace

- **WHEN** the point is the position of SUB-025, and NAP-12 is among its candidates
- **THEN** NAP-12's projected total attenuation, margin and classification equal SUB-025's traced
  figures: 26.15 dB, 1.85 dB, `marginal`

### Requirement: A verdict names every check that fails

A candidate SHALL be feasible when all three checks hold:

- its drop route length, as reported, does not exceed the maximum drop route length;
- it has at least one free port;
- its projected classification is not `fail`.

A feasible candidate whose projected classification is `marginal` SHALL stay feasible, and SHALL
carry that classification so the caveat is visible. A candidate that is not feasible SHALL carry
every reason that applies, in this order: `too_far`, `no_free_ports`, `budget_fail`.

#### Scenario: Full, not far

- **WHEN** the point is (-27.4165, -59.0180)
- **THEN** NAP-03 is not feasible with reasons `[no_free_ports]`, its route being 217 m and its
  projected margin 19.17 dB
- **AND** NAP-08 (route 3253 m) and NAP-12 (route 3549 m) are not feasible with reasons
  `[too_far]`

#### Scenario: Close, with ports, failing

- **WHEN** the point is (-27.4955, -58.9380)
- **THEN** NAP-09 is not feasible with reasons `[budget_fail]`, having 5 free ports

#### Scenario: A comfortable connection

- **WHEN** the point is (-27.4432, -58.9770), 158 m from NAP-01
- **THEN** NAP-01 is feasible: route 205 m, 5 free ports, projected margin 14.81 dB, classified
  `pass`

#### Scenario: Feasible with a caveat

- **WHEN** the point is (-27.4930, -59.0338)
- **THEN** NAP-06 is feasible and carries the projected classification `marginal`

#### Scenario: Out of coverage

- **WHEN** the point is (-27.4300, -58.9400)
- **THEN** all three candidates, NAP-10, NAP-07 and NAP-01, are not feasible with reasons
  `[too_far]`
- **AND** there is no best candidate

#### Scenario: Every reason at once

- **WHEN** a hand-built network has a NAP that is beyond the maximum from the point, has no free
  port and fails its projected budget
- **THEN** its reasons are `[too_far, no_free_ports, budget_fail]`, in that order

#### Scenario: Every seed subscriber is within reach of its own NAP

- **WHEN** each of the 28 seed subscribers' positions is evaluated
- **THEN** its own NAP's drop route length does not exceed the maximum, the longest being 498 m for
  SUB-025

### Requirement: A point outside the modelled city is refused

The system SHALL refuse to evaluate a point whose latitude or longitude is not a finite number, or
lies outside the modelled city's geographic bounds, with an error that names the problem. It SHALL
NOT return candidates for such a point.

#### Scenario: A point outside Resistencia

- **WHEN** the point is (-34.6037, -58.3816)
- **THEN** evaluation fails with an error saying the point is outside the modelled city
- **AND** no candidate list is returned

### Requirement: Feasibility is deterministic

The same network and the same point SHALL always produce an identical result, field for field.

#### Scenario: Evaluating twice

- **WHEN** the point (-27.4659, -58.9700) is evaluated twice
- **THEN** both results are identical
