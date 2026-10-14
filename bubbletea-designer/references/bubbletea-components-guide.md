# Reusing Bubbles Components

## Selection Rule

Inspect the project's Bubbles version and existing components before writing custom UI primitives. Prefer these options in order: reuse an existing project component, configure a Bubbles component, compose or wrap Bubbles components, then implement a specific missing capability.

Verify the selected version's exported API and examples. The names below identify component packages, not a promise that every release has identical types or methods.

| UI responsibility | Start with | Check before adding custom code |
|-------------------|------------|---------------------------------|
| Single-line input or search query | `textinput` | Editing, cursor behavior, paste, suggestions, validation hooks, focus |
| Multi-line input | `textarea` | Wrapping, editing, scrolling, paste, dimensions |
| Browsing or selecting items | `list` | Filtering, pagination, delegates, built-in help, spinner, and status messages |
| Tabular selection | `table` | Columns, rows, selection, styles, focus, sizing; implement sorting only if needed and absent |
| Scrollable content | `viewport` | Scrolling, content updates, dimensions, keybindings; bound the backing data separately |
| File selection | `filepicker` | Directory traversal, extension filtering, selection and error handling |
| Work with measurable completion | `progress` | Supported animation and percentage update API |
| Work with unknown completion | `spinner` | Tick startup, message routing, stopping when work finishes |
| Page navigation | `paginator` | Whether the chosen list already provides pagination |
| Countdown or elapsed duration | `timer` / `stopwatch` | Startup, tick lifecycle, stop and reset behavior |
| Keybinding definitions and help | `key` + `help` | Shared bindings, enabled actions, compact and expanded help |

Use Lip Gloss for styling and layout around the components. Styling requirements alone rarely justify replacing a working input or list implementation.

## Composition Versus New Packages

Tabs, multi-screen navigation, master-detail panes, dropdowns, and wizards are application patterns. Build them from verified components and explicit application state. An upstream example name is not a package API.

For example, a searchable selector may use `list` filtering or `textinput` suggestions rather than a new autocomplete engine. A wizard may compose several inputs with step state; a tab bar may render labels while the application routes focus and messages.

## Integration Checklist

- Construct and configure child models using their documented APIs; initialize persistent fields in a constructor or another state transition that returns the updated model.
- Return startup commands required by the selected components. Preserve commands returned by focus operations and child updates, including cursor blink and animation scheduling.
- Assign the updated child model back to its owner. Route keys to the focused component and non-key messages to the components that own the relevant operation or animation.
- Combine independent commands with `tea.Batch`; do not rely on batch ordering. For dependent work, use the version's sequencing API or chain completion messages.
- Resize components through the selected version's API, accounting for layout borders, padding, headers, and footers.

## Official Sources

- [Bubbles catalog and source](https://github.com/charmbracelet/bubbles)
- [Bubble Tea examples](https://github.com/charmbracelet/bubbletea/tree/main/examples)
- [Bubble Tea v2 upgrade guide](https://github.com/charmbracelet/bubbletea/blob/main/UPGRADE_GUIDE_V2.md)
- [Bubbles v2 upgrade guide](https://github.com/charmbracelet/bubbles/blob/main/UPGRADE_GUIDE_V2.md)

These links point to upstream documentation. Select the matching release tag or version-specific package documentation before adapting code to an existing project.
