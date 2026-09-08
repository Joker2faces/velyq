# Product opportunities

Only ideas that survive six questions: what customer problem, what data
supports it, can it be built honestly, does it improve decisions or retention,
is it more than cosmetic, what does it cost. Ideas that fail are recorded as
rejected so nobody re-proposes them.

---

## 1. "Valid above X" — the price threshold · **IMPLEMENTED (engine)**

**Problem.** A customer sees VELYQ liked a selection at 1.91 and the screen now
shows 1.78. Is that still worth taking? Every competitor leaves them guessing,
and a stale recommendation is worse than none.

**Data.** Model probability and current price — both already stored.

**Honest?** Yes, and it is arithmetic rather than opinion:
`minimumAcceptableOdds = (1 + threshold) / p`.

**Value.** Converts a decaying recommendation into a standing rule. The
customer stops needing VELYQ to be right *now* and starts using it as a bound.

**Status.** `evaluatePriceValidity` returns `breakEvenOdds` and
`minimumAcceptableOdds` as two distinct numbers, with `ATTRACTIVE / MARGINAL /
AT_FAIR / BELOW_FAIR / UNAVAILABLE`. Not yet surfaced in the UI.

**Cost.** Low. **Risk.** The threshold is a policy judgement — it is versioned
and injectable so it can be argued with rather than discovered in a diff.

---

## 2. MARGINAL as a first-class answer · **IMPLEMENTED (engine)**

**Problem.** A +0.2% expected value is arithmetically positive and practically
indistinguishable from fair. Reporting it as an edge is how a research product
becomes a tipster.

**Data.** Expected value against a stated threshold.

**Honest?** This *is* the honest option. VELYQ's model is EXPERIMENTAL and has
so far only matched the market; a hairline positive is noise.

**Value.** Credibility. A product that says "barely" keeps the right to say
"strongly".

**Cost.** Trivial. **Risk.** Fewer green badges. That is the point.

---

## 3. Scenario ladder · **IMPLEMENTED (engine)**

**Problem.** "What if it drifts to 1.90? What if it shortens to 1.70?"

**Data.** Model probability plus hypothetical prices. No new data at all.

**Honest?** Deterministic. Critically, it does **not** model narrative effects
("if the striker is rested…") because no model supports those.

**Status.** `priceLadder` returns independent rungs. Order-independent by
construction, and a test pins that — the version reviewed on the engine branch
reported "movement" between rungs, which was an artifact of array order.

---

## 4. EDGE_DISAPPEARED as a real lifecycle event · **PARTIALLY IMPLEMENTED**

**Problem.** Leaving a stale pick visible is the single most damaging thing a
market-intelligence product can do.

**Data.** Requires prior-decision history — currently the missing half.

**Honest?** Only with evidence an edge was published. The base branch returned
this status whenever no edge was present, which claimed a recommendation
history that never existed.

**Status.** Semantics corrected: the transition now needs `hadPriorEdge`. The
history store that would supply it is not built.

**Next.** Persist published decisions per (event, market, selection) so the
flag can be derived rather than passed in.

---

## 5. Why-not codes · **FOUNDATION PRESENT**

**Problem.** "No bet" with no reason is indistinguishable from a broken page.

**Status.** `evaluatePriceValidity` emits `PRICE_TOO_SHORT`,
`POSITIVE_BUT_BELOW_POLICY_THRESHOLD`, `MISSING_PRICE`,
`INVALID_MODEL_PROBABILITY`, `MALFORMED_PRICE` and others, each distinguishing
which input is at fault rather than collapsing into a generic failure.

**Next.** A customer-facing vocabulary. Internal codes are not copy.

---

## 6. What changed since I last looked · **RECOMMENDED, NOT BUILT**

**Problem.** A returning customer has no way to see what moved.

**Data.** Two intelligence snapshots. Requires durable per-decision snapshots —
the same store item 4 needs, which makes them one piece of work.

**Value.** Retention. This is a reason to open the product daily that does not
depend on the model being right.

**Complexity.** Medium — a snapshot table and a differ. **Risk.** Low; every
field compared is already stored.

---

## 7. Evidence timeline · **RECOMMENDED, NOT BUILT**

**Problem.** Trust comes from being able to audit a claim.

**Data.** Observation timestamps already carry provenance
(`operations.source_observations`).

**Constraint.** Must be assembled from facts, never generated prose. A
timeline that reads well and cannot be traced is worse than no timeline.

---

## 8. Watchlist · **RECOMMENDED, DEFER TRANSPORT**

**Problem.** Customers care about a handful of matches, not the whole card.

**Value.** The natural home for items 1 and 4: "tell me when this crosses
1.72", "tell me if the edge goes".

**Cost.** The domain model is small. Notification transport is a separate
project and should not be started with it.

---

## Rejected

**Confidence percentage.** A single number implying certainty the model does
not have. Multiple explainable risk flags carry more information and cannot be
misread as a probability of winning. *Fails: honest.*

**"Sharp money" / volume signals.** The provider supplies no stake data.
Inferring it from price movement and presenting it as flow would be invention.
*Fails: data.*

**Public track record.** Zero settled predictions exist. Publishing one now
would require fabricating history. Revisit when real settlements accumulate.
*Fails: data, honest.*

**AI-written match previews.** Cheap to add, indistinguishable from every
content farm, and it would put generated prose next to audited numbers.
*Fails: differentiated.*

**Accumulator builder as a growth feature.** Building parlays because the UI
needs content inverts the product. A correlation-aware multi is defensible;
one that exists to fill a page is not. *Fails: improves decisions.*
