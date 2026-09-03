// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AgreementRegistry} from "../src/AgreementRegistry.sol";
import {WorkEscrow} from "../src/WorkEscrow.sol";

/// @notice Deploys the registry and escrow to Arc testnet.
///
/// The attestor is the address the Chainlink CRE workflow signs with. Until the
/// workflow exists (day 9), pass the deployer so the flow is testable end to end;
/// switch it before submission or the Chainlink track has nothing to show.
///
///   forge script script/Deploy.s.sol \
///     --rpc-url $ARC_RPC_URL --private-key $ARC_DEPLOYER_PRIVATE_KEY --broadcast
contract Deploy is Script {
    function run() external {
        address attestor = vm.envOr("CRE_ATTESTOR_ADDRESS", msg.sender);

        vm.startBroadcast();
        AgreementRegistry registry = new AgreementRegistry(attestor);
        WorkEscrow escrow = new WorkEscrow(registry);
        vm.stopBroadcast();

        console.log("ARC_REGISTRY_ADDRESS=%s", address(registry));
        console.log("ARC_ESCROW_ADDRESS=%s", address(escrow));
        console.log("attestor=%s", attestor);
    }
}
