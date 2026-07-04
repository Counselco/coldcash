import { pgTable, varchar, bigint, boolean, timestamp, integer, text } from "drizzle-orm/pg-core";

export const promises = pgTable("promises", {
  id: varchar("id", { length: 66 }).primaryKey(),
  chainId: integer("chain_id").notNull(),
  escrowAddress: varchar("escrow_address", { length: 42 }).notNull(),
  backer: varchar("backer", { length: 42 }).notNull(),
  seeker: varchar("seeker", { length: 42 }),
  prize: bigint("prize", { mode: "bigint" }).notNull(),
  acceptBy: bigint("accept_by", { mode: "bigint" }).notNull(),
  deadline: bigint("deadline", { mode: "bigint" }).notNull(),
  standardHash: varchar("standard_hash", { length: 66 }).notNull(),
  isPublic: boolean("is_public").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const claims = pgTable("claims", {
  id: varchar("id", { length: 66 }).primaryKey(),
  promiseId: varchar("promise_id", { length: 66 }).notNull().references(() => promises.id),
  seeker: varchar("seeker", { length: 42 }).notNull(),
  evidenceHash: varchar("evidence_hash", { length: 66 }).notNull(),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  status: varchar("status", { length: 20 }).notNull(),
});

export const evidence = pgTable("evidence", {
  id: varchar("id", { length: 66 }).primaryKey(),
  claimId: varchar("claim_id", { length: 66 }).notNull().references(() => claims.id),
  contentHash: varchar("content_hash", { length: 66 }).notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  validatorResults: text("validator_results").notNull(),
  storedAt: timestamp("stored_at").notNull().defaultNow(),
  retentionUntil: timestamp("retention_until"),
});

export const attestations = pgTable("attestations", {
  id: varchar("id", { length: 66 }).primaryKey(),
  promiseId: varchar("promise_id", { length: 66 }).notNull().references(() => promises.id),
  escrowAddress: varchar("escrow_address", { length: 42 }).notNull(),
  payoutBps: integer("payout_bps").notNull(),
  evidenceHash: varchar("evidence_hash", { length: 66 }).notNull(),
  signature: text("signature").notNull(),
  relayedTxHash: varchar("relayed_tx_hash", { length: 66 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  relayedAt: timestamp("relayed_at"),
});
