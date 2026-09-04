// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title AgreementRegistry
/// @notice Records that both parties to a deal signed the same terms hash. See SPEC.md §7.
///
/// @dev No trusted third party. Both `client` and `freelancer` sign an EIP-712 message
///      committing to `(agreementId, termsHash, client, freelancer)` off-chain -- in
///      practice, from their Privy embedded wallets, with the UI requiring a World Selfie
///      Check pass immediately before the signature prompt (SPEC §6). Anyone can then
///      submit both signatures in one transaction; the contract only records the
///      attestation if both recover to the addresses named in it.
///
///      This replaces an earlier design that used a Chainlink CRE workflow as a trusted
///      attestor. Dropping the oracle is deliberate: the "proof" the product promises is
///      that a human (or their accountable agent) actually signed -- a wallet signature
///      behind a Selfie Check gate demonstrates exactly that, and needs no oracle to trust.
///      Terms themselves are never published on either design; only the hash is.
contract AgreementRegistry {
    struct Attestation {
        bytes32 termsHash;
        address client;
        address freelancer;
        uint64 attestedAt;
    }

    bytes32 private constant AGREEMENT_TYPEHASH =
        keccak256("Agreement(bytes32 agreementId,bytes32 termsHash,address client,address freelancer)");

    bytes32 private immutable DOMAIN_SEPARATOR;

    mapping(bytes32 agreementId => Attestation) private _attestations;

    event AgreementAttested(
        bytes32 indexed agreementId, bytes32 indexed termsHash, address indexed client, address freelancer
    );

    error AlreadyAttested();
    error NotAttested();
    error InvalidSignatureLength();
    error ClientSignatureInvalid();
    error FreelancerSignatureInvalid();
    error SameParty();

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("Tender"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice Record that both `client` and `freelancer` signed `termsHash` for this agreement.
    /// @dev Permissionless: any address may relay the transaction, since the two signatures
    ///      are what carries authority, not the caller. Idempotent per agreement -- a replay
    ///      of the same signatures after the first success just reverts with AlreadyAttested,
    ///      and no signature can rewrite an agreement someone else already attested.
    function attest(
        bytes32 agreementId,
        bytes32 termsHash,
        address client,
        address freelancer,
        bytes calldata clientSignature,
        bytes calldata freelancerSignature
    ) external {
        if (client == freelancer) revert SameParty();
        if (_attestations[agreementId].attestedAt != 0) revert AlreadyAttested();

        bytes32 structHash =
            keccak256(abi.encode(AGREEMENT_TYPEHASH, agreementId, termsHash, client, freelancer));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        if (_recover(digest, clientSignature) != client) revert ClientSignatureInvalid();
        if (_recover(digest, freelancerSignature) != freelancer) revert FreelancerSignatureInvalid();

        _attestations[agreementId] = Attestation({
            termsHash: termsHash,
            client: client,
            freelancer: freelancer,
            attestedAt: uint64(block.timestamp)
        });

        emit AgreementAttested(agreementId, termsHash, client, freelancer);
    }

    /// @notice The EIP-712 domain separator, for constructing signatures off-chain.
    function domainSeparator() external view returns (bytes32) {
        return DOMAIN_SEPARATOR;
    }

    function attestationOf(bytes32 agreementId) external view returns (Attestation memory) {
        Attestation memory a = _attestations[agreementId];
        if (a.attestedAt == 0) revert NotAttested();
        return a;
    }

    function isAttested(bytes32 agreementId) external view returns (bool) {
        return _attestations[agreementId].attestedAt != 0;
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert InvalidSignatureLength();

        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);

        // EIP-2 malleability guard: only accept the lower-half s values a well-formed
        // wallet signature always produces.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }

        return ecrecover(digest, v, r, s);
    }
}
