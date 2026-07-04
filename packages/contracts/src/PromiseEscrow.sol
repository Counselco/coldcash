// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

/// @title PromiseEscrow — one promise, one contract, no pooled funds.
/// @notice State machine:
///   Offered  -> Canceled            (backer only, before acceptance)
///   Offered  -> Accepted            (seeker, before acceptBy — retires the unwind path)
///   Offered  -> Refunded            (anyone, after acceptBy lapses unaccepted)
///   Accepted -> Paid                (oracle only, graded bps, before deadline)
///   Accepted -> Refunded            (anyone, after deadline passes unresolved)
/// Success XOR refund: exactly one settlement path ever fires.
contract PromiseEscrow {
    enum State { Offered, Accepted, Paid, Refunded, Canceled }

    State   public state;
    address public immutable backer;
    address public immutable token;
    uint256 public immutable amount;       // prize, held whole (fee skimmed at factory, never here)
    uint64  public immutable acceptBy;     // acceptance clock — strictly before deadline
    uint64  public immutable deadline;
    address public immutable oracle;       // sole address permitted to resolve
    bytes32 public immutable standardHash; // keccak256 of the frozen terms both parties saw
    bool    public immutable openOffer;    // true: first accept wins; false: named seeker only

    address public seeker;                 // fixed at accept (pre-set for named offers)

    event Accepted(address indexed seeker, uint64 at);
    event Resolved(uint16 payoutBps, uint256 toSeeker, uint256 backToBacker);
    event Refunded(uint256 amount, string reason);
    event Canceled();

    error WrongState();
    error NotAuthorized();
    error AcceptWindowClosed();
    error PastDeadline();
    error NotYetExpired();
    error BadBps();

    constructor(
        address _backer,
        address _token,
        uint256 _amount,
        uint64  _acceptBy,
        uint64  _deadline,
        address _oracle,
        bytes32 _standardHash,
        address _namedSeeker            // address(0) => open offer
    ) {
        backer       = _backer;
        token        = _token;
        amount       = _amount;
        acceptBy     = _acceptBy;
        deadline     = _deadline;
        oracle       = _oracle;
        standardHash = _standardHash;
        openOffer    = (_namedSeeker == address(0));
        seeker       = _namedSeeker;
        state        = State.Offered;
    }

    /// @notice Backer may cancel any time before acceptance. Full prize refund.
    /// The publication fee (public lane) is not returned — it was the spam price.
    function cancel() external {
        if (msg.sender != backer) revert NotAuthorized();
        if (state != State.Offered) revert WrongState();
        state = State.Canceled;
        emit Canceled();
        _pay(backer, amount);
    }

    /// @notice Acceptance retires the backer's unwind path. Point of no return.
    function accept() external {
        if (state != State.Offered) revert WrongState();
        if (block.timestamp > acceptBy) revert AcceptWindowClosed();
        if (openOffer) {
            seeker = msg.sender;
        } else if (msg.sender != seeker) {
            revert NotAuthorized();
        }
        state = State.Accepted;
        emit Accepted(seeker, uint64(block.timestamp));
    }

    /// @notice Oracle resolves with a graded payout in basis points.
    /// Binary = 10000 or 0. Tiers and concave curves are bps schedules computed
    /// off-chain against the frozen standard — one mechanism, every payout shape.
    /// Remainder returns to the backer in the same transaction.
    function resolve(uint16 payoutBps) external {
        if (msg.sender != oracle) revert NotAuthorized();
        if (state != State.Accepted) revert WrongState();
        if (block.timestamp > deadline) revert PastDeadline();
        if (payoutBps > 10_000) revert BadBps();
        state = State.Paid;
        uint256 toSeeker = (amount * payoutBps) / 10_000;
        uint256 back     = amount - toSeeker;
        emit Resolved(payoutBps, toSeeker, back);
        if (toSeeker > 0) _pay(seeker, toSeeker);
        if (back > 0)     _pay(backer, back);
    }

    /// @notice Anyone may sweep after expiry — no warm party required for refunds.
    /// Two lapse cases: offer never accepted, or accepted but unresolved past deadline.
    function refund() external {
        if (state == State.Offered) {
            if (block.timestamp <= acceptBy) revert NotYetExpired();
            state = State.Refunded;
            emit Refunded(amount, "offer lapsed unaccepted");
        } else if (state == State.Accepted) {
            if (block.timestamp <= deadline) revert NotYetExpired();
            state = State.Refunded;
            emit Refunded(amount, "deadline passed unresolved");
        } else {
            revert WrongState();
        }
        _pay(backer, amount);
    }

    function _pay(address to, uint256 amt) internal {
        require(IERC20(token).transfer(to, amt), "transfer failed");
    }
}
