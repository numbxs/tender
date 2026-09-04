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

    address client;
    uint256 clientKey;
    address freelancer;
    uint256 freelancerKey;
    address agent = address(0xA6E7);

    bytes32 constant ID = keccak256("agreement-1");
    bytes32 constant TERMS = keccak256("private terms");

    function setUp() public {
        (client, clientKey) = makeAddrAndKey("client");
        (freelancer, freelancerKey) = makeAddrAndKey("freelancer");

        registry = new AgreementRegistry();
        escrow = new WorkEscrow(registry);

        vm.deal(client, 1_000e6 * 1e12);
    }

    /// Builds the same EIP-712 digest the contract derives internally, using its own
    /// domainSeparator() rather than recomputing it -- that view is the intended way an
    /// off-chain signer would build this digest too.
    function _digest(bytes32 agreementId, bytes32 termsHash, address c, address f)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Agreement(bytes32 agreementId,bytes32 termsHash,address client,address freelancer)"
                ),
                agreementId,
                termsHash,
                c,
                f
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", registry.domainSeparator(), structHash));
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _attest() internal {
        bytes32 digest = _digest(ID, TERMS, client, freelancer);
        registry.attest(ID, TERMS, client, freelancer, _sign(clientKey, digest), _sign(freelancerKey, digest));
    }

    function _create(uint128 amount) internal {
        uint128[] memory amounts = new uint128[](1);
        amounts[0] = amount;
        vm.prank(client);
        escrow.createAgreement(ID, freelancer, agent, amounts, TERMS);
    }

    // ---- AgreementRegistry: signature-based attestation ----

    function test_attest_withBothValidSignaturesSucceeds() public {
        _attest();
        assertTrue(registry.isAttested(ID));

        AgreementRegistry.Attestation memory a = registry.attestationOf(ID);
        assertEq(a.termsHash, TERMS);
        assertEq(a.client, client);
        assertEq(a.freelancer, freelancer);
    }

    function test_attest_revertsOnWrongClientSignature() public {
        bytes32 digest = _digest(ID, TERMS, client, freelancer);
        // Freelancer's key standing in for the client's -- must not verify.
        vm.expectRevert(AgreementRegistry.ClientSignatureInvalid.selector);
        registry.attest(
            ID, TERMS, client, freelancer, _sign(freelancerKey, digest), _sign(freelancerKey, digest)
        );
    }

    function test_attest_revertsOnWrongFreelancerSignature() public {
        bytes32 digest = _digest(ID, TERMS, client, freelancer);
        vm.expectRevert(AgreementRegistry.FreelancerSignatureInvalid.selector);
        registry.attest(ID, TERMS, client, freelancer, _sign(clientKey, digest), _sign(clientKey, digest));
    }

    /// A signature over a DIFFERENT agreementId must not authorize this one -- otherwise
    /// one signed agreement could be replayed to attest an unrelated deal between the
    /// same two parties.
    function test_attest_signatureDoesNotTransferAcrossAgreementIds() public {
        bytes32 otherId = keccak256("agreement-2");
        bytes32 digestForOther = _digest(otherId, TERMS, client, freelancer);

        vm.expectRevert(AgreementRegistry.ClientSignatureInvalid.selector);
        registry.attest(
            ID,
            TERMS,
            client,
            freelancer,
            _sign(clientKey, digestForOther),
            _sign(freelancerKey, digestForOther)
        );
    }

    function test_attest_revertsIfClientEqualsFreelancer() public {
        bytes32 digest = _digest(ID, TERMS, client, client);
        vm.expectRevert(AgreementRegistry.SameParty.selector);
        registry.attest(ID, TERMS, client, client, _sign(clientKey, digest), _sign(clientKey, digest));
    }

    function test_attest_isIdempotentOnce() public {
        _attest();
        bytes32 digest = _digest(ID, keccak256("rewritten"), client, freelancer);
        vm.expectRevert(AgreementRegistry.AlreadyAttested.selector);
        registry.attest(
            ID,
            keccak256("rewritten"),
            client,
            freelancer,
            _sign(clientKey, digest),
            _sign(freelancerKey, digest)
        );
    }

    function test_attest_isPermissionless() public {
        // Neither party needs to be msg.sender -- a third party (e.g. the UI's own relayer)
        // can submit the transaction, since authority comes from the two signatures.
        bytes32 digest = _digest(ID, TERMS, client, freelancer);
        vm.prank(address(0xD00D));
        registry.attest(ID, TERMS, client, freelancer, _sign(clientKey, digest), _sign(freelancerKey, digest));
        assertTrue(registry.isAttested(ID));
    }

    // ---- WorkEscrow ----

    /// Escrow must never be funded against terms neither party actually signed.
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
