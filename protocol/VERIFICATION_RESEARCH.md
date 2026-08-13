# Verification Research Track

The long-term differentiator is not "AI payments" by itself. It is credible settlement for work whose correctness may be difficult to verify.

## Class A — Deterministic jobs
Examples: compile code, produce a hash preimage, transform a file with deterministic checks, run a known benchmark.

Verification can be automated with deterministic rules and should not require a human arbiter.

## Class B — Sample-verifiable jobs
Examples: classify a large dataset where random samples can be rechecked.

Potential design: provider commits to full output -> verifier selects unpredictable samples -> provider reveals requested portions -> failure can slash bond.

## Class C — Competitive jobs
Multiple providers solve the same task. Agreement or objective scoring can establish a likely correct result. This spends more compute but reduces reliance on a single provider.

## Class D — Subjective jobs
Examples: design quality, translation quality, research quality.

These cannot honestly be "proved" by a simple hash. V1 uses buyer acceptance + arbitration. Future work may use bonded reviewers, reputation, or juries.

## Research principle
RALYA should expose the verification mode as part of the job contract. It must never imply that all AI work has a cryptographic proof when it does not.
