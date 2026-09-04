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

    /// @notice Owner, permitted to rotate the attestor. Immutable: nothing in the
    ///         hackathon scope needs to transfer it, and immutability removes a
    ///         takeover path.
    address public immutable owner;

    /// @notice The CRE TEE handler permitted to attest.
    /// @dev Settable, deliberately. The workflow's signing address does not exist until
    ///      the CRE workflow is built, and WorkEscrow binds this registry at construction
    ///      -- so a fixed attestor would force redeploying BOTH contracts to switch over.
    ///      Rotating here instead keeps every deployed address stable.
    ///
    ///      The tradeoff is explicit: the owner can change who is trusted to attest.
    ///      Attestations already recorded are NOT invalidated by a rotation -- they were
    ///      valid when made, and `attest` is single-shot per agreement, so a new attestor
    ///      cannot rewrite terms an old one recorded.
    address public attestor;

    mapping(bytes32 agreementId => Attestation) private _attestations;

    event AgreementAttested(
        bytes32 indexed agreementId, bytes32 indexed termsHash, address indexed client, address freelancer
    );

    event AttestorChanged(address indexed previous, address indexed next);

    error NotAttestor();
    error NotOwner();
    error ZeroAddress();
    error AlreadyAttested();
    error NotAttested();

    modifier onlyAttestor() {
        if (msg.sender != attestor) revert NotAttestor();
        _;
    }

    constructor(address attestor_) {
        if (attestor_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        attestor = attestor_;
        emit AttestorChanged(address(0), attestor_);
    }

    /// @notice Point the registry at a new attestor -- in practice the CRE workflow's
    ///         signer, once that workflow exists.
    function setAttestor(address next) external {
        if (msg.sender != owner) revert NotOwner();
        if (next == address(0)) revert ZeroAddress();

        address previous = attestor;
        attestor = next;
        emit AttestorChanged(previous, next);
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
