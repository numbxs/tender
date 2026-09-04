// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {WorkEscrow} from "../src/WorkEscrow.sol";
import {AgreementRegistry} from "../src/AgreementRegistry.sol";

/// @dev On Arc, USDC is the native gas token, so escrow balances are native balances
///      and `deal` / `{value:}` stand in for token transfers.
contract WorkEscrowTest is Test {
    AgreementRegistry registry;
    WorkEscrow escrow;

    address attestor = address(0xA11E);
    address client = address(0xC11E);
    address freelancer = address(0xF8EE);
    address agent = address(0xA6E7);

    bytes32 constant ID = keccak256("agreement-1");
    bytes32 constant TERMS = keccak256("private terms");

    function setUp() public {
        registry = new AgreementRegistry(attestor);
        escrow = new WorkEscrow(registry);

        vm.deal(client, 1_000e6 * 1e12);
    }

    function _attest() internal {
        vm.prank(attestor);
        registry.attest(ID, TERMS, client, freelancer);
    }

    function _create(uint128 amount) internal {
        uint128[] memory amounts = new uint128[](1);
        amounts[0] = amount;
        vm.prank(client);
        escrow.createAgreement(ID, freelancer, agent, amounts, TERMS);
    }

    /// Escrow must never be funded against terms no enclave verified.
    function test_createAgreement_revertsWithoutAttestation() public {
        uint128[] memory amounts = new uint128[](1);
        amounts[0] = 100e6;
        vm.prank(client);
        vm.expectRevert(WorkEscrow.NotAttested.selector);
        escrow.createAgreement(ID, freelancer, agent, amounts, TERMS);
    }

    function test_happyPath_fundSubmitProposeApprove() public {
        _attest();
        _create(100e6);

        vm.prank(client);
        escrow.fundMilestone{value: 100e6 * 1e12}(ID, 0);
        assertEq(address(escrow).balance, 100e6 * 1e12);

        vm.prank(freelancer);
        escrow.submitMilestone(ID, 0);

        vm.prank(agent);
        escrow.proposeRelease(ID, 0);

        vm.prank(client);
        escrow.approveRelease(ID);

        assertEq(freelancer.balance, 100e6 * 1e12);
        assertEq(address(escrow).balance, 0);

        (,,, WorkEscrow.State state,,,) = escrow.agreements(ID);
        assertEq(uint8(state), uint8(WorkEscrow.State.Completed));
    }

    /// The core Ledger guarantee: an agent proposes, it can never approve.
    function test_agentCannotApproveRelease() public {
        _attest();
        _create(100e6);

        vm.prank(client);
        escrow.fundMilestone{value: 100e6 * 1e12}(ID, 0);
        vm.prank(freelancer);
        escrow.submitMilestone(ID, 0);
        vm.prank(agent);
        escrow.proposeRelease(ID, 0);

        vm.prank(agent);
        vm.expectRevert(WorkEscrow.NotClient.selector);
        escrow.approveRelease(ID);

        assertEq(freelancer.balance, 0);
    }

    function test_cannotApproveWithoutProposal() public {
        _attest();
        _create(100e6);

        vm.prank(client);
        escrow.fundMilestone{value: 100e6 * 1e12}(ID, 0);
        vm.prank(freelancer);
        escrow.submitMilestone(ID, 0);

        vm.prank(client);
        vm.expectRevert(WorkEscrow.WrongState.selector);
        escrow.approveRelease(ID);
    }

    /// Native settlement means the value sent must match the milestone exactly.
    function test_fundMilestone_rejectsWrongValue() public {
        _attest();
        _create(100e6);

        vm.prank(client);
        vm.expectRevert(WorkEscrow.WrongValue.selector);
        escrow.fundMilestone{value: 99e6 * 1e12}(ID, 0);
    }

    /// Arc keeps native value at 18dp and the USDC view at 6dp; they differ by exactly
    /// 1e12. If this ever changes, escrow would settle milestones with dust.
    function test_nativeAmount_scalesBy1e12() public view {
        assertEq(escrow.nativeAmount(100e6), 100e6 * 1e12);
        assertEq(escrow.NATIVE_PER_USDC(), 1e12);
    }

    /// Sending the raw 6dp figure instead of the scaled value must be rejected.
    function test_fundMilestone_rejectsUnscaledAmount() public {
        _attest();
        _create(100e6);

        vm.prank(client);
        vm.expectRevert(WorkEscrow.WrongValue.selector);
        escrow.fundMilestone{value: 100e6}(ID, 0);
    }

    function test_onlyAttestorCanAttest() public {
        vm.prank(client);
        vm.expectRevert(AgreementRegistry.NotAttestor.selector);
        registry.attest(ID, TERMS, client, freelancer);
    }

    function test_attestationIsIdempotentOnce() public {
        _attest();
        vm.prank(attestor);
        vm.expectRevert(AgreementRegistry.AlreadyAttested.selector);
        registry.attest(ID, keccak256("rewritten terms"), client, freelancer);
    }

    function test_multiMilestone_staysActiveUntilFinalRelease() public {
        _attest();
        uint128[] memory amounts = new uint128[](2);
        amounts[0] = 40e6;
        amounts[1] = 60e6;
        vm.prank(client);
        escrow.createAgreement(ID, freelancer, agent, amounts, TERMS);

        vm.prank(client);
        escrow.fundMilestone{value: 40e6 * 1e12}(ID, 0);
        vm.prank(freelancer);
        escrow.submitMilestone(ID, 0);
        vm.prank(agent);
        escrow.proposeRelease(ID, 0);
        vm.prank(client);
        escrow.approveRelease(ID);

        (,,, WorkEscrow.State state,,,) = escrow.agreements(ID);
        assertEq(uint8(state), uint8(WorkEscrow.State.Active));
        assertEq(freelancer.balance, 40e6 * 1e12);
    }
}
