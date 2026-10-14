---
name: designing-terminal-ui
description: "Framework-independent visual and interaction design for terminal interfaces. Use when designing or reviewing TUI layouts, CLI output, information hierarchy, themes, keyboard affordances, or terminal accessibility. Focuses on presentation and usability; use framework-specific guidance for component selection and implementation lifecycle."
---

# Terminal Interface Design

## Establish the Context

- Inspect the existing interface, project conventions, user requirements, and rendering framework before proposing a design.
- Identify the main tasks, important information, expected terminal sizes, and whether the output is interactive, read by people, or consumed by scripts.
- Preserve an established visual language unless a redesign is requested. Choose a coherent direction suited to the workflow; distinctive styling is optional, clarity is essential.
- Keep this skill focused on presentation and interaction. Defer component APIs, state architecture, and rendering lifecycle to the chosen framework's guidance. For Bubble Tea, use `bubbletea-designer` for those decisions.

## CLI Output Versus Interactive TUIs

| Context | Design priorities |
|---------|-------------------|
| Human-readable command output | Concise summaries, scannable grouping, meaningful labels, readable plain-text fallback |
| Piped or machine-readable output | Stable documented format; no decorative text, animation, prompts, or terminal-control sequences in the data stream |
| Interactive TUI | Visible focus, discoverable actions, responsive layout, clear state changes, and predictable navigation |

Respect explicit output modes and color preferences. Use terminal capability detection as a default, not a replacement for user choices. Keep diagnostics and progress separate from machine-readable results, following the command's output contract. Preserve useful error messages in non-interactive use.

## Hierarchy and Layout

- Make the primary task and current state apparent. Distinguish content, navigation, status, and available actions with consistent alignment, spacing, and emphasis.
- Match density to the task: compact comparisons for dashboards, focused prompts for forms. Use panels, columns, or borders only when they clarify grouping; plain text and single-column layouts are valid choices.
- Allocate space by importance. On narrow or short terminals, hide secondary detail, stack panes, or offer a focused view while keeping essential actions visible.
- Define wrapping, truncation, scrolling, and how users reveal omitted values. Preserve exact identifiers and paths when users need to copy them.
- For tables and charts, show labels, units, and relevant scale or time range. Align comparable values and distinguish missing or stale data from zero.

## Color, Text, and Symbols

- Use a small palette with consistent semantic roles such as primary, secondary, focus, warning, and error. Familiar status colors are useful when accompanied by labels or symbols.
- Do not communicate status, selection, or focus through color alone. Keep essential text readable without relying on dim styling or a specific background color.
- Check the design on light and dark terminal backgrounds and with reduced or disabled color. Respect the project's color controls, including `NO_COLOR` where supported.
- Use text styling to establish hierarchy. Decorative banners, letter spacing, gradients, and textures should earn their space rather than become defaults.
- Treat Unicode symbols and font-specific icons as enhancements. Provide readable ASCII or text alternatives when glyph support is uncertain; never require a special font to understand an action.
- Measure and align using terminal display width through the rendering framework, accounting for styles and wide characters rather than counting bytes.

## Interaction and Feedback

- Make primary actions accessible by keyboard. Show active focus, selection, navigation context, and relevant shortcuts; distinguish focus from selected data.
- Keep shortcuts consistent and avoid capturing printable input intended for text fields. Make back, cancel, close, and quit behavior clear, especially around unsaved work.
- Design loading, empty, error, retry, cancellation, and completion states. State what happened and what the user can do next.
- Use progress bars for measurable completion and activity indicators for unknown duration. Keep status text meaningful when animation is unavailable.
- Use motion to communicate work or state changes. Avoid typing delays, decorative transitions, and excessive redraws that interrupt reading; provide a static alternative when needed.
- Do not assume mouse input, color, or continuous animation is available. Make help and recovery actions discoverable without them.

## Review and Delivery

- Scale the output to the request: a focused recommendation for a small change; a compact layout sketch, semantic style choices, key interactions, and fallback behavior for a broader design.
- Prefer existing framework components and styling facilities to custom widgets or raw terminal-control sequences. Do not replace a working component solely to achieve a visual theme.
- Review representative content: long labels, empty data, errors, wide Unicode, narrow terminals, and monochrome output. For CLIs, also check redirected output and explicit machine-readable modes where relevant.
- For implementation, inspect actual rendered output when possible and run relevant project checks. Distinguish a proposed design from verified rendering and interaction behavior; report limitations honestly.
