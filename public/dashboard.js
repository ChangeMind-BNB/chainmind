const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const contentEl = document.getElementById('content');

if (!token) {
  contentEl.innerHTML = '<div class="error">No token provided. Add ?token=YOUR_API_TOKEN to the URL.</div>';
} else {
  loadDashboard();
}

async function loadDashboard() {
  try {
    const [balanceRes, txRes] = await Promise.all([
      fetch(`/proxy/${token}/balance`),
      fetch(`/proxy/${token}/transactions?limit=50`),
    ]);

    if (!balanceRes.ok) {
      const err = await balanceRes.json().catch(() => ({ error: 'Unknown error' }));
      contentEl.innerHTML = `<div class="error">${err.error || 'Failed to load balance'}</div>`;
      return;
    }

    const balance = await balanceRes.json();
    const txData = await txRes.json();

    renderDashboard(balance, txData);
  } catch (err) {
    contentEl.innerHTML = `<div class="error">Connection error: ${err.message}</div>`;
  }
}

function renderDashboard(balance, txData) {
  const txs = txData.transactions || [];
  const totalSpent = txs
    .filter(t => t.type === 'llm_call')
    .reduce((sum, t) => sum + Math.abs(parseFloat(t.cost_usdc)), 0);
  const totalCalls = txs.filter(t => t.type === 'llm_call').length;

  contentEl.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">Balance</div>
        <div class="value">${balance.balance_usdc} USDC</div>
        <div class="sub">${balance.balance_micro_usdc.toLocaleString()} micro-USDC</div>
      </div>
      <div class="stat-card">
        <div class="label">Total Spent</div>
        <div class="value">$${totalSpent.toFixed(4)}</div>
        <div class="sub">${totalCalls} API calls</div>
      </div>
      <div class="stat-card">
        <div class="label">Status</div>
        <div class="value" style="color: ${balance.is_active ? 'var(--green)' : 'var(--red)'}">
          ${balance.is_active ? 'Active' : 'Inactive'}
        </div>
        <div class="sub">${balance.is_active ? 'Ready for API calls' : 'Deposit USDC to activate'}</div>
      </div>
    </div>

    <div class="deposit-info">
      <h3>Deposit Code</h3>
      <div class="deposit-code">${balance.deposit_code}</div>
      <p style="color: var(--text-muted); font-size: 0.85rem;">
        Use this code when calling deposit() on the ChainMind contract.
      </p>
    </div>

    <div class="connect-info">
      <h3>Connect Your Agent</h3>
      <div class="connect-code" onclick="navigator.clipboard.writeText(this.innerText)">
        export ANTHROPIC_BASE_URL=https://api.chainmind.xyz/proxy/${token}
      </div>
      <div class="connect-code" onclick="navigator.clipboard.writeText(this.innerText)">
        export ANTHROPIC_API_KEY=chainmind
      </div>
      <p style="color: var(--text-muted); font-size: 0.8rem;">Click to copy. Works with Claude Code, Anthropic SDK, and OpenAI SDK.</p>
    </div>

    <h2 class="section-title">Transaction History</h2>
    ${txs.length === 0
      ? '<p style="color: var(--text-muted);">No transactions yet.</p>'
      : `<table class="tx-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Model</th>
            <th>Input</th>
            <th>Output</th>
            <th>Cost</th>
            <th>Balance After</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          ${txs.map(tx => `
            <tr>
              <td><span class="tx-type ${tx.type}">${tx.type}</span></td>
              <td style="font-family: var(--font-mono); font-size: 0.8rem;">${tx.model || '—'}${tx.routed ? ' <span style="color: var(--accent);">(routed)</span>' : ''}</td>
              <td>${tx.input_tokens?.toLocaleString() ?? '—'}</td>
              <td>${tx.output_tokens?.toLocaleString() ?? '—'}</td>
              <td style="font-family: var(--font-mono);">$${tx.cost_usdc}</td>
              <td style="font-family: var(--font-mono);">$${tx.balance_after_usdc}</td>
              <td style="color: var(--text-muted); font-size: 0.8rem;">${new Date(tx.created_at).toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    }
  `;
}

// Auto-refresh every 30 seconds
setInterval(loadDashboard, 30000);
