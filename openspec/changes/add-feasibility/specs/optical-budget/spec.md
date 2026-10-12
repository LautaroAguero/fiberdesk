## MODIFIED Requirements

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

There SHALL be one drop model. A subscriber's trace and a connection-feasibility projection SHALL
compute the drop the same way, so the same distance always gives the same drop.

The maximum drop route length SHALL live in the optical constants too, in metres, with its source
and a pending-validation mark. It SHALL be marked as an operational limit rather than a physical
loss, like the recommended minimum margin. It SHALL apply to the modelled route length, not to the
straight line.

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

#### Scenario: The trace and feasibility agree on a drop

- **WHEN** a feasibility projection is made from NAP-12 to the position of SUB-025
- **THEN** its drop is identical, field for field, to the drop in SUB-025's trace

#### Scenario: The maximum drop route length

- **WHEN** the optical constants are read
- **THEN** the maximum drop route length is 600 m, marked operational and pending validation
- **AND** SUB-025's modelled drop of 0.498 km is within it
