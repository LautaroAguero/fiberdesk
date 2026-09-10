## ADDED Requirements

### Requirement: A documentation search tool

The system SHALL expose a tool that searches the technical documentation corpus and returns the
matching sections in citable form.

The tool's description SHALL state that the corpus is written in English, so that a question asked
in another language produces a query the corpus can actually match.

When the search returns nothing, the assistant SHALL say the documentation does not cover the
subject. It SHALL NOT answer from general knowledge in its place, and SHALL NOT present such an
answer as though it came from the documentation.

#### Scenario: A documentation question is answered from the corpus

- **WHEN** the user asks how cascaded splitters affect a link budget
- **THEN** the documentation search tool is called
- **AND** the answer quotes the returned passage and names the document it came from

#### Scenario: A question in Spanish searches an English corpus

- **WHEN** the user asks, in Spanish, about attenuation caused by moisture
- **THEN** the query sent to the tool is in English
- **AND** relevant passages are returned rather than an empty result

#### Scenario: The corpus does not cover the subject

- **WHEN** the user asks about something the corpus contains no passage on
- **THEN** the assistant states that the documentation does not cover it
- **AND** offers no substitute figure or specification of its own

#### Scenario: A network question does not search the documentation

- **WHEN** the user asks which NAPs fail the optical budget
- **THEN** the documentation search tool is not called
- **AND** the answer comes from the optical budget tools alone

### Requirement: The optical constants are available as a tool

The system SHALL expose a tool returning the project's optical constants, each with its unit and
its standing as industry-typical and pending validation.

This exists so the assistant can compare a documented figure against the value the system computes
with. Obtaining a constant SHALL remain a tool call: the assistant SHALL NOT derive one by
dividing figures out of a budget breakdown, which would be the model doing arithmetic.

#### Scenario: The constants are reported with their provenance

- **WHEN** the optical constants tool is called
- **THEN** it reports fiber attenuation as 0.25 dB/km at 1490 nm downstream
- **AND** each value carries its unit
- **AND** each is marked as industry-typical and pending validation

#### Scenario: A question about a constant is answered from the tool

- **WHEN** the user asks what loss the system assumes per fusion splice
- **THEN** the constants tool is called
- **AND** the answer states 0.08 dB, matching the tool result exactly

### Requirement: A disagreement between documentation and the constants is surfaced

When a document states a figure that differs from the corresponding optical constant, the
assistant SHALL report both values, name where each came from, and state plainly that they
disagree. It SHALL NOT silently prefer one, and SHALL NOT present the documented figure as the
value the system computes with.

#### Scenario: The documented fiber attenuation disagrees with the constant

- **WHEN** the user asks what fiber attenuation to assume at 1490 nm
- **THEN** the assistant reports the documented 0.22 dB/km, citing the document
- **AND** reports that the system computes with 0.25 dB/km, from the constants tool
- **AND** states that the two disagree
- **AND** does not resolve the disagreement by choosing one on the user's behalf

#### Scenario: A budget figure is unaffected by the documented value

- **WHEN** the user asks, in the same conversation, for NAP-12's optical budget
- **THEN** the total attenuation is 25.23 dB, computed with the 0.25 dB/km constant
- **AND** the documented 0.22 dB/km figure does not enter the calculation
