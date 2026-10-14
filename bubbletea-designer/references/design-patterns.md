# Composition Patterns

Use the smallest composition that meets the interaction needs. Reuse Bubbles models for the underlying widgets; custom code should primarily coordinate state, layout, and domain actions.

## Single Screen

Use a parent model with only the required components. A list may already provide filtering, pagination, help, and status feedback; enable or style those features before introducing more models. Avoid a separate navigation framework for a single focused task.

## Multiple Screens or Tabs

Represent the active screen explicitly and route input to it. Decide which screens retain state when inactive and which operations continue in the background. Initialize screens and their commands deliberately when first shown or activated.

Render tab labels with the project's layout and styling tools, or reuse an existing project tab component. Tabs are a navigation pattern, not an assumed Bubbles package. Treat screen transitions and async-result routing separately: hidden screens may still own pending results.

## Master-Detail or Multiple Panes

Compose `list` or `table` with a `viewport` or another appropriate detail component. Track focus independently from selection. Recalculate pane dimensions on resize and collapse optional panes in a narrow terminal.

Load expensive details asynchronously. Associate results with the selection that requested them, reject stale results, and show loading, empty, and error states. Use bounded previews rather than reading arbitrarily large files into the model.

## Forms and Wizards

Reuse `textinput` and `textarea` for editing. Add only the navigation and validation state the workflow requires. Preserve startup and focus commands, blur the previous field, and route input to the active field.

Define step transitions, validation timing, back navigation, and how values survive changing steps. Keep validation errors actionable and distinguish field editing from submission or cancellation. Do not let global printable-key shortcuts intercept entered text.

## Background Work and Progress

Use `spinner` when progress is unknown and `progress` when a real fraction or count is available. Do not display fabricated percentages. Reuse a list's existing activity indicator if sufficient.

Represent operation state explicitly and return completion or error messages from commands. Define concurrency limits, queue ordering where needed, cancellation, retry semantics, and terminal states. Keep animation messages flowing while work runs; stop scheduling them when no longer needed.

## Search and Streaming Views

Compose `viewport` with `textinput` when separate search entry is needed; prefer built-in list filtering for item selection. Define search mode, match navigation, and behavior when content changes.

For large or streaming data, bound memory and update frequency. Decide whether new content follows the tail or preserves the user's scroll position. Debounce expensive search when needed and reject results from superseded queries.
