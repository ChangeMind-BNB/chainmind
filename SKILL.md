# ChainMind — AI Agent Billing Proxy on BNB Chain
# Version: 0.1.0
# Canonical URL: https://chainmind.xyz/SKILL.md

## What is ChainMind?

ChainMind is a transparent billing proxy that enables autonomous AI agents to
deposit USDC on BNB Chain and pay per-token for LLM compute. No credit card,
no human approval, no billing forms. Agents self-register via API, deposit via
a verified smart contract, and route inference calls through ChainMind.

Supported providers: Anthropic (Claude), OpenAI (GPT), OpenRouter (Qwen, Grok, Gemini).

## Quick Start

### Step 1 — Register

```bash
curl -X POST https://api.chainmind.xyz/v1/register
```

Returns: `api_token`, `deposit_code`, contract address, and deposit instructions.

### Step 2 — Deposit USDC (BEP-20)

```solidity
// 1. Approve the ChainMind contract to spend your USDC
usdc.approve(CONTRACT_ADDRESS, amount);

// 2. Call deposit with your deposit code
chainmind.deposit(amount, depositCode);
```

- Network: BNB Smart Chain (BSC), Chain ID 56
- USDC: `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` (18 decimals)
- Contract: see registration response for address
- Confirmation: ~45 seconds (15 blocks)

### Step 3 — Configure SDK

```bash
export ANTHROPIC_BASE_URL=https://api.chainmind.xyz/proxy/{YOUR_API_TOKEN}
export ANTHROPIC_API_KEY=chainmind
```

Or in Python:

```python
import anthropic

client = anthropic.Anthropic(
    base_url="https://api.chainmind.xyz/proxy/{YOUR_API_TOKEN}",
    api_key="chainmind",
)
```

For OpenAI SDK:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.chainmind.xyz/proxy/{YOUR_API_TOKEN}/v1",
    api_key="chainmind",
)
```

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | None | Service status |
| POST | `/v1/register` | None | Create agent account |
| GET | `/v1/pricing` | None | Current model pricing |
| GET | `/proxy/{token}/balance` | Token | USDC balance |
| GET | `/proxy/{token}/transactions` | Token | Transaction history |
| POST | `/proxy/{token}/v1/messages` | Token | Anthropic-compatible proxy |
| POST | `/proxy/{token}/v1/chat/completions` | Token | OpenAI-compatible proxy |

## Smart Model Routing (unique to ChainMind)

Set a budget per request and ChainMind picks the cheapest model that fits:

```bash
curl -X POST https://api.chainmind.xyz/proxy/{TOKEN}/v1/messages \
  -H "X-ChainMind-Budget: 500000" \
  -H "X-ChainMind-Route: auto" \
  -H "X-ChainMind-Min-Tier: mid" \
  -H "Content-Type: application/json" \
  -d '{"max_tokens": 1024, "messages": [{"role": "user", "content": "Hello"}]}'
```

### Headers

- `X-ChainMind-Budget: <micro-USDC>` — max cost for this request (500000 = $0.50)
- `X-ChainMind-Route: auto` — enable smart routing (without this, uses model from body)
- `X-ChainMind-Min-Tier: low|mid|high` — quality floor (default: low)

### Tiers

- `low` — all models: gpt-4o-mini, grok-4-1-fast, claude-haiku-4-5
- `mid` — skip budget models: qwen3-max, gemini-3.1-pro and above
- `high` — premium only: gpt-4o, claude-sonnet-4-6, claude-opus-4-6

### Response

- `X-ChainMind-Model-Used` header tells you which model was selected
- Billing SSE event (streaming) or `X-Balance-Remaining` header (non-streaming)

## Pricing

All prices in USDC per 1M tokens. 10% markup over provider costs.

| Model | Input | Output | Cache Read |
|-------|-------|--------|------------|
| claude-sonnet-4-6 | $3.30 | $16.50 | $0.33 |
| claude-opus-4-6 | $5.50 | $27.50 | $0.55 |
| claude-haiku-4-5 | $1.10 | $5.50 | $0.11 |
| gpt-4o | $2.75 | $11.00 | $1.375 |
| gpt-4o-mini | $0.165 | $0.66 | $0.0825 |
| openrouter/qwen3-max | $1.32 | $6.60 | $0.264 |
| openrouter/grok-4-1-fast | $0.22 | $0.55 | $0.055 |
| openrouter/gemini-3.1-pro | $2.20 | $13.20 | $0.55 |

Cache write tokens billed at 1.25x input rate.

## Response Headers

- `X-Balance-Remaining` — USDC balance after debit (non-streaming)
- `X-Request-Cost` — cost of this request in USDC (non-streaming)
- `X-ChainMind-Model-Used` — model selected by smart routing

## Billing SSE Event (streaming)

At end of stream, a `billing` event is sent:

```json
{
  "cost_usdc": "0.00340000",
  "balance_remaining": "4.230000",
  "tokens": { "input": 150, "output": 500, "cache_read": 0, "cache_write": 0 }
}
```

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request |
| 401 | Invalid or inactive API token |
| 402 | Insufficient balance / budget too low |
| 429 | Rate limited |
| 502 | Upstream provider error |
| 503 | Service unavailable |

## Self-Update

Check `https://chainmind.xyz/SKILL.md` for the latest version on startup and every 24 hours.
