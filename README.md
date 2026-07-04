# ColdCash — seed
Arbitrum-native goal-based prize vault, ChronX-pluggable. Born 2026-07-04.

**Start here:** docs/ColdCash-v1-Build-Spec.md — invariants, interfaces, phase plan.

Verified at seed time: `packages/contracts` — 17/17 Foundry tests green
(forge 1.7.1, solc 0.8.24).

Run: `cd packages/contracts && forge install foundry-rs/forge-std --no-git && forge test`

Next: dispatch P0 from spec §10 (monorepo scaffold + CI). Do not modify the
Solidity state machine — it is the contract between ColdCash and ChronX.
