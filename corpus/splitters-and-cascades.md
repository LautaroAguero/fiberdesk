# Splitters and Cascaded Enclosures

## Splitter Ratios and Insertion Loss

A splitter divides the optical power arriving at its input among several outputs, and every output pays for that division in insertion loss. Common ratios are 1:2, 1:4, 1:8, 1:16 and 1:32; each doubling of the ratio roughly doubles the number of subscribers a single splitter can serve, and each doubling also adds several decibels of insertion loss to every one of those subscribers' links. A 1:32 splitter loses far more power per output than four 1:8 splitters would combined — the trade is fewer enclosures against a steeper loss per subscriber.

## Cascaded Splitter Loss

A cascade is a splitter fed from the output of another splitter rather than directly from the OLT. Cascaded splitter loss is additive: the insertion loss of every splitter stage in the chain applies to every subscriber downstream of the last one, on top of the fiber, connector, and splice loss the whole path already carries.

Cascaded splitter loss is the single most common reason an otherwise reasonable-looking link ends up marginal or fails its budget outright. Two cascaded splitters of a modest ratio can easily contribute more insertion loss than either splitter's ratio alone would suggest, because the losses of both stages stack rather than averaging. A route review that only checks the final splitter's ratio, without walking the whole chain back to the OLT, will consistently under-estimate the total splitter insertion loss on a cascaded link.

When a link is marginal, checking whether it descends from a splitter cascade — and how many stages deep — is usually the fastest way to understand where the loss actually came from.

## Choosing a Splitter Ratio

The right ratio for a given enclosure balances subscriber count against the margin the rest of the route has to spend. A short route with few competing loss sources can often absorb a 1:32 splitter comfortably; a long route, or one that already descends from an upstream splitter, may need a smaller ratio at that stage to leave room for everything else on the path.
