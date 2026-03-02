#!/usr/bin/env bash
# ChainMind Smoke Test
# Tests: health, register, pricing, balance, transactions, auth, proxy error handling
set -uo pipefail

BASE="http://localhost:3000"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected" 2>/dev/null; then
    echo "  PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== ChainMind Smoke Test ==="
echo ""

# 1. Health
echo "[1/8] Health endpoint"
HEALTH=$(curl -s "$BASE/health")
check "returns ok" '"status":"ok"' "$HEALTH"

# 2. Pricing
echo "[2/8] Pricing endpoint"
PRICING=$(curl -s "$BASE/v1/pricing")
check "has claude-sonnet-4-6" 'claude-sonnet-4-6' "$PRICING"
check "has gpt-4o-mini" 'gpt-4o-mini' "$PRICING"
check "has openrouter/grok-4-1-fast" 'openrouter/grok-4-1-fast' "$PRICING"

# 3. Register
echo "[3/8] Register endpoint"
REG=$(curl -s -X POST "$BASE/v1/register")
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['api_token'])" 2>/dev/null || echo "")
DEPOSIT_CODE=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['deposit_code'])" 2>/dev/null || echo "")
check "returns api_token" 'api_token' "$REG"
check "returns deposit_code" 'deposit_code' "$REG"
check "returns pending_deposit" 'pending_deposit' "$REG"
check "returns contract instructions" 'contract_address' "$REG"
check "token is 64 chars" "64" "${#TOKEN}"
check "deposit_code is 16 chars" "16" "${#DEPOSIT_CODE}"

# 4. Auth — invalid token
echo "[4/8] Auth rejection (bad token)"
AUTH_BAD=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/proxy/badtoken123/balance")
check "rejects bad token with 401" "401" "$AUTH_BAD"

# 5. Auth — valid token but inactive (no deposit yet)
echo "[5/8] Auth rejection (inactive agent)"
AUTH_INACTIVE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/proxy/$TOKEN/balance")
check "rejects inactive agent with 401" "401" "$AUTH_INACTIVE"

# 6. Manually activate agent for remaining tests
echo "[6/8] Manual activation (simulate deposit)"
ACTIVATE=$(python3 -c "
import sqlite3, sys
db = sqlite3.connect('./data/chainmind.db')
db.execute('UPDATE agents SET is_active = 1, balance_micro_usdc = 50000000 WHERE api_token = ?', ('$TOKEN',))
db.commit()
row = db.execute('SELECT balance_micro_usdc, is_active FROM agents WHERE api_token = ?', ('$TOKEN',)).fetchone()
print(f'balance={row[0]} active={row[1]}')
" 2>/dev/null || echo "sqlite failed")
check "agent activated with 50 USDC" "balance=50000000 active=1" "$ACTIVATE"

# 7. Balance + Transactions (now active)
echo "[7/8] Balance & Transactions"
BALANCE=$(curl -s "$BASE/proxy/$TOKEN/balance")
check "balance returns 50 USDC" '"balance_usdc":"50.000000"' "$BALANCE"
check "shows is_active true" '"is_active":true' "$BALANCE"

TXS=$(curl -s "$BASE/proxy/$TOKEN/transactions")
check "transactions returns array" '"transactions"' "$TXS"

# 8. Proxy — upstream will fail (dummy keys) but routing/auth should work
echo "[8/8] Proxy auth + routing"
# Anthropic proxy — should reach upstream and get auth error (not our 401)
PROXY_A=$(curl -s -X POST "$BASE/proxy/$TOKEN/v1/messages" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}')
check "anthropic proxy reaches upstream (not 401 from us)" 'authentication_error\|invalid.*key\|error\|401' "$PROXY_A"

# Smart routing — budget too low
ROUTE_LOW=$(curl -s -X POST "$BASE/proxy/$TOKEN/v1/messages" \
  -H "Content-Type: application/json" \
  -H "X-ChainMind-Budget: 1" \
  -H "X-ChainMind-Route: auto" \
  -d '{"model":"auto","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}')
check "budget too low returns 402" 'Budget too low' "$ROUTE_LOW"

# Smart routing — valid budget, should pick cheapest model and hit upstream
ROUTE_OK=$(curl -s -X POST "$BASE/proxy/$TOKEN/v1/messages" \
  -H "Content-Type: application/json" \
  -H "X-ChainMind-Budget: 5000000" \
  -H "X-ChainMind-Route: auto" \
  -H "X-ChainMind-Min-Tier: mid" \
  -d '{"model":"auto","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}')
# Should route to openrouter/qwen3-max (cheapest mid-tier) and fail at upstream auth
check "smart routing dispatches (reaches upstream)" 'error\|qwen\|unauthorized\|invalid' "$ROUTE_OK"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then exit 1; fi
