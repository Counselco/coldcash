import { keccak_256 } from "@noble/hashes/sha3";
import canonicalize from "canonicalize";
import type { Hex } from "./types.js";

export function standardHash(standard: Record<string, unknown>): Hex {
  const canonical = canonicalize(standard);
  if (!canonical) {
    throw new Error("Failed to canonicalize standard object");
  }
  const bytes = new TextEncoder().encode(canonical);
  const hash = keccak_256(bytes);
  return `0x${Buffer.from(hash).toString("hex")}` as Hex;
}
