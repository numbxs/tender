// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title AgreementRegistry
/// @notice Records that a Chainlink Confidential Workflow verified both parties agreed to the
///         same terms, without publishing the terms. See SPEC.md §7.
///
/// @dev The terms themselves never leave the TEE. All this contract stores is the hash the
///      enclave saw and the fact that it saw both signatures. Private data in, verifiable
///      attestation out -- the pattern that won Chainlink's Risk & Compliance and Privacy
///      tracks at Convergence.
contract AgreementRegistry {
    struct Attestation {
        bytes32 termsHash;
        address client;
        address freelancer;
        uint64 attestedAt;
    }

    /// @notice The CRE TEE handler permitted to attest. Set once at deploy.
    address public immutable attestor;

    mapping(bytes32 agreementId => Attestation) private _attestations;

    event AgreementAttested(
        bytes32 indexed agreementId, bytes32 indexed termsHash, address indexed client, address freelancer
    );

    error NotAttestor();
    error AlreadyAttested();
    error NotAttested();

    modifier onlyAttestor() {
        if (msg.sender != attestor) revert NotAttestor();
        _;
    }

    constructor(address attestor_) {
        attestor = attestor_;
    }

    /// @notice Record that the enclave saw both parties agree to `termsHash`.
    /// @dev Callable only by the registered TEE handler. Idempotency is deliberate: an
    ///      agreement attests exactly once, so a replayed workflow run cannot rewrite terms.
    function attest(bytes32 agreementId, bytes32 termsHash, address client, address freelancer)
        external
        onlyAttestor
    {
        if (_attestations[agreementId].attestedAt != 0) revert AlreadyAttested();

        _attestations[agreementId] = Attestation({
            termsHash: termsHash,
            client: client,
            freelancer: freelancer,
            attestedAt: uint64(block.timestamp)
        });

        emit AgreementAttested(agreementId, termsHash, client, freelancer);
    }

    function attestationOf(bytes32 agreementId) external view returns (Attestation memory) {
        Attestation memory a = _attestations[agreementId];
        if (a.attestedAt == 0) revert NotAttested();
        return a;
    }

    function isAttested(bytes32 agreementId) external view returns (bool) {
        return _attestations[agreementId].attestedAt != 0;
    }
}
