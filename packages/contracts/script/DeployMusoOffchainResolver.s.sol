// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MusoOffchainResolver} from "../src/MusoOffchainResolver.sol";

/// @notice Deploys MUSO's ENS OffchainResolver (Ethereum Sepolia or mainnet, NOT Arc).
/// Env:
///   ENS_GATEWAY_URL     e.g. https://<api-host>/v1/ens/gateway/{sender}/{data}.json (from GET /v1/ens/status)
///   ENS_SIGNER_ADDRESS  address of ENS_SIGNER_PRIVATE_KEY (also shown by GET /v1/ens/status)
/// Usage:
///   arc-forge script script/DeployMusoOffchainResolver.s.sol --rpc-url $SEPOLIA_RPC_URL \
///     --private-key $DEPLOYER_KEY --broadcast
/// Then, in the ENS app (sepolia.app.ens.domains), set this contract as the resolver of muso.eth.
contract DeployMusoOffchainResolver is Script {
    function run() external returns (MusoOffchainResolver resolver) {
        string memory url = vm.envString("ENS_GATEWAY_URL");
        address[] memory signers = new address[](1);
        signers[0] = vm.envAddress("ENS_SIGNER_ADDRESS");

        vm.startBroadcast();
        resolver = new MusoOffchainResolver(msg.sender, url, signers);
        vm.stopBroadcast();

        console.log("MusoOffchainResolver:", address(resolver));
        console.log("owner:", msg.sender);
        console.log("signer:", signers[0]);
    }
}
