---
name: bubbletea-designer
description: "Design and plan Bubble Tea terminal applications using existing Bubbles components wherever possible. Use when selecting components, designing layouts and keyboard interactions, composing models, planning asynchronous work, or structuring a new or existing Bubble Tea TUI."
---

# Bubble Tea TUI Designer

## Reuse Bubbles First

Before designing a custom widget, inspect the Bubbles components available for the project's version. Prefer configuring, styling, and composing them over rebuilding text editing, lists, tables, scrolling, file selection, progress, or keyboard help. This preserves existing input handling and reduces custom state and maintenance.

Reuse existing project components as well. Introduce custom behavior only for a concrete capability gap; state why configuration or composition cannot meet the requirement. Implement the missing behavior around reusable components where practical. Do not add components merely because they are common in an application archetype.

## Workflow

1. **Inspect context.** Read repository instructions, `go.mod`, existing models, keymaps, styles, and tests. Establish the Go, Bubble Tea, Bubbles, and Lip Gloss versions before proposing API calls. Preserve existing versions unless migration is requested.
2. **Define interactions.** Identify the main tasks, data sources, focus order, keybindings, and loading, empty, error, and completion states. Ask only about unknowns that would materially change the design.
3. **Select components.** Read `references/bubbletea-components-guide.md`. For each UI responsibility, choose a suitable existing component or explain the gap that requires custom code. Check for built-in features before adding separate search, pagination, spinner, or help models.
4. **Plan composition.** Define state ownership, active screen and focus, message routing, commands, and terminal-size handling. Read `references/design-patterns.md` for the relevant composition pattern and `references/architecture-best-practices.md` for lifecycle details.
5. **Plan delivery.** Start with one working interaction, then add required behavior and failure handling. Adapt to the existing project rather than generating a fixed setup plan. Use `references/example-designs.md` for illustrative designs, not default component bundles.
6. **Verify at the appropriate level.** For a design, trace representative messages and check APIs against version-matched documentation. For implementation, format, build, and run relevant tests and repository checks. Report what was actually verified; a design checklist does not establish that code compiles or works interactively.

## Version and Source Discipline

- Consult local dependency source or documentation for the selected versions. If needed, use official package docs and examples from matching release tags; current upstream examples may target a different major version.
- Bubble Tea v1 commonly uses `github.com/charmbracelet/bubbletea` and `View() string`; v2 uses `charm.land/bubbletea/v2` and `View() tea.View`, with changed key messages and terminal configuration. Match Bubbles and Lip Gloss APIs too; do not mix generations.
- Verify constructors, sizing methods, focus commands, and animation messages per component. Do not assume all components expose `Init()` or the same lifecycle.
- Distinguish Bubbles packages from examples and application patterns. Do not invent packages or types such as `tabs.Model` from an example named “tabs.”
- No external example inventory or generator is required. Cite only example files and symbols actually inspected; use official docs when local examples are unavailable.

## Design Output

Scale the response to the request. A component question needs a recommendation and rationale. A broader design should explain:

- The layout, key interactions, and important UI states.
- Component choices, reused features, and any justified custom behavior.
- Model ownership, focus and message routing, and asynchronous work and cancellation.
- Resize behavior, implementation order, and meaningful verification steps.

Include a small diagram or code sketch only when it clarifies the design. Label illustrative sketches; verify any scaffold presented as runnable. Avoid unsupported implementation-time estimates and large generated reports.
