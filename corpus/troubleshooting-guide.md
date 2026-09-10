# Troubleshooting Optical Power Issues

## Diagnosing High Attenuation

When a link measures worse than its planned budget, the first step is comparing the measured loss against the planned figure per element rather than against the total alone — a total-only comparison cannot distinguish a single bad connector from a systematic problem spread across the whole route. Walking the route from the OLT outward, checking each fiber run, splitter, and connector in turn against its expected contribution, isolates the actual source far faster than re-measuring the whole link repeatedly.

## Environmental Factors

Moisture is one of the more common causes of a link that degrades intermittently rather than failing outright. Water intrusion into a poorly sealed enclosure or a damaged fiber jacket allows the fiber's cladding to absorb some of the transmitted light, which shows up as attenuation that gets worse during or after rain and partially recovers once the affected section dries out. A connector or splice enclosure that is not fully sealed is a common entry point, and inspecting gaskets and seals is usually more productive than re-testing the fiber itself when a fault correlates with wet weather.

Temperature swings can produce a similar intermittent pattern by stressing a marginal splice or connector mechanically, though the loss increase from thermal cycling is typically smaller and less abrupt than what moisture ingress produces.

## Common Field Mistakes

The most frequent mistake in the field is treating a budget calculation as a one-time check performed at design time and never revisited after a repair. A re-spliced fiber run, a replaced connector, or a splitter swapped for a different ratio during a repair all change the actual loss on that path, and none of those changes update themselves in whatever budget was originally calculated.
