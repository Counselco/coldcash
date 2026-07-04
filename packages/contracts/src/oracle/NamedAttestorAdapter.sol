// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PromiseEscrow} from "../PromiseEscrow.sol";

/// @title NamedAttestorAdapter — the labeled beam.
/// v1 oracle: ONE published ColdCash attestation key. Every verdict is signed
/// off-chain, relayable by ANYONE, and permanently logged on-chain. Honest
/// centralization in daylight — behind the same surface the ChronX consensus
/// adapter will implement post-re-genesis. Never call this "consensus" in copy.
contract NamedAttestorAdapter {
    address public immutable attestor;

    event Attested(address indexed escrow, uint16 payoutBps, bytes32 evidenceHash, address relayer);

    error BadSignature();

    constructor(address _attestor) {
        attestor = _attestor;
    }

    /// @notice Anyone may relay a signed attestation. The signature binds
    /// (chainid, escrow, payoutBps, evidenceHash) — replay-safe across chains
    /// and promises. evidenceHash commits to the off-chain evidence bundle.
    function relay(
        address escrow,
        uint16  payoutBps,
        bytes32 evidenceHash,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encode(block.chainid, escrow, payoutBps, evidenceHash))
        ));
        if (ecrecover(digest, v, r, s) != attestor) revert BadSignature();
        emit Attested(escrow, payoutBps, evidenceHash, msg.sender);
        PromiseEscrow(escrow).resolve(payoutBps);
    }
}
