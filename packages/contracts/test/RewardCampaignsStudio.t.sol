// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {RewardCampaigns as StudioRewardCampaigns} from "../studio/RewardCampaigns.sol";

contract MockUSDC6 is ERC20("USD Coin", "USDC") {
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Independent review tests for the Arc Studio-built contract deployed at
/// 0x7cbbb1f0e9d7301c16e6d544f9a55d13030f74eb (Arc Testnet): MUSO's flow plus attack cases.
contract RewardCampaignsStudioReview is Test {
    StudioRewardCampaigns rc;
    MockUSDC6 usdc;
    address sponsor = makeAddr("sponsor");
    address allocator = makeAddr("allocator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    uint256 constant U = 1e6;
    uint64 endsAt;

    function setUp() public {
        usdc = new MockUSDC6();
        rc = new StudioRewardCampaigns(address(usdc));
        usdc.mint(sponsor, 1_000 * U);
        vm.prank(sponsor);
        usdc.approve(address(rc), type(uint256).max);
        endsAt = uint64(block.timestamp + 1 days);
    }

    function _create(uint256 budget, uint256 cap, address alloc) internal returns (uint256) {
        vm.prank(sponsor);
        return rc.createCampaign("MUSO pool", budget, cap, alloc, endsAt);
    }

    function test_musoFlow_proportionalAwardsAndRelayedClaims() public {
        uint256 id = _create(100 * U, 70 * U, allocator);
        vm.warp(endsAt);
        address[] memory who = new address[](2);
        who[0] = alice;
        who[1] = bob;
        uint256[] memory amt = new uint256[](2);
        amt[0] = 66_666_667; // 66.666667 USDC
        amt[1] = 33_333_333;
        vm.prank(allocator);
        rc.awardMany(id, who, amt);
        rc.claimFor(id, alice); // relayer pays gas, alice gets funds
        rc.claimFor(id, bob);
        assertEq(usdc.balanceOf(alice), 66_666_667);
        assertEq(usdc.balanceOf(bob), 33_333_333);
        assertEq(usdc.balanceOf(address(rc)), 0);
    }

    function test_budgetAndCapAreEnforced() public {
        uint256 id = _create(100 * U, 60 * U, allocator);
        vm.warp(endsAt);
        vm.startPrank(allocator);
        vm.expectRevert();
        rc.award(id, alice, 61 * U); // over cap
        rc.award(id, alice, 60 * U);
        vm.expectRevert();
        rc.award(id, bob, 41 * U); // over remaining budget
        vm.expectRevert();
        rc.award(id, alice, 1 * U); // twice
        vm.stopPrank();
    }

    function test_strangersCannotAward() public {
        uint256 id = _create(100 * U, 60 * U, allocator);
        vm.warp(endsAt);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StudioRewardCampaigns.OnlyAwardAuthority.selector, alice));
        rc.award(id, alice, 10 * U);
    }

    /// Fixed finding 1: no awards before the campaign ends.
    function test_fixed_noAwardsBeforeEnd() public {
        uint256 id = _create(100 * U, 60 * U, allocator);
        vm.warp(endsAt - 1);
        vm.prank(allocator);
        vm.expectRevert(StudioRewardCampaigns.AwardingNotStarted.selector);
        rc.award(id, alice, 10 * U);
    }

    /// Fixed finding 2: with an allocator set, the sponsor cannot award at all.
    function test_fixed_sponsorCannotAwardWhenAllocatorSet() public {
        uint256 id = _create(100 * U, 100 * U, allocator);
        vm.warp(endsAt);
        vm.prank(sponsor);
        vm.expectRevert(abi.encodeWithSelector(StudioRewardCampaigns.OnlyAwardAuthority.selector, sponsor));
        rc.award(id, alice, 10 * U);
    }

    /// Fixed finding 2b: neither the sponsor nor the allocator can be a participant.
    function test_fixed_noSelfAwards() public {
        uint256 id = _create(100 * U, 100 * U, allocator);
        vm.warp(endsAt);
        vm.startPrank(allocator);
        vm.expectRevert(abi.encodeWithSelector(StudioRewardCampaigns.InvalidParticipant.selector, sponsor));
        rc.award(id, sponsor, 10 * U);
        vm.expectRevert(abi.encodeWithSelector(StudioRewardCampaigns.InvalidParticipant.selector, allocator));
        rc.award(id, allocator, 10 * U);
        vm.stopPrank();
    }

    function test_noAllocator_sponsorAwards() public {
        uint256 id = _create(100 * U, 100 * U, address(0));
        vm.warp(endsAt);
        vm.prank(sponsor);
        rc.award(id, alice, 10 * U);
        assertEq(rc.awardOf(id, alice), 10 * U);
    }

    function test_awardWindowClosesAndSponsorReclaimsLeftover() public {
        uint256 id = _create(100 * U, 100 * U, allocator);
        vm.warp(endsAt);
        vm.prank(allocator);
        rc.award(id, alice, 30 * U);
        vm.warp(uint256(endsAt) + 14 days + 1);
        vm.prank(allocator);
        vm.expectRevert(StudioRewardCampaigns.AwardWindowClosed.selector);
        rc.award(id, bob, 10 * U);
        uint256 before = usdc.balanceOf(sponsor);
        vm.prank(sponsor);
        rc.reclaimUnawarded(id);
        assertEq(usdc.balanceOf(sponsor) - before, 70 * U);
        rc.claimFor(id, alice); // awarded funds stay claimable after reclaim
        assertEq(usdc.balanceOf(alice), 30 * U);
    }

    function testFuzz_conservation(uint64 a, uint64 b, bool reclaimFirst) public {
        uint256 budget = 100 * U;
        uint256 id = _create(budget, budget, allocator);
        uint256 amtA = bound(uint256(a), 1, budget - 1);
        uint256 amtB = bound(uint256(b), 1, budget - amtA);
        vm.warp(endsAt);
        vm.startPrank(allocator);
        rc.award(id, alice, amtA);
        rc.award(id, bob, amtB);
        vm.stopPrank();
        vm.warp(uint256(endsAt) + 14 days + 1);
        uint256 before = usdc.balanceOf(sponsor);
        bool leftover = budget - amtA - amtB > 0;
        if (leftover && reclaimFirst) {
            vm.prank(sponsor);
            rc.reclaimUnawarded(id);
        }
        rc.claimFor(id, alice);
        rc.claimFor(id, bob);
        if (leftover && !reclaimFirst) {
            vm.prank(sponsor);
            rc.reclaimUnawarded(id);
        }
        assertEq(usdc.balanceOf(alice) + usdc.balanceOf(bob) + (usdc.balanceOf(sponsor) - before), budget);
        assertEq(usdc.balanceOf(address(rc)), 0);
    }
}
