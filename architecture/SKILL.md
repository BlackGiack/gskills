---
name: architecture
description: "Guide architectural decisions through requirements discovery, comparison of alternatives, and explicit trade-offs. Use when designing or reviewing system structure, choosing component boundaries or architectural patterns, planning migrations, or documenting significant decisions in ADRs."
---

# Architecture Decision Framework

## Workflow

1. Inspect repository instructions, current structure, existing decisions, and relevant operational evidence. Read `context-discovery.md` to identify requirements and consequential unknowns.
2. State the problem, constraints, and assumptions. Ask only about missing information that would materially change the recommendation.
3. Compare viable alternatives, including the current design or a minimal change. Use `pattern-selection.md` for reasoning and `patterns-reference.md` for candidate patterns; neither is a prescription.
4. Recommend the simplest option that meets the requirements. Explain boundaries, dependency direction, data ownership, and relevant failure behavior.
5. Identify accepted costs, operational needs, validation steps, and migration risks. Distinguish evidence from assumptions; use a focused experiment when uncertainty could change the decision.
6. Scale documentation to impact using `trade-off-analysis.md`. Finish with the recommendation, rationale, unresolved questions, and observable revisit triggers.

## References

Read only the references relevant to the decision. Resolve paths relative to this skill directory.

| File | When to read |
|------|--------------|
| `context-discovery.md` | Establishing requirements and constraints |
| `pattern-selection.md` | Evaluating boundaries and architectural approaches |
| `patterns-reference.md` | Comparing candidate patterns and their costs |
| `trade-off-analysis.md` | Explaining trade-offs or writing an ADR |
| `examples.md` | Seeing illustrative decisions grounded in requirements |

## Decision Principles

- Preserve useful existing architecture; justify changes with concrete requirements or evidence.
- Treat user counts, team size, and project labels as context, not thresholds that select an architecture.
- Introduce complexity for a specific benefit that outweighs its implementation and operational costs.
- Separate logical modularity from deployment topology; meaningful boundaries do not require separate services.
- Prefer reversible choices where practical, but acknowledge costly migrations. Preserve useful seams without building speculative infrastructure.
