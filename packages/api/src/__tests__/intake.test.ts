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

  it("parses node-uptime wish with required/window days", () => {
    const engine = new IntakeEngine();
    const result = engine.processWish({
      wish: "node chronx-alpha-1 online 7 of 30 days by 1735689600",
      backerAddress: "0x1234567890123456789012345678901234567890",
      isPublic: false,
    });

    expect(result.spec.kind).toBe("node-uptime");
    expect(result.isSubjective).toBe(false);
    expect(result.requiresConsent).toBe(false);
    expect(result.frozen.standardHash).toBeTruthy();

    if (result.spec.kind === "node-uptime") {
      expect(result.spec.nodeId).toBe("chronx-alpha-1");
      expect(result.spec.requiredDays).toBe(7);
      expect(result.spec.windowDays).toBe(30);
      expect(result.spec.deadline).toBe(1735689600);
    }
  });

  it("parses node-uptime wish with simple format", () => {
    const engine = new IntakeEngine();
    const result = engine.processWish({
      wish: "chronx-beta-2 node 15 days uptime",
      backerAddress: "0x1234567890123456789012345678901234567890",
      isPublic: false,
    });

    expect(result.spec.kind).toBe("node-uptime");

    if (result.spec.kind === "node-uptime") {
      expect(result.spec.nodeId).toBe("chronx-beta-2");
      expect(result.spec.requiredDays).toBe(15);
      expect(result.spec.windowDays).toBe(30); // default
    }
  });

  describe("Structural test - subjective goal detection", () => {
    const testSubjective = (wish: string, description: string) => {
      it(`flags "${wish}" as subjective (${description})`, () => {
        const engine = new IntakeEngine();
        const result = engine.processWish({
          wish,
          backerAddress: "0x1234567890123456789012345678901234567890",
          isPublic: false,
        });

        expect(result.spec.kind).toBe("manual-attestation");
        expect(result.isSubjective).toBe(true);
        expect(result.requiresConsent).toBe(true);
      });
    };

    testSubjective("have a decent day", "mood goal");
    testSubjective("feel better", "feeling goal");
    testSubjective("be happy", "emotional state");
    testSubjective("impress me", "aesthetic judgment");
    testSubjective("have a productive morning", "subjective quality");
    testSubjective("have a wonderful experience", "subjective experience");

    // The critical regression test: action verb + subjective object must STILL be flagged
    it('flags "complete having a decent day" as subjective (action verb + subjective object bypass)', () => {
      const engine = new IntakeEngine();
      const result = engine.processWish({
        wish: "complete having a decent day",
        backerAddress: "0x1234567890123456789012345678901234567890",
        isPublic: false,
      });

      expect(result.spec.kind).toBe("manual-attestation");
      expect(result.isSubjective).toBe(true);
      expect(result.requiresConsent).toBe(true);
    });

    it('flags "finish feeling better" as subjective', () => {
      const engine = new IntakeEngine();
      const result = engine.processWish({
        wish: "finish feeling better",
        backerAddress: "0x1234567890123456789012345678901234567890",
        isPublic: false,
      });

      expect(result.spec.kind).toBe("manual-attestation");
      expect(result.isSubjective).toBe(true);
    });

    it('flags "achieve being happy" as subjective', () => {
      const engine = new IntakeEngine();
      const result = engine.processWish({
        wish: "achieve being happy",
        backerAddress: "0x1234567890123456789012345678901234567890",
        isPublic: false,
      });

      expect(result.spec.kind).toBe("manual-attestation");
      expect(result.isSubjective).toBe(true);
    });
  });

  describe("Structural test - objective goals", () => {
    const testObjective = (wish: string, description: string) => {
      it(`passes "${wish}" as objective (${description})`, () => {
        const engine = new IntakeEngine();
        const result = engine.processWish({
          wish,
          backerAddress: "0x1234567890123456789012345678901234567890",
          isPublic: false,
        });

        if (result.spec.kind === "manual-attestation") {
          expect(result.isSubjective).toBe(false);
          expect(result.requiresConsent).toBe(false);
        }
      });
    };

    testObjective("submit photo proof of completed homework", "explicit evidence artifact");
    testObjective("get straight A's this semester", "checkable deliverable with implied evidence");
    testObjective("complete my homework assignment", "concrete deliverable");
    testObjective("finish writing the essay", "tangible work product");
  });
});
