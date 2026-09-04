#!/usr/bin/env bash
#
# Proves the full agreement lifecycle against a live Arc deployment:
#   attest -> create -> fund -> submit -> propose -> approve
#
# Three roles, three keys. The point of the run is the last two steps: the AGENT
# proposes the release and cannot approve it; only the CLIENT can. That
# separation is the Ledger submission (SPEC §4), so it is worth watching it
# happen on-chain rather than only in Foundry.
#
# Usage:  set -a; . .env.local; set +a; ./packages/contracts/script/prove-cycle.sh
#
# The Arc testnet RPC resets connections intermittently, so every call retries.

set -euo pipefail

: "${ARC_RPC_URL:?}" "${ARC_ESCROW_ADDRESS:?}" "${ARC_REGISTRY_ADDRESS:?}"
: "${ARC_DEPLOYER_PRIVATE_KEY:?}" "${ARC_FREELANCER_PRIVATE_KEY:?}" "${ARC_AGENT_PRIVATE_KEY:?}"
: "${ARC_DEPLOYER_ADDRESS:?}" "${ARC_FREELANCER_ADDRESS:?}" "${ARC_AGENT_ADDRESS:?}"

MILESTONE_USDC=${MILESTONE_USDC:-1000000}          # 1 USDC in 6dp base units
MILESTONE_WEI=$(python3 -c "print($MILESTONE_USDC * 10**12)")
ID=$(cast keccak "tender-cycle-$(date +%s)")

# Retry wrapper: the public RPC drops connections under load.
retry() {
  local n=0
  until "$@"; do
    n=$((n + 1))
    [ $n -ge 5 ] && { echo "FAILED after $n attempts: $*" >&2; return 1; }
    sleep 4
  done
}

send() { # send <key> <to> <sig> [args...]
  local key=$1 to=$2; shift 2
  retry cast send "$to" "$@" --private-key "$key" --rpc-url "$ARC_RPC_URL" \
    --json | python3 -c 'import sys,json
# cast may append extra output after the JSON object; raw_decode tolerates it.
obj, _ = json.JSONDecoder().raw_decode(sys.stdin.read().strip())
print(obj["transactionHash"], "status=" + str(obj["status"]))'
}

call() { retry cast call "$@" --rpc-url "$ARC_RPC_URL"; }

echo "agreement id: $ID"
echo "milestone:    $MILESTONE_USDC (6dp) = $MILESTONE_WEI wei"
echo

echo "1/6 attest        (attestor)   $(send "$ARC_DEPLOYER_PRIVATE_KEY" "$ARC_REGISTRY_ADDRESS" \
  'attest(bytes32,bytes32,address,address)' "$ID" "$(cast keccak 'private terms')" \
  "$ARC_DEPLOYER_ADDRESS" "$ARC_FREELANCER_ADDRESS")"

echo "2/6 create        (client)     $(send "$ARC_DEPLOYER_PRIVATE_KEY" "$ARC_ESCROW_ADDRESS" \
  'createAgreement(bytes32,address,address,uint128[],bytes32)' "$ID" \
  "$ARC_FREELANCER_ADDRESS" "$ARC_AGENT_ADDRESS" "[$MILESTONE_USDC]" "$(cast keccak 'private terms')")"

echo "3/6 fund          (client)     $(send "$ARC_DEPLOYER_PRIVATE_KEY" "$ARC_ESCROW_ADDRESS" \
  'fundMilestone(bytes32,uint32)' "$ID" 0 --value "$MILESTONE_WEI")"

echo "4/6 submit        (freelancer) $(send "$ARC_FREELANCER_PRIVATE_KEY" "$ARC_ESCROW_ADDRESS" \
  'submitMilestone(bytes32,uint32)' "$ID" 0)"

echo "5/6 propose       (agent)      $(send "$ARC_AGENT_PRIVATE_KEY" "$ARC_ESCROW_ADDRESS" \
  'proposeRelease(bytes32,uint32)' "$ID" 0)"

BEFORE=$(retry cast balance "$ARC_FREELANCER_ADDRESS" --rpc-url "$ARC_RPC_URL")

echo "6/6 approve       (client)     $(send "$ARC_DEPLOYER_PRIVATE_KEY" "$ARC_ESCROW_ADDRESS" \
  'approveRelease(bytes32)' "$ID")"

AFTER=$(retry cast balance "$ARC_FREELANCER_ADDRESS" --rpc-url "$ARC_RPC_URL")
echo
python3 -c "
d = $AFTER - $BEFORE
print(f'freelancer received: {d} wei = {d/1e18:.6f} USDC')
assert d == $MILESTONE_WEI, f'MISMATCH: expected $MILESTONE_WEI'
print('state:', end=' ')
"
STATE=$(call "$ARC_ESCROW_ADDRESS" 'agreements(bytes32)(address,address,address,uint8,uint32,uint32,bytes32)' "$ID" | sed -n '4p')
echo "agreement state = $STATE (4 = Completed)"
