// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RewardCampaigns} from "../src/RewardCampaigns.sol";

/// Deploys RewardCampaigns to Arc with USDC (and EURC) allowed.
///   ADMIN=0x… ALLOCATOR=0x… arc-forge script script/DeployRewardCampaigns.s.sol \
///     --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY --broadcast
contract DeployRewardCampaigns is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000; // ERC-20 interface, 6 decimals
    address constant ARC_TESTNET_EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;

    function run() external returns (RewardCampaigns rc) {
        address admin = vm.envAddress("ADMIN");
        address allocator = vm.envAddress("ALLOCATOR");
        IERC20[] memory tokens = new IERC20[](2);
        tokens[0] = IERC20(ARC_USDC);
        tokens[1] = IERC20(ARC_TESTNET_EURC);
        vm.startBroadcast();
        rc = new RewardCampaigns(admin, allocator, tokens);
        vm.stopBroadcast();
        console.log("RewardCampaigns deployed at", address(rc));
    }
}
