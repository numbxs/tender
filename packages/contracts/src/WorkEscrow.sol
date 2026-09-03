// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "./IERC20.sol";
import {AgreementRegistry} from "./AgreementRegistry.sol";

/// @title WorkEscrow
/// @notice USDC escrow for milestone-based work agreements, settling on Arc. See SPEC.md §3.
///
/// @dev The release flow is deliberately two-step: an agent *proposes* a release, and the
///      client *approves* it. `approveRelease` is the call a Ledger signer signs -- the agent
///      can never move funds on its own. That separation is the Ledger submission:
///      agents propose, you approve, signers enforce.
///
///      The off-chain risk gate (SPEC §6) decides whether approving also requires a World
///      Selfie Check. This contract does not know about that -- it only enforces that the
///      client, and nobody else, authorises the transfer.
contract WorkEscrow {
    enum State {
        None,
        Active,
        MilestoneSubmitted,
        ReleasePending,
        Completed,
        Disputed,
        Cancelled
    }

    struct Milestone {
        uint128 amount;
        bool funded;
        bool released;
    }

    struct Agreement {
        address client;
        address freelancer;
        /// @notice Agent permitted to propose releases on the freelancer's behalf. May be zero.
        address agent;
        State state;
        uint32 milestoneCount;
        uint32 releasedCount;
        bytes32 termsHash;
    }

    IERC20 public immutable usdc;
    AgreementRegistry public immutable registry;

    mapping(bytes32 agreementId => Agreement) public agreements;
    mapping(bytes32 agreementId => mapping(uint32 index => Milestone)) public milestones;
    /// @notice Index the client has proposed for release, +1 so that 0 means "none pending".
    mapping(bytes32 agreementId => uint32 pendingIndexPlusOne) private _pendingRelease;

    event AgreementCreated(bytes32 indexed agreementId, address indexed client, address indexed freelancer);
    event MilestoneFunded(bytes32 indexed agreementId, uint32 index, uint128 amount);
    event MilestoneSubmitted(bytes32 indexed agreementId, uint32 index);
    event ReleaseProposed(bytes32 indexed agreementId, uint32 index, address proposer);
    event ReleaseApproved(bytes32 indexed agreementId, uint32 index, uint128 amount);
    event DisputeRaised(bytes32 indexed agreementId, address raisedBy);

    error AlreadyExists();
    error UnknownAgreement();
    error NotClient();
    error NotFreelancer();
    error NotProposer();
    error WrongState();
    error NotAttested();
    error AlreadyFunded();
    error NotFunded();
    error NoPendingRelease();
    error IndexOutOfRange();
    error TransferFailed();
    error EmptyMilestones();

    constructor(IERC20 usdc_, AgreementRegistry registry_) {
        usdc = usdc_;
        registry = registry_;
    }

    /// @notice Open an agreement. Requires the CRE workflow to have attested the terms first,
    ///         so escrow can never be funded against terms no enclave verified.
    function createAgreement(
        bytes32 agreementId,
        address freelancer,
        address agent,
        uint128[] calldata amounts,
        bytes32 termsHash
    ) external {
        if (agreements[agreementId].state != State.None) revert AlreadyExists();
        if (amounts.length == 0) revert EmptyMilestones();
        if (!registry.isAttested(agreementId)) revert NotAttested();

        agreements[agreementId] = Agreement({
            client: msg.sender,
            freelancer: freelancer,
            agent: agent,
            state: State.Active,
            milestoneCount: uint32(amounts.length),
            releasedCount: 0,
            termsHash: termsHash
        });

        for (uint32 i = 0; i < amounts.length; i++) {
            milestones[agreementId][i] = Milestone({amount: amounts[i], funded: false, released: false});
        }

        emit AgreementCreated(agreementId, msg.sender, freelancer);
    }

    /// @notice Client deposits USDC for a milestone. Not gated -- funding your own escrow is
    ///         not a consequential action (SPEC §6).
    function fundMilestone(bytes32 agreementId, uint32 index) external {
        Agreement storage a = _mustExist(agreementId);
        if (msg.sender != a.client) revert NotClient();
        if (index >= a.milestoneCount) revert IndexOutOfRange();

        Milestone storage m = milestones[agreementId][index];
        if (m.funded) revert AlreadyFunded();
        m.funded = true;

        if (!usdc.transferFrom(msg.sender, address(this), m.amount)) revert TransferFailed();
        emit MilestoneFunded(agreementId, index, m.amount);
    }

    /// @notice Freelancer marks work delivered.
    function submitMilestone(bytes32 agreementId, uint32 index) external {
        Agreement storage a = _mustExist(agreementId);
        if (msg.sender != a.freelancer) revert NotFreelancer();
        if (a.state != State.Active) revert WrongState();
        if (index >= a.milestoneCount) revert IndexOutOfRange();
        if (!milestones[agreementId][index].funded) revert NotFunded();

        a.state = State.MilestoneSubmitted;
        emit MilestoneSubmitted(agreementId, index);
    }

    /// @notice Agent (or freelancer) proposes a release. Moves no funds.
    function proposeRelease(bytes32 agreementId, uint32 index) external {
        Agreement storage a = _mustExist(agreementId);
        if (msg.sender != a.agent && msg.sender != a.freelancer) revert NotProposer();
        if (a.state != State.MilestoneSubmitted) revert WrongState();
        if (index >= a.milestoneCount) revert IndexOutOfRange();

        a.state = State.ReleasePending;
        _pendingRelease[agreementId] = index + 1;
        emit ReleaseProposed(agreementId, index, msg.sender);
    }

    /// @notice Client approves the pending release and funds move.
    /// @dev This is the call signed on a Ledger device. The agent proposed it; only the client
    ///      can authorise it. Off-chain, the risk gate may also have required a Selfie Check
    ///      before the client's wallet was allowed to build this transaction.
    function approveRelease(bytes32 agreementId) external {
        Agreement storage a = _mustExist(agreementId);
        if (msg.sender != a.client) revert NotClient();
        if (a.state != State.ReleasePending) revert WrongState();

        uint32 plusOne = _pendingRelease[agreementId];
        if (plusOne == 0) revert NoPendingRelease();
        uint32 index = plusOne - 1;
        delete _pendingRelease[agreementId];

        Milestone storage m = milestones[agreementId][index];
        if (!m.funded || m.released) revert WrongState();
        m.released = true;

        a.releasedCount += 1;
        a.state = a.releasedCount == a.milestoneCount ? State.Completed : State.Active;

        if (!usdc.transfer(a.freelancer, m.amount)) revert TransferFailed();
        emit ReleaseApproved(agreementId, index, m.amount);
    }

    /// @notice Either party halts the agreement. Resolution is out of scope (SPEC §10).
    function raiseDispute(bytes32 agreementId) external {
        Agreement storage a = _mustExist(agreementId);
        if (msg.sender != a.client && msg.sender != a.freelancer) revert NotProposer();
        if (a.state == State.Completed || a.state == State.Cancelled) revert WrongState();

        a.state = State.Disputed;
        emit DisputeRaised(agreementId, msg.sender);
    }

    function _mustExist(bytes32 agreementId) private view returns (Agreement storage a) {
        a = agreements[agreementId];
        if (a.state == State.None) revert UnknownAgreement();
    }
}
