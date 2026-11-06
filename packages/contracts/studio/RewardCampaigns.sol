// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MUSO RewardCampaigns
/// @notice Ownerless, prefunded USDC reward campaigns with sponsor-selected allocators.
/// @dev Amounts use USDC's six-decimal ERC-20 units. On Arc Testnet, pass
///      0x3600000000000000000000000000000000000000 as the token address.
///      Awards reserve funds permanently; claims never expire. USDC is used only
///      through its ERC-20 interface, not through native-currency transfers.
///      All campaigns share this contract's USDC custody: an issuer blocklist of
///      this address would freeze claims and refunds. A blocklisted recipient's
///      claim reverts without state change and remains retryable; claimFor for
///      other recipients is unaffected by that recipient's blocklisting.
contract RewardCampaigns is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Time after endsAt during which the sponsor or allocator can award rewards.
    uint256 public constant AWARD_WINDOW = 14 days;

    /// @dev Arc system emitter 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE.
    uint160 private constant ARC_SYSTEM_EMITTER = type(uint160).max - 1;
    /// @dev Inclusive Arc protocol precompile range; these addresses cannot receive rewards.
    /// @dev Highest standard EVM precompile address (0x01 through 0x0100, including P256VERIFY).
    uint160 private constant MAX_STANDARD_PRECOMPILE = uint160(0x100);
    uint160 private constant ARC_PRECOMPILE_START = uint160(0x1800000000000000000000000000000000000000);
    uint160 private constant ARC_PRECOMPILE_END = uint160(0x1800000000000000000000000000000000000004);

    /// @notice ERC-20 token used for every campaign's funding and payouts.
    IERC20 public immutable USDC;

    /// @notice Total campaigns created; valid IDs start at one.
    uint256 public campaignCount;

    /// @notice Campaign configuration and settlement state.
    /// @dev awardedTotal includes claimed awards and never decreases. If reclaimed,
    ///      the refunded amount is budget - awardedTotal. Outstanding liability is
    ///      budget minus that refund (if any) minus all successfully claimed amounts.
    struct Campaign {
        address sponsor;
        string title;
        uint256 budget;
        uint256 maxPerRecipient;
        uint256 awardedTotal;
        address allocator;
        uint64 endsAt;
        uint64 awardWindowEnd;
        bool reclaimed;
    }

    mapping(uint256 => Campaign) private _campaigns;
    mapping(uint256 => mapping(address => uint256)) private _awarded;
    mapping(uint256 => mapping(address => bool)) private _claimed;

    error ZeroTokenAddress();
    error InvalidCampaign(uint256 id);
    error InvalidTitle();
    error InvalidBudget();
    error InvalidMaxPerRecipient();
    error InvalidEndsAt();
    error IncorrectDeposit(uint256 expected, uint256 received);
    error OnlySponsor(address caller);
    error OnlyAwardAuthority(address caller);
    error AwardingNotStarted();
    error InvalidBatchSize();
    error ArrayLengthMismatch();
    error InvalidParticipant(address participant);
    error InvalidAwardAmount(uint256 amount, uint256 maxPerRecipient);
    error AlreadyAwarded(uint256 id, address participant);
    error BudgetExceeded(uint256 id, uint256 requested, uint256 remaining);
    error AwardWindowClosed();
    error NotAwarded(uint256 id, address participant);
    error AlreadyClaimed(uint256 id, address participant);
    error AwardWindowNotEnded();
    error AlreadyReclaimed();
    error NoUnawardedRewards();

    event CampaignCreated(
        uint256 indexed id,
        address indexed sponsor,
        string title,
        uint256 budget,
        uint256 maxPerRecipient,
        address indexed allocator,
        uint64 endsAt,
        uint64 awardWindowEnd
    );
    event Awarded(
        uint256 indexed id, address indexed participant, uint256 amount, address by
    );
    event Claimed(
        uint256 indexed id, address indexed participant, uint256 amount, address indexed caller
    );
    event Reclaimed(uint256 indexed id, address indexed sponsor, uint256 amount);

    /// @param usdc USDC ERC-20 address; must not be zero.
    constructor(address usdc) {
        if (usdc == address(0)) revert ZeroTokenAddress();
        USDC = IERC20(usdc);
    }

    /// @notice Create a campaign and escrow its entire budget.
    /// @dev The sponsor must first approve this contract for the entire budget.
    ///      Funding must increase this contract's ERC-20 balance by exactly budget.
    /// @param title Nonempty campaign title, at most 80 bytes.
    /// @param budget Positive total budget in six-decimal USDC units.
    /// @param maxPerRecipient Positive per-recipient cap, at most budget.
    /// @param allocator Optional award authority. If nonzero, only it may award (not the
    ///        sponsor); zero means only the sponsor may award.
    /// @param endsAt Future campaign end timestamp; awards close 14 days later.
    /// @return id Newly created, one-indexed campaign ID.
    function createCampaign(
        string calldata title,
        uint256 budget,
        uint256 maxPerRecipient,
        address allocator,
        uint64 endsAt
    ) external nonReentrant returns (uint256 id) {
        if (bytes(title).length == 0 || bytes(title).length > 80) revert InvalidTitle();
        if (budget == 0) revert InvalidBudget();
        if (maxPerRecipient == 0 || maxPerRecipient > budget) revert InvalidMaxPerRecipient();
        if (
            endsAt <= block.timestamp ||
            uint256(endsAt) > uint256(type(uint64).max) - AWARD_WINDOW
        ) revert InvalidEndsAt();

        uint64 awardWindowEnd = uint64(uint256(endsAt) + AWARD_WINDOW);
        id = ++campaignCount;
        _campaigns[id] = Campaign({
            sponsor: msg.sender,
            title: title,
            budget: budget,
            maxPerRecipient: maxPerRecipient,
            awardedTotal: 0,
            allocator: allocator,
            endsAt: endsAt,
            awardWindowEnd: awardWindowEnd,
            reclaimed: false
        });

        uint256 balanceBefore = USDC.balanceOf(address(this));
        USDC.safeTransferFrom(msg.sender, address(this), budget);
        uint256 balanceAfter = USDC.balanceOf(address(this));
        if (balanceAfter < balanceBefore || balanceAfter - balanceBefore != budget) {
            // A balance decrease represents no received deposit, rather than an unsigned delta.
            revert IncorrectDeposit(budget, balanceAfter < balanceBefore ? 0 : balanceAfter - balanceBefore);
        }
        emit CampaignCreated(
            id, msg.sender, title, budget, maxPerRecipient, allocator, endsAt, awardWindowEnd
        );
    }

    /// @notice Reserve a variable reward without transferring tokens.
    /// @dev Only the allocator (if set) or else the sponsor may award, from endsAt through
    ///      the exact award-window end, both inclusive. Neither may be awarded themselves.
    /// @param id Existing campaign ID.
    /// @param participant Nonzero recipient other than this contract, USDC, the Arc system
    ///        emitter or Arc protocol precompiles 0x1800000000000000000000000000000000000000
    ///        through 0x1800000000000000000000000000000000000004; no joining required.
    /// @param amount Positive reward no greater than the per-recipient cap or remaining budget.
    function award(uint256 id, address participant, uint256 amount) external {
        Campaign storage campaign = _requireAwardAuthority(id);
        _award(campaign, id, participant, amount);
    }

    /// @notice Atomically reserve rewards for between one and 500 recipients.
    /// @dev Every entry must be valid; duplicates or any other failure revert the entire batch.
    /// @param id Existing campaign ID.
    /// @param participants Recipient addresses, each awardable only once per campaign.
    /// @param amounts Positive reward amounts corresponding to participants.
    function awardMany(uint256 id, address[] calldata participants, uint256[] calldata amounts)
        external
    {
        Campaign storage campaign = _requireAwardAuthority(id);
        uint256 size = participants.length;
        if (size != amounts.length) revert ArrayLengthMismatch();
        if (size == 0 || size > 500) revert InvalidBatchSize();
        for (uint256 i = 0; i < size; ++i) {
            _award(campaign, id, participants[i], amounts[i]);
        }
    }

    /// @notice Withdraw your awarded reward at any time, including after reclamation.
    /// @param id Existing campaign ID.
    function claim(uint256 id) external nonReentrant {
        _claim(id, msg.sender);
    }

    /// @notice Pay a recipient's reward on their behalf, without their signature.
    /// @dev Anyone may call; funds always go to participant, never to the caller.
    /// @param id Existing campaign ID.
    /// @param participant Award recipient to pay.
    function claimFor(uint256 id, address participant) external nonReentrant {
        _claim(id, participant);
    }

    /// @notice Refund only unawarded rewards to the sponsor after the award window.
    /// @dev Awarded but unclaimed rewards remain escrowed indefinitely.
    /// @param id Existing campaign ID.
    function reclaimUnawarded(uint256 id) external nonReentrant {
        Campaign storage campaign = _requireCampaign(id);
        if (msg.sender != campaign.sponsor) revert OnlySponsor(msg.sender);
        if (block.timestamp <= campaign.awardWindowEnd) revert AwardWindowNotEnded();
        if (campaign.reclaimed) revert AlreadyReclaimed();

        uint256 amount = campaign.budget - campaign.awardedTotal;
        if (amount == 0) revert NoUnawardedRewards();
        campaign.reclaimed = true;
        USDC.safeTransfer(campaign.sponsor, amount);
        emit Reclaimed(id, campaign.sponsor, amount);
    }

    /// @notice Return the configuration and settlement state of an existing campaign.
    function getCampaign(uint256 id) external view returns (Campaign memory) {
        return _requireCampaign(id);
    }

    /// @notice Return an address's awarded amount, including after it has claimed; zero if none.
    function awardOf(uint256 id, address participant) external view returns (uint256) {
        _requireCampaign(id);
        return _awarded[id][participant];
    }

    /// @notice Whether an address was awarded a reward in an existing campaign.
    function isAwarded(uint256 id, address participant) external view returns (bool) {
        _requireCampaign(id);
        return _awarded[id][participant] > 0;
    }

    /// @notice Whether an address claimed its reward in an existing campaign.
    function hasClaimed(uint256 id, address participant) external view returns (bool) {
        _requireCampaign(id);
        return _claimed[id][participant];
    }

    /// @notice Return campaigns in creation order, using a zero-based offset.
    /// @dev Offset zero starts at ID one; a page entry at index i has ID offset + i + 1.
    ///      Returns an empty page for a zero limit or an offset at or beyond the end.
    function getCampaigns(uint256 offset, uint256 limit)
        external
        view
        returns (Campaign[] memory page)
    {
        uint256 total = campaignCount;
        if (offset >= total) return new Campaign[](0);
        uint256 size = total - offset;
        if (limit < size) size = limit;
        page = new Campaign[](size);
        for (uint256 i = 0; i < size; ++i) {
            page[i] = _campaigns[offset + i + 1];
        }
    }

    /// @dev Validate the single award authority (the allocator if set, else the sponsor)
    ///      and that awarding is within [endsAt, awardWindowEnd], both inclusive.
    function _requireAwardAuthority(uint256 id) private view returns (Campaign storage campaign) {
        campaign = _requireCampaign(id);
        address authority = campaign.allocator != address(0) ? campaign.allocator : campaign.sponsor;
        if (msg.sender != authority) revert OnlyAwardAuthority(msg.sender);
        if (block.timestamp < campaign.endsAt) revert AwardingNotStarted();
        if (block.timestamp > campaign.awardWindowEnd) revert AwardWindowClosed();
    }

    /// @dev Reserve one award. Subtraction bounds the amount without addition overflow.
    function _award(Campaign storage campaign, uint256 id, address participant, uint256 amount)
        private
    {
        if (
            participant == address(0) || participant == address(this) || participant == campaign.sponsor
                || participant == campaign.allocator || _isUnpayableRecipient(participant)
        ) revert InvalidParticipant(participant);
        if (amount == 0 || amount > campaign.maxPerRecipient) revert InvalidAwardAmount(amount, campaign.maxPerRecipient);
        if (_awarded[id][participant] > 0) revert AlreadyAwarded(id, participant);
        if (amount > campaign.budget - campaign.awardedTotal) {
            revert BudgetExceeded(id, amount, campaign.budget - campaign.awardedTotal);
        }

        _awarded[id][participant] = amount;
        campaign.awardedTotal += amount;
        emit Awarded(id, participant, amount, msg.sender);
    }

    /// @dev Reject USDC itself, standard EVM precompiles (0x01 to 0x0100), the Arc system
    ///      emitter and the five Arc protocol precompiles using uint160 comparisons.
    function _isUnpayableRecipient(address participant) private view returns (bool) {
        uint160 recipient = uint160(participant);
        return participant == address(USDC) || recipient <= MAX_STANDARD_PRECOMPILE
            || recipient == ARC_SYSTEM_EMITTER
            || (recipient >= ARC_PRECOMPILE_START && recipient <= ARC_PRECOMPILE_END);
    }

    /// @dev Shared guarded-entry claim path; effects precede the transfer to the recipient.
    function _claim(uint256 id, address participant) private {
        _requireCampaign(id);
        uint256 amount = _awarded[id][participant];
        if (amount == 0) revert NotAwarded(id, participant);
        if (_claimed[id][participant]) revert AlreadyClaimed(id, participant);

        _claimed[id][participant] = true;
        USDC.safeTransfer(participant, amount);
        emit Claimed(id, participant, amount, msg.sender);
    }

    /// @dev Reject nonexistent IDs and return the existing campaign's storage reference.
    function _requireCampaign(uint256 id) private view returns (Campaign storage campaign) {
        if (id == 0 || id > campaignCount) revert InvalidCampaign(id);
        campaign = _campaigns[id];
    }
}
