---
name: golang
description: |
  Guides Go implementation and review with idiomatic error handling, interface design, concurrency, testing, and measured performance optimization. Includes a practical verification workflow and coding style preferences.
  Use when: writing Go code (.go files), designing interfaces and struct types, implementing concurrent patterns (goroutines/channels), handling errors idiomatically, writing table-driven tests, creating Go modules, optimizing performance-critical code, managing dependencies with go.mod, implementing HTTP servers and clients, working with context propagation, or designing package APIs for public libraries.
---

# Go Coding Standards

## Implementation Workflow

1. Read repository instructions, `go.mod`, relevant code, and existing tests before changing code. For workspaces, also inspect `go.work` and the affected modules.
2. Respect the declared Go version, toolchain, existing dependencies, and repository architecture. Use APIs available to the supported version; do not upgrade the toolchain or dependencies incidentally.
3. Make a focused change that fits existing code. Apply the style preferences below when the repository has no established convention.
4. Format changed Go files with `gofmt` (or the repository's configured formatter).
5. Run relevant tests first, then `go test ./...` and `go vet ./...` in the affected modules where practical. Run `go test -race` for affected concurrent code when supported, plus required repository checks.
6. Report the resulting behavior, checks performed, and any checks that could not run. Do not claim verification that was not performed.

## Basic Principles

### One Function, One Responsibility

- If function name connects with "and" or "or", it's a signal to split
- If test cases are needed for each if branch, it's a signal to split

### Conditional and Loop Depth Limited to 2 Levels

- Minimize depth using early return whenever possible
- If still heavy, extract into separate functions

### Make Function Side Effects Explicit

- Example: If `getUser` also runs `updateLastAccess()`, specify it in the function name

### Convert Magic Numbers/Strings to Constants When Possible

- Declare at the top of the file where used
- Consider separating into a constants file if there are many

### Function Order by Call Order

- Follow Go's clear conventions if they exist
- Otherwise, order top-to-bottom for easy reading by call order

### Review External Libraries for Complex Implementations

- Prefer standard library packages when they meet the requirements clearly and reliably
- Keep existing library choices unless there is a concrete reason to change them
- Consider external libraries when they materially improve correctness, security, maintainability, performance, or handling of platform differences and edge cases
- Evaluate compatibility, maintenance, and dependency cost before adding a library; popularity or complex logic alone is not sufficient reason

### Modularization (Prevent Code Duplication and Pattern Repetition)

- Encourage modularization around meaningful responsibilities and stable domain boundaries
- Extract repeated behavior when it represents the same concept and should change together; similar syntax alone does not justify a shared abstraction
- Allow modest duplication when extraction would obscure intent, couple unrelated code, or require speculative generalization
- Keep helpers and abstractions small, cohesive, and grounded in actual use
- Choose the smallest useful boundary:
  - Function or method: Isolate a coherent operation or shared behavior
  - File within the same package: Organize related code without changing its API boundary
  - Package: Separate a cohesive responsibility with a clear API and sensible dependency direction; multiple files alone do not justify a new package
  - Module: Use when independent distribution, versioning, or dependency management is needed, not merely because code is reused

### Variable and Function Names

- Clear purpose while being concise
- Forbid abbreviations outside industry standards (id, api, db, err, etc.)
- Don't repeat context from the parent scope
- Boolean variables use `is`, `has`, `should` prefixes
- Function names are verbs or verb+noun forms
- Plural rules:
  - Pure arrays/slices: "s" suffix (`users`)
  - Wrapped struct: "list" suffix (`userList`)
  - Specific data structure: Explicit (`userSet`, `userMap`)
  - Already plural words: Use as-is

### Field Order

- Alphabetically ascending by default
- Maintain consistency in usage

### Error Handling

- Error handling level: Handle where meaningful response is possible
- Error messages: Technical details for logs, actionable guidance for users
- Error classification: Distinguish between expected and unexpected errors
- Error propagation: Add useful operation context without repeating the same information at every layer
- Use a fallback only when it preserves the operation's documented behavior; otherwise return the error
- Use `fmt.Errorf("operation: %w", err)` when callers should be able to inspect the underlying error. Wrapping an error makes it part of the API contract
- Use `errors.Is` for sentinel errors and `errors.As` for typed errors, rather than comparing error strings
- Use `%v` for logging or when deliberately preserving only the error text. It prevents unwrapping but does not hide sensitive details
- At user-facing boundaries, map internal errors to appropriate messages or responses and retain diagnostic details in logs; do not rely on `%v` for sanitization
- Handle an error or return it; avoid logging it at every layer and producing duplicate reports
- Never ignore return errors from functions; handle them explicitly
- Sentinel errors: For expected conditions that callers must handle, use `var ErrNotFound = errors.New("not found")`

## File Structure

### Element Order in File

1. package declaration
2. import statements (grouped)
3. Constant definitions (const)
4. Variable definitions (var)
5. Type/Interface/Struct definitions
6. Constructor functions (New\*)
7. Methods (grouped by receiver type, alphabetically ordered)
8. Helper functions (alphabetically ordered)

## Interfaces and Structs

### Interface Definition Location

- Define interfaces in the package that uses them (Accept interfaces, return structs)
- Only separate shared interfaces used by multiple packages

### Pointer Receiver Rules

- Use pointer receivers when methods mutate receiver state or copying would violate the type's semantics
- Types containing synchronization primitives such as `sync.Mutex` must not be copied after use; use pointer receivers and avoid copying them elsewhere too
- Consider actual copy cost for large structs or arrays, not the number of fields
- Use value receivers for small, naturally value-like types when copying is safe and intentional
- Keep receiver choices consistent for a type, especially when any method requires a pointer receiver; consider the resulting method sets and interface satisfaction

## Context Usage

### Context Parameter

- When an operation accepts a context, pass `ctx context.Context` as the first parameter
- Propagate the caller's context through request-scoped work and outgoing calls; do not replace it with `context.Background()` and lose cancellation or deadlines
- Use `context.Background()` for genuinely independent root work, including startup and tests. Use `context.TODO()` only as an explicit placeholder when the appropriate context is not yet known
- Call cancellation functions returned by `context.WithCancel`, `WithTimeout`, or `WithDeadline` on every path, usually with `defer cancel()`
- Do not pass nil contexts or store request contexts in structs; pass them to the methods that need them
- Use context values for request-scoped metadata, not optional parameters or dependencies

## Concurrency

- Prefer synchronous APIs unless concurrency is needed; callers can introduce concurrency when appropriate
- For every goroutine, make ownership, termination, and waiting explicit. Cancellation must let blocked sends, receives, and work exit
- Bound concurrency and queued work; avoid spawning an unbounded goroutine for each input
- Protect shared mutable state with suitable synchronization. Use channels for coordination or transfer of ownership and mutexes for shared state when simpler
- Assign channel-closing ownership to the sender or coordinating producer; close only after all sends have finished
- Propagate worker errors and cancellation. Consider `errgroup` when its coordination semantics add value
- Test cancellation, failure, and shutdown paths as well as successful completion; use the race detector to check exercised paths, not as proof that all races are absent

## HTTP Servers and Clients

- For new HTTP services, use `github.com/go-chi/chi/v5` for routing with standard `net/http` handlers and middleware; preserve an existing framework when working in an established project
- Set appropriate client and server timeouts for the workload; configure streaming and long-lived requests deliberately
- Attach request contexts to outgoing calls. Close response bodies on all paths and check status codes explicitly; HTTP error statuses do not automatically produce Go errors
- Bound request bodies where appropriate and validate input before acting on it
- Use graceful server shutdown with a bounded context and coordinate termination of background work

## Modules and Dependencies

- Keep dependency changes focused on the task and respect existing module replacements and vendoring conventions
- When imports change, run `go mod tidy` in the affected module as appropriate and inspect the resulting `go.mod` and `go.sum` diff for unrelated changes
- Do not introduce a separate module merely to organize packages within one project

## Performance

- Establish a representative benchmark or profile before optimizing; identify the actual bottleneck
- Use `testing.B` benchmarks and CPU, heap, or other relevant profiles to guide changes
- Compare equivalent workloads before and after a change, including allocations when relevant
- Preserve correctness and API semantics; avoid speculative pooling, concurrency, or low-level tricks without measured benefit

## Testing

- Test observable behavior, boundary conditions, and meaningful failure cases rather than mirroring implementation details
- Use table-driven tests and named `t.Run` subtests when multiple cases share the same setup and assertions
- Use `t.Helper()` for test helpers and `t.Cleanup()` for resource cleanup; use `t.Fatal` when continuing would invalidate the test
- Prefer deterministic synchronization to sleeps in concurrent tests. Use `httptest` for HTTP behavior and fuzzing when parsing or input handling warrants it
- Use `t.Parallel()` only when cases safely isolate mutable state and resources

### Testing Libraries

- Prefer standard library's if + t.Errorf over assertion libraries like testify
- Prefer manual mocking over gomock

## Forbidden Practices

### init() Functions

- Generally forbidden. Prefer explicit initialization functions
- Use main() for application entry point initialization and dependency injection

## Package Structure

### internal Package

- Actively use for libraries, use only when necessary for applications

## Recommended Libraries

Use standard library packages by default where they meet the requirements. The options below are preferences for cases where a library adds clear value, not dependencies to add automatically. Check the selected library's compatibility and installation requirements before adopting it.

- HTTP services: `github.com/go-chi/chi/v5`
- DB: Bun, SQLBoiler (when managing migrations externally)
- Logging: slog
- CLI: cobra, bubbletea
- Utilities: samber/lo, golang.org/x/sync
- Configuration: koanf (viper if cobra integration needed)
- Validation: go-playground/validator/v10
- Scheduling: github.com/go-co-op/gocron
- Image processing: github.com/h2non/bimg
