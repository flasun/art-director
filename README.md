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
└── shots/
    └── 2026-06-09-hero-banner/
        ├── round-1/r1-c1.png ...   # draft candidates
        ├── round-2/...
        ├── critique.md             # the director's reasoning, human-readable
        ├── decisions.jsonl         # every keep/kill with reasons (machine-readable)
        ├── contact-sheet.html      # annotated grid of every round
        └── final.png               # the shipped asset
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
| `interview` | Forced-choice creative interview → drafts `direction.md` |
| `shoot <description>` | Generate → critique → revise loop, then a full-quality final render |
| `critique <images...>` | Judge existing images against the Style Contract |

Global flag: `-C, --dir <dir>` selects the project directory. `shoot` takes `--rounds` and `--candidates` to override the budget.

## How the loop judges work

Critique is half computed, half directed. Deterministic checks run first — dominant-color extraction with CIELAB distance against the contract palette, plus aspect-ratio verification — and the measured numbers are handed to Claude alongside the images. Claude then critiques each candidate against the contract rubric (mood, composition, lighting, NEVER rules, technical flaws), ranks candidates by pairwise comparison, and either ships one or rewrites the prompt for the next round. Hard budgets (`ART_DIRECTOR_ROUNDS` × `ART_DIRECTOR_CANDIDATES`, default 2 × 4 drafts + 1 final) keep costs bounded.

## Configuration

Set in `.env` (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Director brain (required) |
| `REPLICATE_API_TOKEN` | — | Image rendering (required for `shoot`) |
| `ART_DIRECTOR_MODEL` | `claude-opus-4-8` | Claude model for direction and critique |
| `REPLICATE_DRAFT_MODEL` | `black-forest-labs/flux-schnell` | Fast, cheap candidate renders |
| `REPLICATE_FINAL_MODEL` | `black-forest-labs/flux-1.1-pro` | Full-quality final render |
| `ART_DIRECTOR_ROUNDS` | `2` | Max critique rounds per shot |
| `ART_DIRECTOR_CANDIDATES` | `4` | Candidates per round |

A default shoot makes up to ~9 image generations and ~4 Claude calls — real API costs, kept small and capped.

## Development

```sh
npm test            # unit tests (contract parsing, color math, records)
npm run typecheck
npm run build
```

## Status

v0 — the skeleton is real and the loop runs end to end, but expect sharp edges. See [ROADMAP.md](ROADMAP.md).
