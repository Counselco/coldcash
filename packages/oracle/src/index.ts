export { AttestorSigner } from "./attestor.js";
export type { AttestationData, AttestationSignature } from "./attestor.js";

export { GitHubMergeAdapter } from "./adapters/github-merge.js";
export type { GitHubMergeStandard, GitHubMergeEvidence, WebhookEvent } from "./adapters/github-merge.js";

export { OracleRelay } from "./relay.js";
export type { RelayConfig } from "./relay.js";

// First Six probe attestor
export {
  ChronXNodeProber,
  MockChronXNodeProber,
  calculatePayoutUsd,
  computeEvidenceHash,
  aggregateObservations,
  generateAttestedMetric,
  UPTIME_FLOOR_PERCENT,
} from "./first-six-probe.js";
export type {
  ProbeObservation,
  ObservationLog,
  UptimeMetric,
  AttestedMetric,
  ChronXRpcResponse,
} from "./first-six-probe.js";

// First Six oracle adapter seam
export {
  ProbeAdapter,
  NodeNativeAdapter,
  InMemoryObservationStore,
} from "./first-six-adapter.js";
export type {
  FirstSixOracleAdapter,
  ObservationStore,
} from "./first-six-adapter.js";
