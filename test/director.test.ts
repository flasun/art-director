import { describe, expect, it } from "vitest";
import { parseContract, serializeContract } from "../src/contract.js";
import { toContract } from "../src/director.js";

const DRAFT = {
  name: "Sundial Coffee",
  essence: "Warm, unhurried mornings.",
  medium: "editorial photography",
  aspect: "4:5",
  palette: [
    { hex: "e8dcc8", role: "background", name: "oat cream" },
    { hex: "#7a4a2b", role: "primary", name: "roasted chestnut" },
  ],
  never: ["lens flare"],
  mood: "Quiet confidence.",
  composition: "Generous negative space.",
  lightingAndLens: "Window light, 50mm.",
  subjectTreatment: "Hands and objects.",
  notes: "",
};

describe("toContract", () => {
  it("normalizes hex values and sets the version", () => {
    const contract = toContract(DRAFT, 3);
    expect(contract.version).toBe(3);
    expect(contract.palette.map((c) => c.hex)).toEqual(["#E8DCC8", "#7A4A2B"]);
  });

  it("falls back to 4:5 on a malformed aspect", () => {
    expect(toContract({ ...DRAFT, aspect: "portrait" }, 1).aspect).toBe("4:5");
    expect(toContract({ ...DRAFT, aspect: "16:9" }, 1).aspect).toBe("16:9");
  });

  it("produces a contract that round-trips through the serializer", () => {
    const contract = toContract(DRAFT, 1);
    expect(parseContract(serializeContract(contract))).toEqual(contract);
  });

  it("rejects a draft with an unusable palette", () => {
    expect(() => toContract({ ...DRAFT, palette: [{ hex: "not-a-color", role: "primary", name: "x" }] }, 1)).toThrow(
      /hex/i,
    );
  });
});
