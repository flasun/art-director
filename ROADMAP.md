# Roadmap

## v0 — the skeleton (this PR)

- [x] Project = git directory: `brief.md`, `direction.md`, `shots/`
- [x] Style Contract format with YAML frontmatter + parser/serializer
- [x] Forced-choice creative interview → drafted `direction.md`
- [x] Contract → prompt compilation with per-backend dialect guidance
- [x] Replicate backend (Flux schnell drafts, 1.1-pro finals)
- [x] Generate → critique → revise loop with hard budgets
- [x] Deterministic checks: CIELAB palette adherence, aspect ratio
- [x] Vision critique with pairwise ranking (Claude structured outputs)
- [x] Decision log (`decisions.jsonl`), shoot log (`critique.md`), annotated `contact-sheet.html`
- [x] Standalone `critique` command for existing assets
- [x] Unit tests for the deterministic core

## v1 — a director you can argue with

- [ ] `--feedback "more like r2-c3"`: diff what makes a candidate distinct, amend the contract
- [ ] Render probe image pairs during the interview (visual forced choice, not textual)
- [ ] Per-round seed pinning and `--seed` reuse for variations on a winner
- [ ] OCR/text-artifact deterministic check; contrast check
- [ ] Cost accounting in the decision log (tokens + image spend per shot)
- [ ] Resumable shoots; re-critique without re-rendering

## v2 — sets, not shots

- [ ] Campaign mode: N shots sharing one contract, set-level consistency audit (pairwise drift, palette histograms across the set)
- [ ] Reference images / image conditioning where backends support it (character & product sheets)
- [ ] More backends behind the dialect adapter: gpt-image, SDXL/ComfyUI, fal
- [ ] Cross-model re-rendering: same contract, new backend, automated diff report

## v3 — the creative department

- [ ] Taste memory across projects (a personal style prior, learned from vetoes)
- [ ] Web UI over the same file format (the repo stays the database)
- [ ] Figma export: push finals + the direction doc into a Figma library
- [ ] UI art direction module: screenshot audit against a Style Contract for interfaces (design tokens as the contract)
