# Pattern Selection

## Before Introducing a Pattern

- What concrete problem does it solve, and what evidence establishes that problem?
- Can the current design or a smaller change meet the requirement?
- What implementation, operational, and migration costs does it introduce?
- What would make us reconsider it, and how expensive is that change?

Patterns are candidates, not consequences of a single label such as “complex” or “real-time.” Evaluate the relevant concerns separately.

## Data Access and Transactions

Use direct queries or an existing ORM when they express the required operations clearly. Consider repositories when a meaningful domain-facing persistence boundary reduces coupling or centralizes shared behavior. Testing needs or complex queries alone do not require a repository layer.

Establish transaction boundaries from business invariants. Prefer existing database or ORM transaction facilities when sufficient; consider Unit of Work when coordinating changes within one business transaction needs additional structure. Do not promise that a generic abstraction makes database replacement cheap.

## Domain Logic

Use focused procedural operations for straightforward workflows. Consider domain models, value objects, and explicit aggregates where they clarify behavior and enforce invariants. Use domain-driven design techniques where shared domain understanding and bounded contexts improve the model; avoid treating “full DDD” as a maturity level or mandatory bundle.

## Deployment Boundaries

Keep cohesive modules in one deployable system when that meets delivery, isolation, and scaling requirements. Consider separate services for demonstrated needs such as independent release, resource scaling, failure isolation, or distinct trust boundaries.

Before splitting, evaluate data ownership, cross-service transactions, network failures, API compatibility, deployment automation, monitoring, incident response, and ongoing cost. Compare simpler options such as optimizing a bottleneck or isolating background workers. Team size is context, not an eligibility rule.

## Messaging and Client Updates

Decide separately whether work must complete synchronously, whether durable asynchronous processing is needed, and how clients receive updates. Polling, server-sent events, and WebSockets serve different client interaction needs; none automatically requires a message broker.

Consider messaging for durable background work, buffering bursts, or decoupled consumers. Define delivery and ordering requirements, idempotency, retries, backlog limits, failure recovery, and acceptable staleness. Strong consistency requirements may still apply to specific writes in a system that also publishes events.

## Specialized Patterns

- Consider CQRS when distinct read and write models provide a concrete benefit. First investigate query design, indexes, caching, or read replicas when the problem is performance.
- Consider event sourcing when the event history must be the authoritative state and replay semantics are needed. An audit log can satisfy audit needs without replacing the state model; it is not equivalent to event sourcing.
- Consider ports and adapters when boundaries around external systems improve change isolation or testing. Avoid layers and interfaces that merely forward calls.
- Consider sagas only when a workflow spans independent transactional resources and compensating actions are meaningful. Document partial failure and recovery; compensation is not an atomic rollback.
