# Trade-off Analysis and ADRs

## Scale Documentation to Impact

For a small, local choice, provide a short rationale and relevant trade-off. Use an architecture decision record for consequential choices affecting system boundaries, data ownership, external contracts, security, operations, or costly future changes. Do not create an ADR for every component.

Compare viable alternatives, including the current design or a minimal change. Tie benefits to requirements and evidence. Include implementation and operating costs, uncertainty, failure behavior, and reversibility where relevant. If a decisive assumption is unverified, propose a focused benchmark, prototype, or operational check with a success criterion.

## ADR Template

Adapt this template to the repository's existing convention and omit sections that add no value.

```markdown
# ADR-[number]: [Decision title]

Status: Proposed | Accepted | Deprecated | Superseded by [ADR]
Date: [date]

## Context
[Problem, relevant constraints and measurable requirements. Distinguish facts from assumptions.]

## Alternatives
[Viable options, including the current design or smallest useful change; benefits and costs against the requirements.]

## Decision and Rationale
[Concrete recommendation and why it fits the evidence better than the alternatives.]

## Consequences
[Accepted trade-offs, operational responsibilities, failure modes, and mitigations.]

## Validation and Migration
[Checks for uncertain assumptions; compatibility, rollout, rollback, or data migration where relevant.]

## Revisit Triggers
[Observable changes that would invalidate the rationale, such as a missed latency target or required independent deployment.]
```

## Storage and Lifecycle

Follow the repository's existing ADR location and numbering. If no convention exists and an ADR is warranted, use `docs/architecture/` with descriptive filenames.

Keep a recommendation marked Proposed until accepted through the project's decision process; do not label it Accepted solely because the agent recommends it. When a decision changes, preserve its history and link to the superseding record.
