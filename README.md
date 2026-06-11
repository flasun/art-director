# art-director

**Prompt tools give you a better sentence. art-director gives you a creative department.**

Image models in 2026 render superbly but have no taste and no memory: anyone can generate one pretty picture, almost nothing helps you produce *twelve coherent, on-brand assets*. art-director plays the role a human art director plays — it interviews you about the brief, compiles your taste into an explicit, versioned visual language (the **Style Contract**), then bosses an image model around through a generate → critique → revise loop until the work satisfies the contract. Every kept and killed candidate is logged with reasons, so the output is auditable creative work, not a slot machine.

The director brain is Claude (vision critique, pairwise ranking, prompt compilation). The production artist is any image model — Flux via Replicate in v0. Read [VISION.md](VISION.md) for why it's built this way and [ROADMAP.md](ROADMAP.md) for where it's going.

## How a project works

A project is just a directory in git:

```
my-campaign/
├── brief.md            # what you told the director
├── direction.md        # the Style Contract — the source of truth
├── shots/
│   └── 2026-06-09-hero-banner/
│       ├── round-1/r1-c1.png ...   # draft candidates
│       ├── round-2/...
│       ├── critique.md             # the director's reasoning, human-readable
│       ├── decisions.jsonl         # every keep/kill with reasons (machine-readable)
│       ├── shot.json               # manifest: prompts, seeds, contract version
│       ├── contact-sheet.html      # annotated grid of every round
│       └── final.png               # the shipped asset
└── campaigns/
    └── 2026-06-10-spring/
        ├── report.md               # set verdict, outliers, measured drift, spend
        └── campaign-sheet.html     # the finals side by side, outliers flagged
```

Everything is a file, so git gives you versioned creative history for free: a diff on `direction.md` is a meaningful design change, and a pull request is a creative review.

## Quickstart

```sh
git clone https://github.com/flasun/art-director && cd art-director
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY and REPLICATE_API_TOKEN

# 1. Start a project and fill in the brief
npm run dev -- init ../my-campaign
$EDITOR ../my-campaign/brief.md

# 2. The creative interview: six forced choices that pin down your taste,
#    then the director drafts direction.md (edit it — it's the source of truth)
npm run dev -- -C ../my-campaign interview

# 3. Produce a shot: generate, critique against the contract, revise, ship
npm run dev -- -C ../my-campaign shoot "hero image: pour-over coffee on a windowsill at dawn"

# Or critique images you already have
npm run dev -- -C ../my-campaign critique existing-asset.png
```

You can also `npm run build` and use the `art-director` bin directly.

## Commands

| Command | What it does |
|---|---|
| `init [dir]` | Scaffold a project with a `brief.md` template |
| `interview` | Forced-choice creative interview → drafts `direction.md`. Add `--probes` to render each choice as a pair of images (`probes.html`) |
| `shoot <description>` | Generate → critique → revise loop, then a full-quality final render. `--ref product.png` anchors the subject via image conditioning |
| `amend <feedback>` | Fold feedback into the contract: `amend "warmer light" --ref liked.png` bumps the version, changes only what the feedback demands |
| `recritique <shotDir>` | Re-judge an existing shoot against the current contract — no re-rendering. The natural follow-up to `amend` |
| `rerender <shotDir> -b <backend>` | Re-render a shipped final on another backend under the same contract, with a director comparison report |
| `campaign <shotsFile>` | Shoot every line of a file under one contract, then audit the finals as a set. `--ref` applies one reference to every shot |
| `audit <shotDirs...>` | Set-audit existing finals: do they read as one campaign? Writes `campaigns/<date>/report.md` + sheet |
| `critique <images...>` | Judge existing images against the Style Contract |
| `taste` | Show the cross-project taste profile the director learns about you (`--forget` resets it) |
| `export` | Figma-ready handoff package: pure-SVG brand board (drags into Figma as editable vectors), `direction.md`, every shipped final, and a gallery page |

Global flag: `-C, --dir <dir>` selects the project directory. `shoot` takes `--rounds` and `--candidates` to override the budget, and `--seed` to reproduce a previous shoot exactly (every shoot logs its base seed). Each shoot also records its spend — director tokens and render counts — in `critique.md`.

## Backends

The Style Contract compiles to per-model prompts through dialect adapters, so directions outlive any one image model. Select with `--backend` (or `ART_DIRECTOR_BACKEND`):

