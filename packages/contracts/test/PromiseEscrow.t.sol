// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PromiseFactory} from "../src/PromiseFactory.sol";
import {PromiseEscrow} from "../src/PromiseEscrow.sol";
import {NamedAttestorAdapter} from "../src/oracle/NamedAttestorAdapter.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

contract MockUSDC is IERC20 {
    string public constant name = "Mock USDC";
    uint8  public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }

    function approve(address spender, uint256 amt) external returns (bool) {
        allowance[msg.sender][spender] = amt; return true;
    }
    function transfer(address to, uint256 amt) external returns (bool) {
        balanceOf[msg.sender] -= amt; balanceOf[to] += amt; return true;
    }
    function transferFrom(address from, address to, uint256 amt) external returns (bool) {
        allowance[from][msg.sender] -= amt;
        balanceOf[from] -= amt; balanceOf[to] += amt; return true;
    }
}

contract PromiseEscrowTest is Test {
    MockUSDC usdc;
    PromiseFactory factory;
    NamedAttestorAdapter adapter;

    address backer  = address(0xB1);
    address seeker  = address(0x5EE);
    address rando   = address(0xAAA);
    address feeRcpt = address(0xFEE);

    uint256 attestorPk;
    address attestor;

    uint256 constant PRIZE = 100e6;              // $100 — at the cap
    uint64  acceptBy;
    uint64  deadline;
    bytes32 constant STANDARD = keccak256("photo of empty sink by Sunday 6pm; frozen at intake");

    function setUp() public {
        (attestor, attestorPk) = makeAddrAndKey("coldcash-attestor");
        usdc    = new MockUSDC();
        adapter = new NamedAttestorAdapter(attestor);
        factory = new PromiseFactory(address(usdc), feeRcpt, address(adapter));

        acceptBy = uint64(block.timestamp + 1 days);
        deadline = uint64(block.timestamp + 7 days);

        usdc.mint(backer, 1_000e6);
        vm.prank(backer);
        usdc.approve(address(factory), type(uint256).max);
    }

    // ---------- helpers ----------

    function _createNamed() internal returns (PromiseEscrow e) {
        vm.prank(backer);
        e = PromiseEscrow(factory.createPromise(PRIZE, acceptBy, deadline, STANDARD, seeker, address(0)));
    }

    function _createOpen() internal returns (PromiseEscrow e) {
        vm.prank(backer);
        e = PromiseEscrow(factory.createPromise(PRIZE, acceptBy, deadline, STANDARD, address(0), address(0)));
    }

    function _sign(address escrow, uint16 bps, bytes32 evidenceHash)
        internal view returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encode(block.chainid, escrow, bps, evidenceHash))
        ));
        (v, r, s) = vm.sign(attestorPk, digest);
    }

    // ---------- the machine ----------

    function test_HappyPath_FullPayout() public {
        PromiseEscrow e = _createNamed();
        assertEq(usdc.balanceOf(address(e)), PRIZE);

        vm.prank(seeker);
        e.accept();

        (uint8 v, bytes32 r, bytes32 s) = _sign(address(e), 10_000, keccak256("evidence-bundle-1"));
        adapter.relay(address(e), 10_000, keccak256("evidence-bundle-1"), v, r, s);

        assertEq(usdc.balanceOf(seeker), PRIZE);
        assertEq(usdc.balanceOf(address(e)), 0);
        assertEq(uint8(e.state()), uint8(PromiseEscrow.State.Paid));
    }

    function test_PartialPayout_GradedBps() public {
        PromiseEscrow e = _createNamed();
        vm.prank(seeker); e.accept();

        // 300%-tier hit on a 400% ladder: 2000 bps
        (uint8 v, bytes32 r, bytes32 s) = _sign(address(e), 2_000, keccak256("ev"));
        adapter.relay(address(e), 2_000, keccak256("ev"), v, r, s);

        assertEq(usdc.balanceOf(seeker), 20e6);          // partial credit paid
        assertEq(usdc.balanceOf(backer), 1_000e6 - PRIZE + 80e6); // remainder home
    }

    function test_Cancel_BeforeAccept_RefundsWhole() public {
        PromiseEscrow e = _createNamed();
        vm.prank(backer); e.cancel();
        assertEq(usdc.balanceOf(backer), 1_000e6);
        assertEq(uint8(e.state()), uint8(PromiseEscrow.State.Canceled));
    }

    function test_Cancel_RevertsAfterAccept() public {
        PromiseEscrow e = _createNamed();
        vm.prank(seeker); e.accept();               // unwind path retired
        vm.prank(backer);
        vm.expectRevert(PromiseEscrow.WrongState.selector);
        e.cancel();
    }

    function test_AcceptWindow_ClosesBeforeDeadline() public {
        PromiseEscrow e = _createNamed();
        vm.warp(acceptBy + 1);                       // wait-and-see free option: dead
        vm.prank(seeker);
        vm.expectRevert(PromiseEscrow.AcceptWindowClosed.selector);
        e.accept();
    }

    function test_LapsedOffer_AnyoneSweeps() public {
        PromiseEscrow e = _createNamed();
        vm.warp(acceptBy + 1);
        vm.prank(rando);                             // no warm party required
        e.refund();
        assertEq(usdc.balanceOf(backer), 1_000e6);
        assertEq(uint8(e.state()), uint8(PromiseEscrow.State.Refunded));
    }

    function test_DeadlinePassed_AnyoneSweeps() public {
        PromiseEscrow e = _createNamed();
        vm.prank(seeker); e.accept();
        vm.warp(deadline + 1);
        vm.prank(rando);
        e.refund();
        assertEq(usdc.balanceOf(backer), 1_000e6);
    }

    function test_Refund_RevertsBeforeExpiry() public {
        PromiseEscrow e = _createNamed();
        vm.prank(seeker); e.accept();
        vm.expectRevert(PromiseEscrow.NotYetExpired.selector);
        e.refund();
    }

    function test_OnlyOracleResolves() public {
        PromiseEscrow e = _createNamed();
        vm.prank(seeker); e.accept();
        vm.prank(backer);
        vm.expectRevert(PromiseEscrow.NotAuthorized.selector);
        e.resolve(10_000);
    }

    function test_ResolveAfterDeadline_Reverts() public {
        PromiseEscrow e = _createNamed();
        vm.prank(seeker); e.accept();
        vm.warp(deadline + 1);
        (uint8 v, bytes32 r, bytes32 s) = _sign(address(e), 10_000, keccak256("late"));
        vm.expectRevert(PromiseEscrow.PastDeadline.selector);
        adapter.relay(address(e), 10_000, keccak256("late"), v, r, s);
    }

    function test_CapEnforced_InContract() public {
        vm.prank(backer);
        vm.expectRevert(PromiseFactory.Cap.selector);
        factory.createPromise(101e6, acceptBy, deadline, STANDARD, seeker, address(0));
    }

    function test_ClockSanity_AcceptByBeforeDeadline() public {
        vm.prank(backer);
        vm.expectRevert(PromiseFactory.Clock.selector);
        factory.createPromise(PRIZE, deadline, acceptBy, STANDARD, seeker, address(0));
    }

    function test_PublicLane_FeeSkimmed_PrizeWhole() public {
        PromiseEscrow e = _createOpen();
        assertEq(usdc.balanceOf(address(e)), PRIZE);     // worker's number untouched
        assertEq(usdc.balanceOf(feeRcpt), 3e6);          // 3% spam price, backer-paid
        assertEq(usdc.balanceOf(backer), 1_000e6 - PRIZE - 3e6);
    }

    function test_PrivateLane_NoFee() public {
        _createNamed();
        assertEq(usdc.balanceOf(feeRcpt), 0);
    }

    function test_OpenOffer_FirstAcceptWins() public {
        PromiseEscrow e = _createOpen();
        vm.prank(rando); e.accept();                     // first to accept becomes the seeker
        assertEq(e.seeker(), rando);
        vm.prank(seeker);
        vm.expectRevert(PromiseEscrow.WrongState.selector);
        e.accept();
    }

    function test_NamedOffer_OnlyNamedSeekerAccepts() public {
        PromiseEscrow e = _createNamed();
        vm.prank(rando);
        vm.expectRevert(PromiseEscrow.NotAuthorized.selector);
        e.accept();
    }

    function test_BadAttestorSignature_Rejected() public {
        PromiseEscrow e = _createNamed();
        vm.prank(seeker); e.accept();
        (, uint256 wrongPk) = makeAddrAndKey("imposter");
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encode(block.chainid, address(e), uint16(10_000), keccak256("ev")))
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPk, digest);
        vm.expectRevert(NamedAttestorAdapter.BadSignature.selector);
        adapter.relay(address(e), 10_000, keccak256("ev"), v, r, s);
    }
}
