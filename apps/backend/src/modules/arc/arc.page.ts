import { toEventSelector, toFunctionSelector } from 'viem';

/** Selectors the page needs, computed here so the browser needs no crypto library. */
const SELECTORS = {
  createCampaign: toFunctionSelector('createCampaign(string,uint256,uint256,address,uint64)'),
  approve: toFunctionSelector('approve(address,uint256)'),
  allowance: toFunctionSelector('allowance(address,address)'),
  balanceOf: toFunctionSelector('balanceOf(address)'),
  campaignCreated: toEventSelector(
    'CampaignCreated(uint256,address,string,uint256,uint256,address,uint64,uint64)',
  ),
};

/**
 * MUSO's wallet page: links a payout wallet (sign a message) or funds a reward pool on Arc
 * (approve USDC + createCampaign with MUSO as allocator, then link it to the pool). It talks to
 * the wallet through the standard injected provider (EIP-1193), so it works in wallet apps'
 * browsers and with desktop wallet extensions. All data comes from /v1/arc/session.
 */
export function renderConnectPage(nonce: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MUSO · Arc wallet</title>
<style>
body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#F4F0E8;color:#171715;display:flex;min-height:100vh;justify-content:center}
main{max-width:420px;width:100%;padding:28px 20px;box-sizing:border-box}
.b{background:#D9FF55;color:#171715;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.08em;display:inline-block}
h1{font-size:30px;line-height:1.1;margin:16px 0 8px}p{color:#5E5B54;line-height:1.45;margin:8px 0}
button,.btn{display:block;text-align:center;text-decoration:none;box-sizing:border-box;width:100%;padding:16px;border-radius:999px;font-size:17px;font-weight:600;border:0;margin-top:16px;background:#171715;color:#F4F0E8;cursor:pointer}
button:disabled{opacity:.5}
label{display:block;font-size:13px;font-weight:600;margin-top:16px}
input{width:100%;box-sizing:border-box;font-size:22px;padding:12px 14px;border-radius:14px;border:1.5px solid #D8D1C2;background:#fff;margin-top:6px}
ol{padding-left:20px;margin:16px 0}li{margin:6px 0;color:#5E5B54}li.done{color:#171715}li.done::marker{content:'✓  '}li.now{color:#171715;font-weight:600}
.err{background:#FFE1DA;color:#8A1C0B;padding:12px 14px;border-radius:14px;margin-top:16px;display:none;white-space:pre-wrap}
.ok{background:#E9FFB0;padding:12px 14px;border-radius:14px;margin-top:16px;display:none}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all}a{color:#171715}
small{color:#8A867D}
</style></head><body><main>
<span class="b">ARC TESTNET · USDC</span>
<h1 id="title">Loading…</h1>
<p id="intro"></p>
<div id="form"></div>
<ol id="steps"></ol>
<div class="err" id="err"></div>
<div class="ok" id="ok"></div>
<button id="go" disabled>Connect wallet</button>
<a class="btn" id="back" style="display:none;background:transparent;color:#171715;border:1.5px solid #D8D1C2">Return to MUSO</a>
<p><small id="foot"></small></p>
</main>
<script nonce="${nonce}">
const SEL = ${JSON.stringify(SELECTORS)};
let T = new URLSearchParams(location.search).get('t') || '';
const $ = (id) => document.getElementById(id);
let info, account;

async function api(method, path, body) {
  const r = await fetch('/v1/arc/' + path + '?t=' + encodeURIComponent(T), {
    method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || j.message || 'Something went wrong');
  return j.data !== undefined ? j.data : j;
}
function eth() {
  if (!window.ethereum) throw new Error('No wallet found in this browser.\\n\\nOpen this link inside your wallet app’s browser (MetaMask, Coinbase Wallet, Rabby…) or on a computer with a wallet extension.');
  return window.ethereum;
}
const hex = (n) => '0x' + BigInt(n).toString(16);
const pad = (h) => String(h).replace(/^0x/, '').padStart(64, '0');
const utf8 = (s) => Array.from(new TextEncoder().encode(s)).map((b) => b.toString(16).padStart(2, '0')).join('');
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const txLink = (h) => '<a href="' + info.chain.explorerUrl + '/tx/' + h + '" target="_blank" rel="noopener">' + short(h) + '</a>';

function steps(list, current) {
  $('steps').innerHTML = list.map((s, i) => '<li class="' + (i < current ? 'done' : i === current ? 'now' : '') + '">' + s + '</li>').join('');
}
function fail(e) {
  const m = (e && (e.shortMessage || e.message)) || String(e);
  $('err').textContent = /user (rejected|denied)/i.test(m) ? 'You cancelled in your wallet. Nothing was sent.' : m;
  $('err').style.display = 'block';
  $('go').disabled = false;
}
function done(html) {
  $('ok').innerHTML = html; $('ok').style.display = 'block';
  $('go').style.display = 'none';
  $('back').style.display = 'block';
}

const pick = (a) => (Array.isArray(a) && a.length ? (typeof a[0] === 'string' ? a[0] : a[0] && a[0].address) : null);
async function connect() {
  account = pick(await eth().request({ method: 'eth_requestAccounts' }));
  if (!account) account = pick(await eth().request({ method: 'eth_accounts' })) || eth().selectedAddress || null;
  if (!account) throw new Error('Your wallet did not share an account. Unlock it, pick an account, and try again.');
  const want = hex(info.chain.id);
  const cur = await eth().request({ method: 'eth_chainId' });
  if (String(cur).toLowerCase() !== want) {
    try {
      await eth().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: want }] });
    } catch (e) {
      if (e.code !== 4902 && !/unrecognized|not been added|unknown chain/i.test(e.message || '')) throw e;
      await eth().request({ method: 'wallet_addEthereumChain', params: [{
        chainId: want, chainName: info.chain.name,
        nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
        rpcUrls: [info.chain.rpcUrl], blockExplorerUrls: [info.chain.explorerUrl],
      }] });
    }
  }
  // MetaMask mobile permits accounts per network: ask again now that Arc is selected.
  const onArc = pick(await eth().request({ method: 'eth_requestAccounts' }));
  if (onArc) account = onArc;
}
async function linkWallet() {
  if (info.linkedWallet && info.linkedWallet.toLowerCase() === account.toLowerCase()) return;
  // Sign with exactly the account the wallet exposes to this page right now.
  const current = pick(await eth().request({ method: 'eth_accounts' })) || pick(await eth().request({ method: 'eth_requestAccounts' }));
  if (current) account = current;
  if (info.linkedWallet && info.linkedWallet.toLowerCase() === account.toLowerCase()) return;
  const ch = await api('POST', 'session/challenge', { address: account });
  // Wallet apps differ in what they accept: try the standard order with the checksummed and the
  // lowercase address, then the legacy order. A user rejection stops immediately.
  const msg = '0x' + utf8(ch.message);
  const attempts = [[msg, ch.address], [msg, ch.address.toLowerCase()], [ch.address, msg], [ch.message, ch.address]];
  let signature = null, lastErr = null;
  for (const params of attempts) {
    try { signature = await eth().request({ method: 'personal_sign', params }); if (signature) break; }
    catch (e) { lastErr = e; if (e.code === 4001 || /reject|denied|cancel/i.test(e.message || '')) throw e; }
  }
  if (!signature) throw new Error('Your wallet could not sign: ' + ((lastErr && (lastErr.message || lastErr.code)) || 'unknown error') + '\\nAccount: ' + ch.address + '\\nWallet exposes: ' + JSON.stringify(await eth().request({ method: 'eth_accounts' }).catch(() => 'n/a')) + ' on chain ' + (await eth().request({ method: 'eth_chainId' }).catch(() => '?')));
  const w = await api('PUT', 'session/wallet', { address: ch.address, issuedAt: ch.issuedAt, signature });
  info.linkedWallet = w.address;
}
async function call(to, data) {
  return BigInt(await eth().request({ method: 'eth_call', params: [{ to, data }, 'latest'] }));
}
async function send(to, data) {
  const hash = await eth().request({ method: 'eth_sendTransaction', params: [{ from: account, to, data }] });
  for (;;) {
    const r = await eth().request({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (r) { if (r.status !== '0x1') throw new Error('Transaction failed: ' + hash); return r; }
    await new Promise((res) => setTimeout(res, 1500));
  }
}
function encodeCreate(title, amount, endsAt) {
  const t = utf8(title), len = t.length / 2;
  return SEL.createCampaign + pad('a0') + pad(amount.toString(16)) + pad(amount.toString(16))
    + pad(info.allocator) + pad(endsAt.toString(16)) + pad(len.toString(16)) + t.padEnd(Math.ceil(len / 32) * 64, '0');
}
function campaignTitle(s) {
  let out = '';
  for (const ch of s) { if (new TextEncoder().encode(out + ch).length > 80) break; out += ch; }
  return out || 'MUSO reward pool';
}

async function runWallet() {
  const S = ['Connect your wallet', 'Sign a message to prove it’s yours (free, no transaction)'];
  steps(S, 0); await connect();
  steps(S, 1); await linkWallet();
  steps(S, 2);
  done('Linked <span class="mono">' + info.linkedWallet + '</span>. Your reward-pool earnings will be paid here in USDC, and MUSO covers the gas.');
}

async function runFund() {
  const usdc = Number($('amount').value);
  if (!(usdc >= 1) || usdc > 1000000) throw new Error('Enter an amount of at least 1 USDC.');
  const amount = BigInt(Math.round(usdc * 1e6));
  const S = ['Connect your wallet', 'Verify it’s yours (signature, free)', 'Allow the contract to take ' + usdc + ' USDC', 'Create the campaign (USDC moves into escrow)', 'Link the campaign to this pool'];
  steps(S, 0); await connect();
  steps(S, 1); await linkWallet();
  const bal = await call(info.usdc, SEL.balanceOf + pad(account));
  if (bal < amount) throw new Error('This wallet has ' + (Number(bal) / 1e6).toFixed(2) + ' USDC on Arc Testnet; you need ' + usdc + ' plus a little for gas.\\nGet test USDC at https://faucet.circle.com (choose Arc Testnet).');
  steps(S, 2);
  const allowance = await call(info.usdc, SEL.allowance + pad(account) + pad(info.contract));
  if (allowance < amount) await send(info.usdc, SEL.approve + pad(info.contract) + pad(amount.toString(16)));
  steps(S, 3);
  const r = await send(info.contract, encodeCreate(campaignTitle(info.pool.title), amount, info.pool.endsAt));
  const log = r.logs.find((l) => l.address.toLowerCase() === info.contract.toLowerCase() && l.topics[0] === SEL.campaignCreated);
  if (!log) throw new Error('Campaign created but its id was not found. Transaction: ' + r.transactionHash);
  const id = Number(BigInt(log.topics[1]));
  steps(S, 4);
  await api('POST', 'session/fund', { campaignId: id });
  steps(S, 5);
  done('Campaign <strong>#' + id + '</strong> holds ' + usdc + ' USDC for this pool (' + txLink(r.transactionHash) + '). Creators are paid automatically when the pool ends.');
}

/** Pairing code: from /w/CODE, or typed in when the wallet app opened only the site root. */
function askCode(message) {
  return new Promise((resolve) => {
    $('title').textContent = 'Enter your MUSO code';
    $('intro').textContent = 'Your wallet app opened MUSO without the link. Type the code shown in the MUSO app.';
    $('form').innerHTML = '<label for="code">Code</label><input id="code" autocapitalize="characters" autocomplete="off" placeholder="ABCD-EFGH"><button id="paste" type="button" style="background:transparent;color:#171715;border:1.5px solid #D8D1C2;margin-top:10px;padding:12px">Paste code</button>';
    $('paste').onclick = async () => {
      try { $('code').value = (await navigator.clipboard.readText()).trim(); }
      catch { $('code').focus(); $('err').textContent = 'Long-press the box and tap Paste.'; $('err').style.display = 'block'; }
    };
    if (message) { $('err').textContent = message; $('err').style.display = 'block'; }
    $('go').textContent = 'Continue';
    $('go').disabled = false;
    $('go').onclick = () => { $('err').style.display = 'none'; resolve($('code').value); };
  });
}
async function resolveToken() {
  if (T) return;
  const m = location.pathname.match(/^\\/w\\/([A-Za-z0-9-]+)/);
  let code = m ? m[1] : await askCode();
  for (;;) {
    const clean = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const r = await fetch('/v1/arc/code/' + encodeURIComponent(clean));
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.data) { T = j.data.t; $('form').innerHTML = ''; return; }
    code = await askCode(r.status === 429 ? 'Too many tries. Wait a minute.' : 'That code didn’t work. Check it in the MUSO app (codes expire after 30 minutes).');
  }
}

(async () => {
  try {
    await resolveToken();
    info = await api('GET', 'session');
    $('back').href = info.returnUrl;
    $('foot').innerHTML = 'Contract <a class="mono" target="_blank" rel="noopener" href="' + info.chain.explorerUrl + '/address/' + info.contract + '">' + short(info.contract) + '</a> · built in Arc Studio';
    if (info.purpose === 'wallet') {
      $('title').textContent = 'Link your payout wallet';
      $('intro').textContent = 'Reward pools funded on Arc pay creators in USDC, straight to this wallet. You only sign a message: no fees, no transaction.';
      $('go').textContent = 'Connect wallet';
      $('go').onclick = () => { $('err').style.display = 'none'; $('go').disabled = true; runWallet().catch(fail); };
    } else {
      $('title').textContent = 'Fund “' + info.pool.title + '” with USDC';
      $('intro').textContent = 'Your USDC goes into the RewardCampaigns contract, not to MUSO. After the pool ends MUSO can only award it to creators, by watch time. Anything not awarded within 14 days can be reclaimed by you.';
      $('form').innerHTML = '<label for="amount">Amount (USDC)</label><input id="amount" type="number" min="1" step="0.01" inputmode="decimal">';
      $('amount').value = info.pool.suggestedUsdc;
      $('go').textContent = 'Connect wallet & fund';
      $('go').onclick = () => { $('err').style.display = 'none'; $('go').disabled = true; runFund().catch(fail); };
    }
    $('go').disabled = false;
  } catch (e) { $('title').textContent = 'Can’t continue'; fail(e); $('go').style.display = 'none'; }
})();
</script></body></html>`;
}
