# Architecture Patterns Reference

Use this as a shortlist of candidates. Benefits and costs depend on the implementation and workload; validate them against the requirements.

## Data and Domain

| Candidate | Potential benefit | Cost or caution |
|-----------|-------------------|-----------------|
| Direct queries / ORM | Straightforward persistence using existing facilities | Keep persistence details from spreading into unrelated responsibilities |
| Active Record | Convenient persistence attached to records | Couples model behavior to persistence |
| Repository | Domain-facing boundary for cohesive persistence operations | Extra indirection; avoid generic wrappers that add no meaning |
| Unit of Work | Coordinates changes within a business transaction | May duplicate existing transaction facilities |
| Data Mapper | Separates domain objects from persistence mapping | More mapping code and maintenance |
| Transaction Script | Expresses straightforward workflows directly | Shared invariants can become scattered as rules grow |
| Domain Model | Encapsulates behavior and invariants | Requires careful modeling; simple CRUD may need less structure |
| DDD techniques | Shared language, bounded contexts, explicit invariants | Require domain understanding and ongoing refinement |

## Structure and Coordination

| Candidate | Potential benefit | Cost or caution |
|-----------|-------------------|-----------------|
| Modular monolith | Clear logical boundaries with simpler deployment and local transactions | Shared deployment and resources; enforce module boundaries |
| Microservices | Independent deployment, scaling, or isolation where needed | Distributed failures, data ownership, compatibility, and operational overhead |
| Ports and adapters | Isolates domain behavior from external systems | Can become redundant interfaces and forwarding layers |
| Event-driven integration | Decouples producers and consumers and supports asynchronous workflows | Delivery semantics, ordering, replay, idempotency, and observability |
| CQRS | Tailors read and write models to different needs | Additional models; separate stores may require synchronization |
| Event sourcing | Authoritative event history with state reconstructed by replay | Event evolution, replay correctness, projections, and retention constraints |
| Saga | Coordinates multi-resource workflows with compensating actions | Partial failure and compensation may be visible or irreversible |

## API and Client Communication

| Candidate | Potential benefit | Cost or caution |
|-----------|-------------------|-----------------|
| HTTP resource APIs | Familiar request/response semantics and ecosystem support | Design authorization, pagination, caching, and compatibility deliberately |
| GraphQL | Client-selected data shapes across related resources | Query cost control, field authorization, and caching design |
| gRPC | Typed service contracts and streaming | Evaluate client support, proxies, tooling, and contract evolution |
| Polling | Simple periodic client updates | Freshness versus repeated request cost |
| Server-sent events | Server-to-client updates over a persistent HTTP connection | Reconnection, buffering, and connection capacity |
| WebSocket | Bidirectional persistent communication | Connection lifecycle, backpressure, authorization, and recovery |

These choices can coexist. Client transport does not dictate backend deployment topology or consistency guarantees.
