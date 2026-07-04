// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PromiseEscrow} from "./PromiseEscrow.sol";
import {IERC20} from "./interfaces/IERC20.sol";

/// @title PromiseFactory — mints per-promise isolated escrows.
/// Enforces the launch cap and the public-lane publication fee.
/// The fee is the spam price, charged to the backer at creation;
/// the prize is funded whole — the worker's number is never skimmed.
contract PromiseFactory {
    uint256 public constant MAX_STAKE      = 100e6; // $100 in 6-decimal USDC — the launch moat
    uint16  public constant PUBLIC_FEE_BPS = 300;   // 3% on public offers only

    address public immutable usdc;
    address public immutable feeRecipient;
    address public defaultOracle;                   // NamedAttestorAdapter at launch; ChronX adapter later
    address public owner;

    event PromiseCreated(
        address indexed escrow,
        address indexed backer,
        uint256 amount,
        bool    openOffer,
        bytes32 standardHash
    );

    error Cap();
    error Clock();
    error NotOwner();

    constructor(address _usdc, address _feeRecipient, address _oracle) {
        usdc         = _usdc;
        feeRecipient = _feeRecipient;
        defaultOracle = _oracle;
        owner        = msg.sender;
    }

    function setDefaultOracle(address o) external {
        if (msg.sender != owner) revert NotOwner();
        defaultOracle = o;
    }

    /// @notice One click: pulls prize (+fee if public), deploys an isolated escrow, funds it whole.
    function createPromise(
        uint256 amount,
        uint64  acceptBy,
        uint64  deadline,
        bytes32 standardHash,
        address namedSeeker,     // address(0) => open/public offer (fee applies)
        address oracleOverride   // address(0) => defaultOracle
    ) external returns (address escrow) {
        if (amount == 0 || amount > MAX_STAKE) revert Cap();
        if (acceptBy <= block.timestamp || deadline <= acceptBy) revert Clock();

        bool isPublic = (namedSeeker == address(0));
        address oracle = oracleOverride == address(0) ? defaultOracle : oracleOverride;

        escrow = address(new PromiseEscrow(
            msg.sender, usdc, amount, acceptBy, deadline, oracle, standardHash, namedSeeker
        ));

        // Prize, held whole in the isolated escrow.
        require(IERC20(usdc).transferFrom(msg.sender, escrow, amount), "fund");

        // Publication fee only on the public lane.
        if (isPublic) {
            uint256 fee = (amount * PUBLIC_FEE_BPS) / 10_000;
            if (fee > 0) require(IERC20(usdc).transferFrom(msg.sender, feeRecipient, fee), "fee");
        }

        emit PromiseCreated(escrow, msg.sender, amount, isPublic, standardHash);
    }
}
