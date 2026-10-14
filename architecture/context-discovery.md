# Context Discovery

## Start With Available Evidence

Read the conversation, repository instructions, code, configuration, existing ADRs, and available workload or incident data. Separate known facts, assumptions, and missing information. Avoid asking the user to repeat information already available.

Ask targeted questions only when answers could change the decision. For non-blocking unknowns, state a reasonable assumption and explain how the recommendation depends on it.

## Requirements to Establish

Use the relevant items below; this is not a mandatory questionnaire.

| Area | Useful evidence or questions |
|------|------------------------------|
| Behavior and domain | Core workflows, business invariants, responsibility boundaries, ownership of data |
| Workload | Peak request rate, concurrency, request mix, data growth, payload sizes, expensive operations |
| Latency | Response-time and freshness targets for specific workflows |
| Reliability | Availability needs, acceptable failure modes, recovery-time and data-loss limits |
| Consistency | Which operations must be atomic? Where are stale reads or delayed processing acceptable? |
| Security | Trust boundaries, authorization, sensitive data, isolation, audit and retention requirements |
| Operations | Deployment environment, monitoring, incident response, rollback and backup capabilities |
| Delivery | Existing stack, integrations, team expertise, deadline, budget and maintenance capacity |
| Evolution | Expected changes, compatibility obligations, migration constraints and independent release needs |

Total users alone do not describe workload. Likewise, a large team or enterprise label does not establish a need for distributed deployment.

## Discovery Output

Summarize the decision being made, its current context, the few requirements that distinguish options, and any assumptions needing validation. Make targets measurable when evidence is available; do not invent precision.
