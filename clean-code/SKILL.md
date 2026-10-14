---
name: clean-code
description: "Practical, language-independent guidance for writing, reviewing, and refactoring code. Use when implementing features, fixing bugs, or simplifying code to keep changes focused, readable, and appropriately verified."
---

# Clean Code

## Before Changing Code

- Read repository instructions, relevant code, callers, and tests. Follow established project conventions and language-specific guidance.
- Identify the intended behavior and affected interfaces. Resolve routine details from context; ask when ambiguity materially affects correctness or scope.

## Design and Readability

- Choose the simplest design that meets current requirements. Avoid speculative features, dependencies, and abstractions.
- Keep functions and types focused on coherent responsibilities. Split code when it improves understanding, not to satisfy arbitrary line or argument limits.
- Encourage modularization around meaningful responsibilities and stable boundaries. Keep related code together and use the smallest useful boundary: function, file, or package.
- Extract shared behavior when it represents the same concept and should change together. Allow modest duplication when abstraction would obscure intent or couple unrelated code.
- Use names that reveal intent and fit the language and scope. Replace unexplained domain literals with meaningful names; leave obvious literals inline.
- Prefer guard clauses when they clarify control flow. Keep normal execution easy to follow.
- Make side effects and mutation clear in the API and implementation.
- Use comments to explain constraints, rationale, or non-obvious behavior, and document public APIs according to project conventions. Avoid comments that merely restate the code.

## Scope and Verification

- Keep changes focused on the task. Include necessary caller and test updates when behavior or interfaces change; avoid unrelated cleanup.
- Test observable behavior, meaningful failure paths, and relevant boundary conditions. Add regression coverage for bugs when practical.
- Use the project's available formatter, tests, and relevant static checks. Scale verification to the change and follow required repository checks.
- Read check output, fix issues introduced by the change, and rerun affected checks. Report unrelated failures separately; ask before materially expanding scope.
- Review the final diff for accidental changes and incomplete updates.
- Briefly report what changed, how it was verified, and any remaining limitations. Distinguish checks that passed from checks that could not run.
