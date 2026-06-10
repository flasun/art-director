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

- [x] `amend "<feedback>" --ref <image>`: fold feedback into the contract as a versioned amendment, changing only what the feedback demands
- [x] Render probe image pairs during the interview (`interview --probes` → `probes.html`)
- [x] Per-round seed pinning and `--seed` reuse to reproduce a shoot
- [x] Tonal key + contrast measured stats fed into critique
- [ ] OCR/text-artifact deterministic check (needs a lightweight OCR option)
- [x] Cost accounting per shoot (director tokens + render counts in `critique.md` and the console)
- [x] Shot manifest (`shot.json`) + `recritique <shotDir>`: re-judge a shoot against the amended contract without re-rendering

## v2 — sets, not shots

- [x] Campaign mode: `campaign <shotsFile>` shoots N descriptions under one contract, then audits the set
- [x] Set-level consistency audit: pairwise CIELAB palette drift + tonal deviation (measured) feeding a directed set critique with verdict/outliers/advice; standalone `audit <shotDirs...>`
- [x] Reference images: `shoot --ref` / `campaign --ref` condition generation (per-family Flux input mapping, auto-downscaled data URIs, draft-model swap) and make reference fidelity a hard critique criterion; recorded in `shot.json` so `recritique` reuses them
- [ ] More backends behind the dialect adapter: gpt-image, SDXL/ComfyUI, fal
- [ ] Cross-model re-rendering: same contract, new backend, automated diff report

## v3 — the creative department

- [ ] Taste memory across projects (a personal style prior, learned from vetoes)
- [ ] Web UI over the same file format (the repo stays the database)
- [ ] Figma export: push finals + the direction doc into a Figma library
- [ ] UI art direction module: screenshot audit against a Style Contract for interfaces (design tokens as the contract)
