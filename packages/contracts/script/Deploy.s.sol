// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AgreementRegistry} from "../src/AgreementRegistry.sol";
import {WorkEscrow} from "../src/WorkEscrow.sol";

/// @notice Deploys the registry and escrow to Arc testnet.
///
/// AgreementRegistry takes no constructor argument now -- there is no attestor to
/// configure. Both parties sign the agreement themselves; the registry only verifies
/// their EIP-712 signatures at `attest()` time.
///
///   forge script script/Deploy.s.sol \
///     --rpc-url $ARC_RPC_URL --private-key $ARC_DEPLOYER_PRIVATE_KEY --broadcast
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        AgreementRegistry registry = new AgreementRegistry();
        WorkEscrow escrow = new WorkEscrow(registry);
        vm.stopBroadcast();

        console.log("ARC_REGISTRY_ADDRESS=%s", address(registry));
        console.log("ARC_ESCROW_ADDRESS=%s", address(escrow));
    }
}