| Backend | Models | Notes |
|---|---|---|
| `replicate` (default) | Flux schnell drafts, Flux 1.1-pro finals | Seeds honored; references via image conditioning per Flux family |
| `gpt-image` | `gpt-image-1` | Instruction-following dialect; fixed render sizes are center-cropped to the contract aspect; **no seed control**; references go through the edits endpoint |
| `fal` | Flux schnell drafts, Flux-pro 1.1 finals | Same Flux dialect, different host (`FAL_KEY`); references swap in an image-to-image model |
| `comfyui` | Your local SDXL/Flux graph | Tag-style dialect; point `COMFYUI_WORKFLOW` at an API-format export containing `{{PROMPT}}`/`{{SEED}}`/`{{WIDTH}}`/`{{HEIGHT}}` placeholders — your checkpoints and LoRAs, our loop. No `--ref` yet |

`rerender shots/<dir> -b gpt-image` is the portability proof: the contract is recompiled for the new dialect, rendered once at full quality, and the director compares both finals against the contract — verdict, differences, and measured palette distance in `rerenders/<backend>/report.md`.

## How the loop judges work

Critique is half computed, half directed. Deterministic checks run first — dominant-color extraction with CIELAB distance against the contract palette, tonal key/contrast stats, plus aspect-ratio verification — and the measured numbers are handed to Claude alongside the images. Claude then critiques each candidate against the contract rubric (mood, composition, lighting, NEVER rules, technical flaws), ranks candidates by pairwise comparison, and either ships one or rewrites the prompt for the next round. Hard budgets (`ART_DIRECTOR_ROUNDS` × `ART_DIRECTOR_CANDIDATES`, default 2 × 4 drafts + 1 final) keep costs bounded.

## Taste memory

The director keeps a small cross-project style prior at `~/.art-director/taste.md` — leanings, aversions, and patterns distilled from your interview choices and amendment feedback. New projects start closer to your taste: the interview spends its questions on what's still uncertain, and drafts lean on what's known. Two rules keep it honest: **the brief always outranks taste** (a neon-cyberpunk brief won't be dragged warm by your coffee-shop history), and only durable preferences are recorded — never project subjects. It's a plain markdown file: read it with `art-director taste`, edit it by hand, reset with `taste --forget`, skip it per-run with `--no-taste`, or disable globally with `ART_DIRECTOR_TASTE=off`.

## Configuration

Set in `.env` (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Director brain (required) |
| `REPLICATE_API_TOKEN` | — | Image rendering (required for `shoot`) |
| `ART_DIRECTOR_MODEL` | `claude-opus-4-8` | Claude model for direction and critique |
| `REPLICATE_DRAFT_MODEL` | `black-forest-labs/flux-schnell` | Fast, cheap candidate renders |
| `REPLICATE_FINAL_MODEL` | `black-forest-labs/flux-1.1-pro` | Full-quality final render |
| `REPLICATE_REF_DRAFT_MODEL` | `black-forest-labs/flux-dev` | Swapped in for drafts when a `--ref` image needs conditioning support (flux-schnell can't take one) |
| `ART_DIRECTOR_BACKEND` | `replicate` | Image backend: `replicate` or `gpt-image` |
| `OPENAI_API_KEY` | — | Required only for the `gpt-image` backend |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` | Model for the `gpt-image` backend |
| `FAL_KEY` | — | Required only for the `fal` backend |
| `FAL_DRAFT_MODEL` / `FAL_FINAL_MODEL` | `fal-ai/flux/schnell` / `fal-ai/flux-pro/v1.1` | fal models |
| `FAL_REF_MODEL` | `fal-ai/flux/dev/image-to-image` | fal model swapped in when `--ref` is used |
| `COMFYUI_URL` | `http://127.0.0.1:8188` | Local ComfyUI server |
| `COMFYUI_WORKFLOW` | — | Path to your placeholder-templated API-format workflow (required for `comfyui`) |
| `ART_DIRECTOR_TASTE` | on | Set `off` to disable taste memory entirely |
| `ART_DIRECTOR_TASTE_FILE` | `~/.art-director/taste.md` | Where the taste profile lives |
| `ART_DIRECTOR_ROUNDS` | `2` | Max critique rounds per shot |
| `ART_DIRECTOR_CANDIDATES` | `4` | Candidates per round |

A default shoot makes up to ~9 image generations and ~4 Claude calls — real API costs, kept small and capped (`--rounds` tops out at 6, `--candidates` at 8).

## Resilience

Renders cost real money, so the loop is built to lose as little as possible: every backend call retries transient failures (429/5xx/network, exponential backoff, per-attempt timeouts); a failed render inside a round is logged and skipped instead of sinking the other candidates; a crash mid-shoot still writes the audit trail (`critique.md`, `decisions.jsonl`, contact sheet, manifest) for every completed round; a failed probe pair downgrades that one interview question to text; and a director response that misses its schema is retried once before failing.

## Development

```sh
npm test            # unit tests (contract parsing, color math, records)
npm run typecheck
npm run build
```

## Status

v0 — the skeleton is real and the loop runs end to end, but expect sharp edges. See [ROADMAP.md](ROADMAP.md).
