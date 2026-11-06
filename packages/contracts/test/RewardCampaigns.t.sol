// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {RewardCampaigns} from "../src/RewardCampaigns.sol";

/// 6-decimal stand-in for USDC's ERC-20 interface.
contract MockUSDC is ERC20("USD Coin", "USDC") {
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RewardCampaignsTest is Test {
    RewardCampaigns rc;
    MockUSDC usdc;
    address admin = makeAddr("admin");
    address allocator = makeAddr("allocator");
    address sponsor = makeAddr("sponsor");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address relayer = makeAddr("relayer");
    uint256 constant USDC = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = usdc;
        rc = new RewardCampaigns(admin, allocator, tokens);
        usdc.mint(sponsor, 1_000 * USDC);
        vm.prank(sponsor);
        usdc.approve(address(rc), type(uint256).max);
    }

    // ───────── helpers: OpenZeppelin StandardMerkleTree-compatible leaves ─────────

    function _leaf(uint256 id, address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(id, account, amount))));
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _create(uint256 deposit, uint256 cap) internal returns (uint256 id) {
        vm.prank(sponsor);
        id = rc.createCampaign(usdc, deposit, uint64(block.timestamp + 7 days), 14 days, cap, bytes32("pool-1"));
    }

    /// Two-recipient tree: alice 60, bob 30 → root and proofs.
    function _publishTwo(uint256 id) internal returns (bytes32[] memory proofAlice, bytes32[] memory proofBob) {
        bytes32 la = _leaf(id, alice, 60 * USDC);
        bytes32 lb = _leaf(id, bob, 30 * USDC);
        vm.warp(block.timestamp + 7 days);
        vm.prank(allocator);
        rc.publishAllocations(id, _pair(la, lb), 90 * USDC);
        proofAlice = new bytes32[](1);
        proofAlice[0] = lb;
        proofBob = new bytes32[](1);
        proofBob[0] = la;
    }

    // ───────────────────────────── creation ─────────────────────────────

    function test_createPullsDepositAndEmits() public {
        vm.expectEmit(true, true, true, true);
        emit RewardCampaigns.CampaignCreated(1, sponsor, usdc, 100 * USDC, uint64(block.timestamp + 7 days), 14 days, 60 * USDC, bytes32("pool-1"));
        uint256 id = _create(100 * USDC, 60 * USDC);
        assertEq(id, 1);
        assertEq(usdc.balanceOf(address(rc)), 100 * USDC);
        assertEq(rc.getCampaign(id).sponsor, sponsor);
    }

    function test_createRejectsBadParams() public {
        vm.startPrank(sponsor);
        vm.expectRevert(RewardCampaigns.InvalidParams.selector);
        rc.createCampaign(usdc, 0, uint64(block.timestamp + 1 days), 14 days, 1, 0);
        vm.expectRevert(RewardCampaigns.InvalidParams.selector);
        rc.createCampaign(usdc, 100, uint64(block.timestamp), 14 days, 1, 0); // already ended
        vm.expectRevert(RewardCampaigns.InvalidParams.selector);
        rc.createCampaign(usdc, 100, uint64(block.timestamp + 1 days), 1 hours, 1, 0); // window too short
        vm.expectRevert(RewardCampaigns.InvalidParams.selector);
        rc.createCampaign(usdc, 100, uint64(block.timestamp + 1 days), 14 days, 101, 0); // cap > deposit
        MockUSDC other = new MockUSDC();
        vm.expectRevert(RewardCampaigns.TokenNotAllowed.selector);
        rc.createCampaign(other, 100, uint64(block.timestamp + 1 days), 14 days, 1, 0);
        vm.stopPrank();
    }

    // ───────────────────────────── allocations ─────────────────────────────

    function test_publishRules() public {
        uint256 id = _create(100 * USDC, 60 * USDC);
        bytes32 root = keccak256("root");
        vm.prank(allocator);
        vm.expectRevert(RewardCampaigns.CampaignNotEnded.selector);
        rc.publishAllocations(id, root, 50 * USDC);

        vm.warp(block.timestamp + 7 days);
        bytes32 role = rc.ALLOCATOR_ROLE(); // read before prank (prank applies to the next call)
        vm.prank(sponsor); // sponsors can't allocate to themselves
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, sponsor, role));
        rc.publishAllocations(id, root, 50 * USDC);

        vm.startPrank(allocator);
        vm.expectRevert(RewardCampaigns.ExceedsDeposit.selector);
        rc.publishAllocations(id, root, 101 * USDC);
        rc.publishAllocations(id, root, 50 * USDC);
        vm.expectRevert(RewardCampaigns.AlreadyPublished.selector);
        rc.publishAllocations(id, root, 50 * USDC);
        vm.stopPrank();
        assertEq(rc.getCampaign(id).claimDeadline, block.timestamp + 14 days);
    }

    // ───────────────────────────── claims ─────────────────────────────

    function test_claimsPayEachRecipientOnce() public {
        uint256 id = _create(100 * USDC, 60 * USDC);
        (bytes32[] memory pa, bytes32[] memory pb) = _publishTwo(id);

        vm.prank(alice);
        rc.claim(id, alice, 60 * USDC, pa);
        assertEq(usdc.balanceOf(alice), 60 * USDC);

        // A relayer can submit bob's claim; funds still go to bob.
        vm.expectEmit(true, true, true, true);
        emit RewardCampaigns.Claimed(id, bob, 30 * USDC, relayer);
        vm.prank(relayer);
        rc.claim(id, bob, 30 * USDC, pb);
        assertEq(usdc.balanceOf(bob), 30 * USDC);
        assertEq(usdc.balanceOf(relayer), 0);

        vm.expectRevert(RewardCampaigns.AlreadyClaimed.selector);
        rc.claim(id, alice, 60 * USDC, pa);
        assertEq(rc.getCampaign(id).claimedTotal, 90 * USDC);
    }

    function test_claimRejectsWrongAmountProofOrAccount() public {
        uint256 id = _create(100 * USDC, 60 * USDC);
        (bytes32[] memory pa,) = _publishTwo(id);
        vm.expectRevert(RewardCampaigns.InvalidProof.selector);
        rc.claim(id, alice, 59 * USDC, pa); // inflated/deflated amount
        vm.expectRevert(RewardCampaigns.InvalidProof.selector);
        rc.claim(id, makeAddr("mallory"), 60 * USDC, pa); // someone else's proof
        vm.expectRevert(RewardCampaigns.InvalidProof.selector);
        rc.claim(id + 0, bob, 60 * USDC, pa);
    }

    function test_claimEnforcesRecipientCapEvenIfRootIncludesMore() public {
        uint256 id = _create(100 * USDC, 50 * USDC); // cap 50, but allocator puts alice at 60
        (bytes32[] memory pa,) = _publishTwo(id);
        vm.expectRevert(RewardCampaigns.ExceedsRecipientCap.selector);
        rc.claim(id, alice, 60 * USDC, pa);
    }

    function test_claimWindowCloses() public {
        uint256 id = _create(100 * USDC, 60 * USDC);
        (bytes32[] memory pa,) = _publishTwo(id);
        vm.warp(block.timestamp + 14 days + 1);
        vm.expectRevert(RewardCampaigns.ClaimWindowClosed.selector);
        rc.claim(id, alice, 60 * USDC, pa);
    }

    function test_claimBeforePublishFails() public {
        uint256 id = _create(100 * USDC, 60 * USDC);
        bytes32[] memory none = new bytes32[](0);
        vm.expectRevert(RewardCampaigns.NotPublished.selector);
        rc.claim(id, alice, 1, none);
        vm.expectRevert(RewardCampaigns.UnknownCampaign.selector);
        rc.claim(99, alice, 1, none);
    }

    // ───────────────────────────── reclaim ─────────────────────────────

    function test_sponsorReclaimsLeftoverAfterWindow() public {
        uint256 id = _create(100 * USDC, 60 * USDC);
        (bytes32[] memory pa,) = _publishTwo(id);
        vm.prank(alice);
        rc.claim(id, alice, 60 * USDC, pa); // bob never claims

        vm.prank(sponsor);
        vm.expectRevert(RewardCampaigns.ClaimWindowOpen.selector);
        rc.reclaim(id);

        vm.warp(block.timestamp + 14 days + 1);
        vm.prank(alice);
        vm.expectRevert(RewardCampaigns.NotSponsor.selector);
        rc.reclaim(id);

        uint256 before = usdc.balanceOf(sponsor);
        vm.prank(sponsor);
        rc.reclaim(id); // 100 - 60 = 40 back (10 unallocated + bob's unclaimed 30)
        assertEq(usdc.balanceOf(sponsor) - before, 40 * USDC);
        assertEq(usdc.balanceOf(address(rc)), 0);

        vm.prank(sponsor);
        vm.expectRevert(RewardCampaigns.NothingToReclaim.selector);
        rc.reclaim(id);
    }

    function test_sponsorRecoversEverythingIfAllocatorNeverPublishes() public {
        uint256 id = _create(100 * USDC, 60 * USDC);
        vm.warp(block.timestamp + 7 days + 29 days);
        vm.prank(sponsor);
        vm.expectRevert(RewardCampaigns.ClaimWindowOpen.selector);
        rc.reclaim(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(sponsor);
        rc.reclaim(id);
        assertEq(usdc.balanceOf(sponsor), 1_000 * USDC);
        // After reclaim, publishing is impossible.
        vm.prank(allocator);
        vm.expectRevert(RewardCampaigns.AlreadyPublished.selector);
        rc.publishAllocations(id, keccak256("late"), 1);
    }

    function test_campaignsAreIsolated() public {
        uint256 a = _create(100 * USDC, 60 * USDC);
        uint256 b = _create(50 * USDC, 50 * USDC);
        (, bytes32[] memory pb) = _publishTwo(a);
        // Campaign a's proof is bound to its id and can't drain campaign b.
        vm.warp(block.timestamp + 1);
        vm.prank(allocator);
        rc.publishAllocations(b, keccak256("other"), 10 * USDC);
        vm.expectRevert(RewardCampaigns.InvalidProof.selector);
        rc.claim(b, bob, 30 * USDC, pb);
    }

    // ───────────────────────────── invariants (fuzz) ─────────────────────────────

    /// Whatever the allocation, the contract never pays out more than was deposited and
    /// sponsor + recipients always account for the full deposit.
    function testFuzz_fundsAreConserved(uint96 rawDeposit, uint96 rawA, uint96 rawB, bool bobClaims) public {
        uint256 deposit = bound(uint256(rawDeposit), 2, 500 * USDC);
        uint256 amtA = bound(uint256(rawA), 1, deposit - 1);
        uint256 amtB = bound(uint256(rawB), 1, deposit - amtA);
        vm.prank(sponsor);
        uint256 id = rc.createCampaign(usdc, deposit, uint64(block.timestamp + 1 days), 1 days, deposit, 0);
        bytes32 la = _leaf(id, alice, amtA);
        bytes32 lb = _leaf(id, bob, amtB);
        vm.warp(block.timestamp + 1 days);
        vm.prank(allocator);
        rc.publishAllocations(id, _pair(la, lb), amtA + amtB);

        bytes32[] memory pa = new bytes32[](1);
        pa[0] = lb;
        rc.claim(id, alice, amtA, pa);
        if (bobClaims) {
            bytes32[] memory pb = new bytes32[](1);
            pb[0] = la;
            rc.claim(id, bob, amtB, pb);
        }
        vm.warp(block.timestamp + 1 days + 1);
        uint256 sponsorBefore = usdc.balanceOf(sponsor);
        uint256 leftover = deposit - rc.getCampaign(id).claimedTotal;
        vm.prank(sponsor);
        if (leftover == 0) vm.expectRevert(RewardCampaigns.NothingToReclaim.selector);
        rc.reclaim(id);
        uint256 paidOut = usdc.balanceOf(alice) + usdc.balanceOf(bob);
        assertEq(paidOut + (usdc.balanceOf(sponsor) - sponsorBefore), deposit);
        assertEq(usdc.balanceOf(address(rc)), 0);
    }
}
