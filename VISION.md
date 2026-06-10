# Vision

## The gap

Generation is commoditized; **direction** is the scarce layer. Image models render superbly but have no taste and no memory. The professional bar isn't one pretty image — it's a *set* of assets that read as one campaign, produced against a brief, with someone accountable for why each frame looks the way it does. That job — translating fuzzy intent into an explicit visual language and enforcing it ruthlessly — is what a human art director does. It is structurable, and it plays exactly to what vision LLMs are good at (critique against a rubric) rather than what they're bad at (being the artist).

**One-liner:** prompt tools give you a better sentence; art-director gives you a creative department — it writes the brief, sets the visual language, bosses the image model around until the work is on-brand, and shows its reasoning.

## Five ideas the design hangs on

### 1. The artifact is the direction, not the image

Every tool today treats prompts as the asset, but prompts are model-specific and brittle. Our core data structure is the **Style Contract** (`direction.md`): a versioned document capturing palette (exact hexes), typography of the image (medium, lens, lighting vocabulary), composition rules, mood anchors, and hard "never" rules. It is human-readable, machine-enforceable as a critique rubric, and *compiles* to per-model prompts through dialect adapters. Directions outlive models — next year you re-render the whole campaign on a better backend. Reframed: art-director is **version control for visual identity, with rendering as a build step**. That's why files + git is the substrate: diffs on `direction.md` are meaningful, and a PR is a creative review.

### 2. Build around critique, not generation

Vision LLMs are mediocre artists but strong critics, and they are far more reliable at pairwise choice ("which of A/B better satisfies constraint 3?") than at absolute scoring. So the loop generates wide, selects hard via pairwise ranking, and revises the prompt as a *diff against the contract* — never freeform — so iteration can't wander off-brief. Selection pressure, not generation skill, is the engine.

### 3. Half the rubric is computable

Critique mixes deterministic checks with directed judgment. Palette adherence is pixel math (dominant-color extraction, CIELAB distance to the contract hexes), aspect is arithmetic; later: contrast, OCR for text artifacts, set-level drift histograms. Feeding measured numbers into the LLM critique makes it cheaper, more reliable, and harder to flatter.

### 4. Taste is extracted, not described

Clients can't articulate aesthetics; art directors extract them. "Describe your style" fails; "this or that?" works. The creative interview opens every project with forced choices across distinct visual dimensions, and the contract is drafted from the *choices*, not from adjectives. Later, "more like #3" feedback gets diffed into contract amendments — a taste-learning loop and the long-term moat.

### 5. The decision log is the trust layer

Every kept and killed candidate, with reasons, committed next to the assets (`decisions.jsonl`, `critique.md`, an annotated contact sheet). Auditability is what makes the tool feel like a colleague rather than a slot machine — and it doubles as training data for taste learning.

## Who it's for

People who need **fifty on-brand assets**, not one pretty image: indie founders, small studios, marketing teams without a creative department. We don't compete with Midjourney on UI or render quality — we compete on *process*: briefs, consistency, auditability.

## Honest risks

- **Critique reliability.** LLM judges flatter and drift. Mitigations: pairwise ranking over absolute scores, rubric anchors from the contract, deterministic checks as ballast.
- **Cost spirals.** Loops multiply API spend. Mitigations: hard round/candidate budgets, draft-cheap/final-expensive cascades.
- **Taste overfitting.** The director's defaults must never override the contract; the human's vetoes weigh heaviest, and the contract is always the source of truth.
- **Scope temptation.** The adjacent products (UI design audit, video direction) are real but later — see the roadmap.
