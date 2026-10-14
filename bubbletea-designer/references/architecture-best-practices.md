# Model Lifecycle and Interaction

## State Ownership

Keep application data, navigation, and operation status in an appropriate owner; let child components manage their own editing, selection, and scrolling state. Group related state in cohesive models rather than forcing every field into one flat struct. Do not maintain competing copies of a component's state without a concrete need.

Construct persistent component state before the program starts or in an update that returns the modified model. Assignments made inside a value-receiver `Init()` change a copy; `Init()` returns startup commands, not an updated model. Use each component's documented startup behavior rather than calling a presumed common `Init()` method.

## Messages and Commands

- Keep `Update()` responsive. Put blocking file, network, and subprocess work in commands and return typed result or error messages.
- Capture the inputs a command needs. Do not mutate model state from a command or background goroutine; apply results through `Update()`.
- Save each updated child model and return its command. Losing commands can stop animations, cursor blinking, or future results.
- Use `tea.Batch` only for independent work; its commands have no guaranteed completion order. Express dependencies through completion messages or an appropriate sequencing API.
- Distinguish spinner ticks from progress animation frames and route them to their owners, including when those owners are not focused.
- Give asynchronous operations cancellation and shutdown behavior. Use request or generation IDs when late results could overwrite newer selections or searches.
- For streaming work, define bounded buffering, how the next message is requested, and how producers exit. Bound retained logs and preview sizes independently of the visible viewport.

## Focus and Key Routing

Define one active input destination per interaction context. Route editing keys to the focused widget; route operation and animation messages independently of focus. A modal should capture relevant input while leaving necessary background work running.

Handle genuinely global shortcuts explicitly. Do not bind printable keys such as `q`, `j`, `k`, or `/` globally when they must be usable in a text field. Separate “close modal,” “cancel operation,” “go back,” and “quit,” and define the policy for unsaved work.

Reuse `key` bindings for help so that displayed shortcuts match enabled actions. Avoid forwarding the same consumed key to multiple components.

## Rendering and Resize

Keep `View()` deterministic and free of I/O or state mutation. If profiling justifies a render cache, update the cache in a state transition and invalidate it when data, dimensions, or styles change. A value-receiver `View()` cannot persist cache-field assignments.

Handle window-size messages and calculate available content space after borders, padding, headers, and footers. Clamp dimensions to valid values for the component API and provide a narrow-terminal fallback. Use terminal display-width-aware measurement for styled text and wide Unicode characters rather than byte lengths.

Choose inline versus alternate-screen behavior deliberately using the selected Bubble Tea version. Avoid direct terminal writes that interfere with rendering; use supported output or logging facilities, handling file-open errors and closing owned log files.

## User States and Verification

Make loading, empty, error, retry, cancellation, and completion behavior explicit. Keep keyboard navigation usable without a mouse and provide visible focus and selection indicators beyond color alone.

For implementation, verify:

- Model transitions for navigation, focus changes, selection, errors, and cancellation.
- Child commands survive routing; timers and animations start and stop correctly.
- Late asynchronous results cannot overwrite newer state.
- Resizing, very small terminals, empty data, and long or wide text behave sensibly.
- Representative interaction flows work in a terminal when available. View snapshots can check rendering but do not prove keyboard or command behavior.

Format and build against the actual dependencies, run relevant tests and required checks, and use the race detector when concurrency changes warrant it. Clearly distinguish static review, compilation, automated tests, and manual terminal checks.
