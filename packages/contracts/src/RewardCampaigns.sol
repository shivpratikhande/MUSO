// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RewardCampaigns
/// @notice Sponsor-funded stablecoin reward escrow. A sponsor deposits USDC (or EURC) for a
///         campaign; after the campaign ends an allocator publishes a Merkle root of
///         (campaignId, account, amount) allocations computed off-chain; recipients claim their
///         share (or anyone relays the claim on their behalf); after the claim window the
///         sponsor reclaims whatever was not allocated or claimed.
/// @dev    Generic and reusable: nothing here is specific to any one app. Enforced on-chain:
///         - allocations can only be published after the campaign ends, once
///         - published total can never exceed the deposit
///         - no single recipient can receive more than the campaign's per-recipient cap
///         - each recipient claims at most once, only during the claim window
///         - funds can only leave to allocated recipients or back to the sponsor
///         Leaves use OpenZeppelin StandardMerkleTree encoding:
///         keccak256(bytes.concat(keccak256(abi.encode(campaignId, account, amount)))).
contract RewardCampaigns is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice May publish allocations (e.g. an app backend or a Chainlink CRE workflow).
    bytes32 public constant ALLOCATOR_ROLE = keccak256("ALLOCATOR_ROLE");

    /// @notice If no allocations are published within this time after the end, the sponsor
    ///         can reclaim the full deposit (protects sponsors from an absent allocator).
    uint64 public constant ALLOCATION_GRACE = 30 days;

    struct Campaign {
        address sponsor;
        IERC20 token;
        uint64 endsAt;
        uint64 claimWindow;
        uint64 claimDeadline; // set when allocations are published
        bool reclaimed;
        uint256 deposit;
        uint256 maxPerRecipient;
        uint256 allocatedTotal;
        uint256 claimedTotal;
        bytes32 merkleRoot;
        bytes32 externalRef; // off-chain id, e.g. an app's pool id
    }

    /// @notice Tokens campaigns may be funded in (USDC / EURC), set by the admin.
    mapping(IERC20 => bool) public allowedToken;
    mapping(uint256 => Campaign) private _campaigns;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    uint256 public campaignCount;

    event TokenAllowed(IERC20 indexed token, bool allowed);
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed sponsor,
        IERC20 indexed token,
        uint256 deposit,
        uint64 endsAt,
        uint64 claimWindow,
        uint256 maxPerRecipient,
        bytes32 externalRef
    );
    event AllocationsPublished(uint256 indexed campaignId, bytes32 merkleRoot, uint256 allocatedTotal, uint64 claimDeadline);
    event Claimed(uint256 indexed campaignId, address indexed account, uint256 amount, address indexed relayer);
    event Reclaimed(uint256 indexed campaignId, address indexed sponsor, uint256 amount);

    error TokenNotAllowed();
    error InvalidParams();
    error UnknownCampaign();
    error CampaignNotEnded();
    error AlreadyPublished();
    error NotPublished();
    error ExceedsDeposit();
    error ExceedsRecipientCap();
    error ClaimWindowClosed();
    error ClaimWindowOpen();
    error AlreadyClaimed();
    error InvalidProof();
    error NotSponsor();
    error NothingToReclaim();

    constructor(address admin, address allocator, IERC20[] memory tokens) {
        if (admin == address(0)) revert InvalidParams();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        if (allocator != address(0)) _grantRole(ALLOCATOR_ROLE, allocator);
        for (uint256 i; i < tokens.length; ++i) {
            allowedToken[tokens[i]] = true;
            emit TokenAllowed(tokens[i], true);
        }
    }

    // ───────────────────────────── Admin ─────────────────────────────

    function setTokenAllowed(IERC20 token, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowedToken[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    // ──────────────────────────── Sponsors ────────────────────────────

    /// @notice Creates a campaign and pulls `deposit` from the sponsor (approve first).
    function createCampaign(
        IERC20 token,
        uint256 deposit,
        uint64 endsAt,
        uint64 claimWindow,
        uint256 maxPerRecipient,
        bytes32 externalRef
    ) external nonReentrant returns (uint256 campaignId) {
        if (!allowedToken[token]) revert TokenNotAllowed();
        if (deposit == 0 || endsAt <= block.timestamp || claimWindow < 1 days || claimWindow > 365 days) revert InvalidParams();
        if (maxPerRecipient == 0 || maxPerRecipient > deposit) revert InvalidParams();

        campaignId = ++campaignCount;
        _campaigns[campaignId] = Campaign({
            sponsor: msg.sender,
            token: token,
            endsAt: endsAt,
            claimWindow: claimWindow,
            claimDeadline: 0,
            reclaimed: false,
            deposit: deposit,
            maxPerRecipient: maxPerRecipient,
            allocatedTotal: 0,
            claimedTotal: 0,
            merkleRoot: bytes32(0),
            externalRef: externalRef
        });
        // Measure what actually arrived (defensive against fee-on-transfer tokens).
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), deposit);
        if (token.balanceOf(address(this)) - before != deposit) revert InvalidParams();
        emit CampaignCreated(campaignId, msg.sender, token, deposit, endsAt, claimWindow, maxPerRecipient, externalRef);
    }

    /// @notice Returns unallocated + unclaimed funds to the sponsor once claims are over
    ///         (or the whole deposit if allocations were never published in time).
    function reclaim(uint256 campaignId) external nonReentrant {
        Campaign storage c = _get(campaignId);
        if (msg.sender != c.sponsor) revert NotSponsor();
        if (c.reclaimed) revert NothingToReclaim();
        if (c.merkleRoot == bytes32(0)) {
            if (block.timestamp < uint256(c.endsAt) + ALLOCATION_GRACE) revert ClaimWindowOpen();
        } else if (block.timestamp <= c.claimDeadline) {
            revert ClaimWindowOpen();
        }
        uint256 amount = c.deposit - c.claimedTotal;
        if (amount == 0) revert NothingToReclaim();
        c.reclaimed = true;
        c.token.safeTransfer(c.sponsor, amount);
        emit Reclaimed(campaignId, c.sponsor, amount);
    }

    // ─────────────────────────── Allocator ───────────────────────────

    /// @notice Publishes the final allocations once. The allocator commits to the total so
    ///         the contract can guarantee it never exceeds the deposit.
    function publishAllocations(uint256 campaignId, bytes32 merkleRoot, uint256 allocatedTotal)
        external
        onlyRole(ALLOCATOR_ROLE)
    {
        Campaign storage c = _get(campaignId);
        if (block.timestamp < c.endsAt) revert CampaignNotEnded();
        if (c.merkleRoot != bytes32(0) || c.reclaimed) revert AlreadyPublished();
        if (merkleRoot == bytes32(0)) revert InvalidParams();
        if (allocatedTotal > c.deposit) revert ExceedsDeposit();
        c.merkleRoot = merkleRoot;
        c.allocatedTotal = allocatedTotal;
        c.claimDeadline = uint64(block.timestamp) + c.claimWindow;
        emit AllocationsPublished(campaignId, merkleRoot, allocatedTotal, c.claimDeadline);
    }

    // ─────────────────────────── Recipients ───────────────────────────

    /// @notice Claims `account`'s allocation. Anyone may submit it (gasless relaying), but
    ///         funds always go to `account`.
    function claim(uint256 campaignId, address account, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        Campaign storage c = _get(campaignId);
        if (c.merkleRoot == bytes32(0)) revert NotPublished();
        if (block.timestamp > c.claimDeadline || c.reclaimed) revert ClaimWindowClosed();
        if (hasClaimed[campaignId][account]) revert AlreadyClaimed();
        if (amount > c.maxPerRecipient) revert ExceedsRecipientCap();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(campaignId, account, amount))));
        if (!MerkleProof.verifyCalldata(proof, c.merkleRoot, leaf)) revert InvalidProof();
        if (c.claimedTotal + amount > c.allocatedTotal) revert ExceedsDeposit();

        hasClaimed[campaignId][account] = true;
        c.claimedTotal += amount;
        c.token.safeTransfer(account, amount);
        emit Claimed(campaignId, account, amount, msg.sender);
    }

    // ───────────────────────────── Views ─────────────────────────────

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return _get(campaignId);
    }

    function _get(uint256 campaignId) private view returns (Campaign storage c) {
        c = _campaigns[campaignId];
        if (c.sponsor == address(0)) revert UnknownCampaign();
    }
}
