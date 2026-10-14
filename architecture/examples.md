# Architecture Examples

These are illustrative scenarios, not verified case studies or default stacks. Each choice follows the stated requirements; different evidence may lead to different designs.

## Online Store With a Short Delivery Timeline

**Context:** An existing web framework and relational database are available. Orders require atomic updates. The team can operate one application, and independent deployment is not needed.

**Decision:** Keep one deployable application with cohesive catalog, order, and payment modules. Use existing database transaction facilities for order invariants. Integrate with a hosted payment provider and handle callbacks idempotently.

**Authentication:** Evaluate authentication and session management separately. Server-side sessions may suit the browser application; an identity provider using OpenID Connect may suit federated login. JWT is a token format that can be used within an authentication protocol, not an alternative to OAuth or OpenID Connect.

**Accepted costs:** Modules share deployment and application resources. Database code can be tested directly; a repository is introduced only if a meaningful persistence boundary is needed.

**Revisit:** A measured bottleneck or isolation requirement may justify a dedicated payment worker or service. Evaluate that boundary's data ownership and failure behavior before extraction; user counts alone do not trigger migration.

## Collaborative Product With Live Updates

**Context:** The existing application meets request latency targets. Clients need timely one-way notifications, while edits require transactional validation. Some notification work must survive application restarts.

**Decision:** Preserve the modular application and transactional write path. Evaluate server-sent events for client notifications; choose WebSockets if bidirectional communication becomes necessary. Use durable background processing for work that must survive restarts, with explicit retry and idempotency behavior.

**Accepted costs:** Notifications can arrive later than committed edits. Define freshness expectations, reconnection behavior, and how clients recover missed updates. If database commits and event publication must stay coordinated, evaluate an outbox rather than assuming a dual write is reliable.

**Revisit:** Connection-capacity measurements or missed freshness targets may justify dedicated notification infrastructure. Diagnose the bottleneck before adding a broker or splitting services.

## Compute-Heavy Processing With Independent Releases

**Context:** Processing has a distinct resource profile, needs independent releases, and must be isolated from interactive request failures. The team has automated deployments, monitoring, and incident response. Job completion may be asynchronous.

**Decision:** Extract processing behind a versioned contract and durable job queue while retaining other modules together. Define ownership of job state, bounded concurrency, idempotent retries, failure recovery, and job-status access.

**Accepted costs:** Queue operations, contract compatibility, delayed completion, and failure diagnosis across components require ongoing work. Avoid assuming that service mesh, Kubernetes, multiple database technologies, or CQRS are necessary.

**Validation and migration:** Measure representative workloads and failure recovery against agreed targets. Plan how accepted jobs finish during rollout or rollback, including schema and contract compatibility.

**Revisit:** If isolation and deployment benefits do not justify operating costs, reconsider the split. Introduce further services only for their own demonstrated needs.
