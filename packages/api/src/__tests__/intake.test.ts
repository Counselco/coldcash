import { describe, it, expect } from "vitest";
import { IntakeEngine } from "../intake/engine.js";

describe("IntakeEngine", () => {
  it("parses github-merge wish with structural anchor", () => {
    const engine = new IntakeEngine();
    const result = engine.processWish({
      wish: "merge PR #42 in testorg/testrepo by 1735689600",
      backerAddress: "0x1234567890123456789012345678901234567890",
      isPublic: false,
    });

    expect(result.spec.kind).toBe("github-merge");
    expect(result.isSubjective).toBe(false);
    expect(result.requiresConsent).toBe(false);
    expect(result.frozen.standardHash).toBeTruthy();
    expect(result.frozen.goal).toContain("PR #42");

    if (result.spec.kind === "github-merge") {
      expect(result.spec.repo).toBe("testorg/testrepo");
      expect(result.spec.prNumber).toBe(42);
    }
  });

  it("flags subjective manual-attestation without consent", () => {
    const engine = new IntakeEngine();
    const result = engine.processWish({
      wish: "clean my room",
      backerAddress: "0x1234567890123456789012345678901234567890",
      isPublic: false,
    });

    expect(result.spec.kind).toBe("manual-attestation");
    expect(result.isSubjective).toBe(true);
    expect(result.requiresConsent).toBe(true);
  });

  it("accepts subjective manual-attestation with explicit consent", () => {
    const engine = new IntakeEngine();
    const result = engine.processWish({
      wish: "clean my room, i understand this is subjective",
      backerAddress: "0x1234567890123456789012345678901234567890",
      isPublic: false,
    });

    expect(result.spec.kind).toBe("manual-attestation");
    expect(result.isSubjective).toBe(true);
    expect(result.requiresConsent).toBe(false);
  });

  it("passes structural test for action+record manual goals", () => {
    const engine = new IntakeEngine();
    const result = engine.processWish({
      wish: "submit photo proof of completed homework",
      backerAddress: "0x1234567890123456789012345678901234567890",
      isPublic: false,
    });

    expect(result.spec.kind).toBe("manual-attestation");
    expect(result.isSubjective).toBe(false);
  });
});
