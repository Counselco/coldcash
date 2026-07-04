import { describe, it, expect } from "vitest";
import { standardHash } from "../src/hash.js";

describe("standardHash", () => {
  it("produces the same hash for identical objects with different key orders", () => {
    const obj1 = {
      goal: "Complete the project",
      success_criteria: "All tests passing",
      evidence_required: "Screenshot of test results",
    };

    const obj2 = {
      evidence_required: "Screenshot of test results",
      goal: "Complete the project",
      success_criteria: "All tests passing",
    };

    const hash1 = standardHash(obj1);
    const hash2 = standardHash(obj2);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("produces different hashes for different content", () => {
    const obj1 = {
      goal: "Complete the project",
      success_criteria: "All tests passing",
    };

    const obj2 = {
      goal: "Complete the project",
      success_criteria: "Some tests passing",
    };

    const hash1 = standardHash(obj1);
    const hash2 = standardHash(obj2);

    expect(hash1).not.toBe(hash2);
  });

  it("handles nested objects consistently", () => {
    const obj1 = {
      goal: "Test goal",
      metadata: {
        version: "1.0",
        author: "Alice",
      },
    };

    const obj2 = {
      metadata: {
        author: "Alice",
        version: "1.0",
      },
      goal: "Test goal",
    };

    const hash1 = standardHash(obj1);
    const hash2 = standardHash(obj2);

    expect(hash1).toBe(hash2);
  });

  it("is stable across multiple invocations", () => {
    const obj = {
      goal: "Stable test",
      success_criteria: "Consistency check",
    };

    const hashes = Array.from({ length: 5 }, () => standardHash(obj));
    const firstHash = hashes[0];

    expect(hashes.every((h) => h === firstHash)).toBe(true);
  });
});
