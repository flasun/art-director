import { describe, expect, it } from "vitest";
import { contractRubric, normalizeHex, parseContract, serializeContract } from "../src/contract.js";
import type { StyleContract } from "../src/types.js";

const SAMPLE = `---
version: 1
name: Sundial Coffee
essence: Warm, unhurried mornings rendered with editorial precision.
medium: editorial photography
aspect: 4:5
palette:
  - hex: "#E8DCC8"
    role: background
    name: oat cream
  - hex: "#7A4A2B"
    role: primary
    name: roasted chestnut
never:
  - lens flare
  - visible text or lettering
---

## Mood

Quiet confidence; morning light on worn wood.

## Composition

Single subject, generous negative space, low horizon.

## Lighting & lens

Window light from camera left, 50mm, f/2.8.

## Subject treatment

Hands and objects, never full faces.

## Notes

Spring campaign runs March-May.
`;

describe("parseContract", () => {
  it("parses frontmatter and sections", () => {
    const c = parseContract(SAMPLE);
    expect(c.name).toBe("Sundial Coffee");
    expect(c.aspect).toBe("4:5");
    expect(c.palette).toHaveLength(2);
    expect(c.palette[0]).toEqual({ hex: "#E8DCC8", role: "background", name: "oat cream" });
    expect(c.never).toEqual(["lens flare", "visible text or lettering"]);
    expect(c.body.mood).toContain("Quiet confidence");
    expect(c.body.lightingAndLens).toContain("50mm");
    expect(c.body.notes).toContain("Spring campaign");
  });

  it("round-trips through serializeContract", () => {
    const first = parseContract(SAMPLE);
    const second = parseContract(serializeContract(first));
    expect(second).toEqual(first);
  });

  it("rejects input without frontmatter", () => {
    expect(() => parseContract("## Mood\n\nhello")).toThrow(/frontmatter/);
  });

  it("rejects bad hex colors", () => {
    expect(() => parseContract(SAMPLE.replace("#E8DCC8", "#XYZ123"))).toThrow(/hex/i);
  });

  it("rejects bad aspect ratios", () => {
    expect(() => parseContract(SAMPLE.replace("aspect: 4:5", "aspect: wide"))).toThrow(/aspect/);
  });

  it("tolerates a missing optional section", () => {
    const withoutNotes = SAMPLE.slice(0, SAMPLE.indexOf("## Notes"));
    expect(parseContract(withoutNotes).body.notes).toBe("");
  });
});

describe("normalizeHex", () => {
  it("normalizes case and missing hash", () => {
    expect(normalizeHex("e8dcc8")).toBe("#E8DCC8");
    expect(normalizeHex("#ff0000")).toBe("#FF0000");
  });
});

describe("contractRubric", () => {
  it("includes every hard constraint", () => {
    const rubric = contractRubric(parseContract(SAMPLE));
    expect(rubric).toContain("#E8DCC8");
    expect(rubric).toContain("lens flare");
    expect(rubric).toContain("4:5");
    expect(rubric).toContain("editorial photography");
  });

  it("renders an empty never list explicitly", () => {
    const contract: StyleContract = { ...parseContract(SAMPLE), never: [] };
    expect(contractRubric(contract)).toContain("(none)");
  });
});
