# Writing the appediff `content.js`

`tmp/appediff/data/content.js` is the only hand-written file. It has the same
shape as an appedia's content (see `appedia-content-guide.md`) plus `review`
and change marks on flow steps. An appediff shows no rules, tasks, tour or
glossary: leave them out.
The appedia guide's optional `sources.refs` and `sources.files` are accepted
here too; references can point at removed symbols because the diff model holds
both revisions. They help select affected flows when seeding from an appedia.

Rebuild after each step:
`node <skill>/scripts/appediff.mjs --repo <repo> --lang <lang> [--infra <dir>] --rebuild`.

## 0. What to read first

1. The change: `git log <base>..<head>` (the messages), then the diff, file by
   file. The site's Files tab shows it with syntax colours.
2. The why: the MR/ticket description if the user gives one, design or bug
   notes committed with the change, the project docs.
3. For each changed function: its callers at head (`usedBy` in the site's code
   pages) and at base for the dropped ones.
4. The tests the change adds or edits. Run them if you can (record the exact
   command and result: it goes in Evidence).

## 1. Reusing an appedia (when `appediff.mjs` seeded the content)

The seed copies package entries, the map, outside systems, the infrastructure
section and the flows whose code the change touches. Treat it as a draft:

* An appedia describes the commit it was built from. Check the touched
  packages' roles against the head code and fix what the change made untrue.
* New packages have no entry: write one. Packages the change drops need one
  too ("before the move", "before the split").
* Seeded flows describe the head (or an older state). Add the steps the change
  dropped, mark the new ones (§4), and fix anything stale.
* A seeded flow may be "touched" only because a function it calls changed
  internally; if the change doesn't affect what the flow does, remove the flow.

The result must match what you would write without the appedia: same review,
same flows, the same packages described. The appedia only saves reading.

## 2. Packages

Every package of the diff model, including the dropped ones, needs
`label` (under 20 characters), `sub` (under 29) and `role` (the build checks
it). Write roles from the reader's side: what the package owns and what it
doesn't. For untouched packages one sentence is enough; take it from the
package doc or a quick look at its files. Details: `appedia-content-guide.md` §3.
`infra.packages` does the same for the Terraform areas (§9 there).

## 3. Map

Up to ~30 packages: place them by hand in layers (`appedia-content-guide.md`
§4), so the changed ones are easy to find. Otherwise leave `map.nodes` out and
the build lays out the import graph. Unchanged packages are drawn faded, so a
crowded map still reads.

## 4. Flows

Write a flow for every behaviour the change touches: user-visible actions,
background work, startup, error paths. A behaviour the change adds gets a new
flow; one it drops keeps its flow, every step marked dropped.

**Old and new steps together, in execution order.** A step is
`[from, to, kind, label, note, ref, mark]`:

| mark | meaning | drawn |
|---|---|---|
| `"+"` | a call the change adds | green |
| `"-"` | a call the change drops | red, struck through |
| `"~"` | the call is still made, but differently (arguments, condition, error handling) | striped row |
| `""` | unchanged, even if its ref is new | plain |
| left out | derived: a step whose ref is new is `+`, dropped is `-`; a step whose ref changed inside gets a striped row | |

Before = the steps without `+`; After = the steps without `-`. Order the steps
so both read as the real sequence: put the dropped call where it used to
happen, its replacement right after it.

When the same ref stays but its behaviour changes in a way the reader must see
(e.g. "publish, result ignored" becomes "publish, future kept"), keep both
steps: the old one `-`, the new one `+`, both with that ref. Their notes say
what differs.

`change` on a flow is one sentence shown under its summary in the Diff view:
what the change does to this flow.

Participants are types (or `externals`); dropped types work, they are still in
the diff model. Kinds, notes and tracing: `appedia-content-guide.md` §5.

## 5. The review (the landing page)

The pr format, in `review`:

| field | what |
|---|---|
| `title` | what the change does, as a sentence |
| `ticket` | the ticket or MR id, optional |
| `lede` | the problem and the fix, two sentences |
| `summary` | the change, with the smallest visuals that make it clear |
| `evidence` | before and after: test runs, logs, screenshots described |
| `door` | `two-way` (cheap to roll back) or `one-way` (destructive, hard to reverse) |
| `doorNote` | why |
| `blast` | the blast radius in one word |
| `blastNote` | what could break, and for whom |

Skip preambles, keep prose brief, use the project's own terms.

**Summary.** Pick the smallest view that makes each point clear: a diff
sketch of the call tree or the logic (```` ```diff ````, `+`/`-` lines), a file
tree for a refactor, pseudocode for an algorithm. Place each sketch right after
the sentence it supports. Don't paste the real diff: the diffs are one click
away.

**Evidence.** Concrete: the exact test command and result, the tests that now
fail before and pass after (named), log lines before and after. Screenshots are
the best evidence for a visual change. Never claim a result you didn't see.

**Merge danger.** One-way door when the change deletes data, migrates a schema,
changes a public API or anything else that a revert doesn't undo. The blast
radius names who is affected: consumers, environments, data, performance.

**Markdown.** Paragraphs, `- ` lists, `### ` headings, ```` ``` ```` fences
(```` ```diff ```` colours `+` and `-` lines), `**bold**`, `` `code` ``,
`[label](route)` and these links:

| link | opens |
|---|---|
| `[[pkg.Type.method]]`, `[[pkg.func]]`, `[[pkg.Type]]`, `[[pkg]]` | the code, coloured by its change |
| `[[infra:area.resource]]` | a Terraform resource |
| `[[flow:id]]`, `[[flow:id.3]]` | a flow, or one of its steps (from 1) |
| `[[file:path/from/repo/root]]` | a file in the Files tab |
| `[[ref|label]]` | any of these, with your label |

The build fails on a link to something that doesn't exist.

**Explanations on diffs.** A paragraph or list item of `summary` or `evidence`
that links a ref is shown above that ref's diff, with the code block that
directly follows it. Only diffs the review links get one. So:

* Link a function where you explain its change, and link every copy that
  changes the same way (`[[a.f]] and its twins in [[b.f|b]] and [[c.f|c]]`).
* Don't link something in a paragraph that doesn't explain it: that paragraph
  would appear on its diff.
* Link the Terraform resources and the test files you talk about too
  (`[[infra:…]]`, `[[file:…]]`).

## 6. Infrastructure

With `--infra`, `content.infra` describes the Terraform areas: `packages`
(label, sub, role per area), `map`, `links` to the code. See
`appedia-content-guide.md` §9. The diff marks come from the model: nothing to
write for them.

## Checklist before delivering

- [ ] The build passes with no errors; the "appear in no flow and no review
      link" warning lists nothing that matters.
- [ ] Every claim in the review was checked; Evidence shows a real run.
- [ ] Every changed function the summary explains is linked, copies included.
- [ ] Each touched behaviour has a flow that reads correctly in Before and After.
- [ ] `smoke.mjs` reports no problems.
