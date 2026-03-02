import { ethers } from 'ethers';
import { config } from '../config.js';
import { rawDb } from '../db/index.js';

// ChainMindDeposit.Deposit event signature
const DEPOSIT_EVENT_TOPIC = ethers.id('Deposit(address,uint256,bytes16,uint256)');

// USDC on BSC has 18 decimals. Internal storage is micro-USDC (6 decimals).
// Conversion: microUsdc = onChainAmount / 10^12
const DECIMALS_CONVERSION = 10n ** 12n;

let provider: ethers.JsonRpcProvider;

function getLastProcessedBlock(): number {
  const row = rawDb.prepare("SELECT value FROM kv WHERE key = 'last_processed_block'").get() as
    | { value: string }
    | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

function setLastProcessedBlock(block: number): void {
  rawDb
    .prepare(
      "INSERT INTO kv (key, value) VALUES ('last_processed_block', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
    )
    .run(String(block), String(block));
}

function findAgentByDepositCode(depositCodeHex: string): { id: number; deposit_code: string } | undefined {
  // bytes16 indexed in event topics is stored as bytes32 (right-padded with zeros).
  // Our deposit codes are 16 hex chars (8 bytes) stored uppercase.
  // Extract the first 16 hex chars after 0x prefix — that's the actual bytes16 content.
  const raw = depositCodeHex.replace(/^0x/i, '');
  const cleanCode = raw.slice(0, 16).toUpperCase();

  return rawDb.prepare('SELECT id, deposit_code FROM agents WHERE deposit_code = ? AND is_active = 0').get(cleanCode) as
    | { id: number; deposit_code: string }
    | undefined;
}

async function pollDeposits(): Promise<void> {
  try {
    const currentBlock = await provider.getBlockNumber();
    const lastBlock = getLastProcessedBlock();

    // On first run, start from current block minus a small window
    const fromBlock = lastBlock === 0 ? Math.max(0, currentBlock - 100) : lastBlock + 1;

    // Don't process blocks that haven't reached confirmation threshold
    const safeBlock = currentBlock - config.depositConfirmations;
    if (fromBlock > safeBlock) return;

    const logs = await provider.getLogs({
      address: config.contractAddress,
      topics: [DEPOSIT_EVENT_TOPIC],
      fromBlock,
      toBlock: safeBlock,
    });

    for (const log of logs) {
      processDepositLog(log);
    }

    setLastProcessedBlock(safeBlock);
  } catch (err) {
    console.error('[deposit-watcher] Poll error:', err);
  }
}

function processDepositLog(log: ethers.Log): void {
  const txHash = log.transactionHash;

  // Check for duplicate
  const existing = rawDb.prepare('SELECT id FROM deposits WHERE tx_hash = ?').get(txHash);
  if (existing) return;

  // Decode event data
  // Topics: [eventSig, senderIndexed, depositCodeIndexed]
  // Data: [amount (uint256), timestamp (uint256)]
  const sender = ethers.getAddress('0x' + log.topics[1]!.slice(26));
  const depositCodeRaw = log.topics[2]!; // bytes16 indexed, stored as bytes32

  const iface = new ethers.Interface([
    'event Deposit(address indexed sender, uint256 amount, bytes16 indexed depositCode, uint256 timestamp)',
  ]);
  const decoded = iface.decodeEventLog('Deposit', log.data, log.topics);
  const amountRaw = decoded[1] as bigint;

  // Convert 18-decimal on-chain amount to micro-USDC (6 decimal internal)
  const microUsdc = Number(amountRaw / DECIMALS_CONVERSION);

  // Find matching agent by deposit code
  const agent = findAgentByDepositCode(depositCodeRaw);
  if (!agent) {
    console.warn(`[deposit-watcher] No agent found for deposit code ${depositCodeRaw}, tx ${txHash}`);
    return;
  }

  const now = new Date().toISOString();

  // Credit agent in a transaction
  const creditTx = rawDb.transaction(() => {
    rawDb
      .prepare(
        `INSERT INTO deposits (agent_id, tx_hash, from_address, amount_micro_usdc, block_number, confirmed, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`
      )
      .run(agent.id, txHash, sender, microUsdc, log.blockNumber, now);

    rawDb.prepare('UPDATE agents SET balance_micro_usdc = balance_micro_usdc + ?, is_active = 1 WHERE id = ?').run(
      microUsdc,
      agent.id
    );

    const updated = rawDb.prepare('SELECT balance_micro_usdc FROM agents WHERE id = ?').get(agent.id) as {
      balance_micro_usdc: number;
    };

    rawDb
      .prepare(
        `INSERT INTO transactions (agent_id, type, cost_micro_usdc, balance_after_micro_usdc, tx_hash, created_at)
         VALUES (?, 'deposit', ?, ?, ?, ?)`
      )
      .run(agent.id, microUsdc, updated.balance_micro_usdc, txHash, now);
  });

  creditTx();
  console.log(
    `[deposit-watcher] Credited agent ${agent.id} with ${microUsdc} micro-USDC (tx: ${txHash})`
  );
}

export function startDepositWatcher(): void {
  provider = new ethers.JsonRpcProvider(config.bscRpcUrl);
  console.log('[deposit-watcher] Starting, polling every', config.depositPollIntervalMs, 'ms');

  // Initial poll
  pollDeposits();

  // Recurring poll
  setInterval(pollDeposits, config.depositPollIntervalMs);
}
