import { useEffect, useState } from "react";
import {
  Amount,
  AvnuSwapProvider,
  StarkSigner,
  StarkZap,
  fromAddress,
  getPresets,
  type BridgeToken,
  type ChainId,
  type FeeMode,
  type Token,
  type WalletInterface,
} from "starkzap";
import { loadBalances, type BalanceEntry } from "./balances";
import {
  connectInjectedEthereumWallet,
  executeBridgeDeposit,
  getEthereumBridgeToken,
  readBridgeSnapshot,
  type BridgeSnapshot,
  type EthereumConnection,
} from "./bridge";
import { executeSwap, quoteSwap, type SwapPreview } from "./swap";

type TokenMap = Record<string, Token>;
type ActivityTone = "error" | "info" | "success";
type ActivityItem = {
  id: number;
  message: string;
  tone: ActivityTone;
};

const configuredNetwork = normalizeNetwork(import.meta.env.VITE_STARKNET_NETWORK);
const paymasterUrl = import.meta.env.VITE_PAYMASTER_URL?.trim();
const ethereumRpcUrl = import.meta.env.VITE_ETHEREUM_RPC_URL?.trim();
const swapProvider = new AvnuSwapProvider();
const sponsoredAvailable = Boolean(paymasterUrl);
const defaultRecipient = import.meta.env.VITE_RECIPIENT?.trim() ?? "";

const sdk = new StarkZap({
  network: configuredNetwork,
  ...(paymasterUrl ? { paymaster: { nodeUrl: paymasterUrl } } : {}),
  ...(ethereumRpcUrl ? { bridging: { ethereumRpcUrl } } : {}),
});

function normalizeNetwork(value?: string): "mainnet" | "sepolia" {
  return value?.toLowerCase() === "mainnet" ? "mainnet" : "sepolia";
}

function shortAddress(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function resolveToken(tokens: TokenMap, ...symbols: string[]): Token {
  for (const symbol of symbols) {
    const token = tokens[symbol];
    if (token) {
      return token;
    }
  }

  throw new Error(`Missing token preset. Tried: ${symbols.join(", ")}`);
}

function networkLabel(chainId: ChainId): string {
  return chainId.isMainnet() ? "Starknet Mainnet" : "Starknet Sepolia";
}

function feeModeLabel(feeMode: FeeMode): string {
  return feeMode === "sponsored" ? "Sponsored" : "User Pays";
}

function createActivity(message: string, tone: ActivityTone): ActivityItem {
  return {
    id: Date.now() + Math.floor(Math.random() * 10_000),
    message,
    tone,
  };
}

function getBridgeFeeValue(
  snapshot: BridgeSnapshot | null,
  key: "approvalFee" | "l1Fee" | "l2Fee"
): string {
  if (!snapshot) {
    return "n/a";
  }

  const candidate = snapshot.feeEstimate as Partial<
    Record<"approvalFee" | "l1Fee" | "l2Fee", Amount>
  >;
  const amount = candidate[key];

  return amount ? amount.toFormatted(true) : "n/a";
}

export default function App() {
  const [privateKey, setPrivateKey] = useState(import.meta.env.VITE_PRIVATE_KEY ?? "");
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [bridgeAmount, setBridgeAmount] = useState("0.01");
  const [swapAmount, setSwapAmount] = useState("0.005");
  const [batchSwapAmount, setBatchSwapAmount] = useState("0.01");
  const [batchTransferAmount, setBatchTransferAmount] = useState("2");
  const [busy, setBusy] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletInterface | null>(null);
  const [tokens, setTokens] = useState<TokenMap | null>(null);
  const [bridgeToken, setBridgeToken] = useState<BridgeToken | null>(null);
  const [bridgeSnapshot, setBridgeSnapshot] = useState<BridgeSnapshot | null>(null);
  const [swapPreview, setSwapPreview] = useState<SwapPreview | null>(null);
  const [balances, setBalances] = useState<BalanceEntry[]>([]);
  const [ethereumConnection, setEthereumConnection] =
    useState<EthereumConnection | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([
    createActivity("Demo initialized. Connect a Starknet wallet to begin.", "info"),
  ]);
  const [walletStatus, setWalletStatus] = useState("No Starknet wallet connected yet.");
  const [swapFeeMode, setSwapFeeMode] = useState<FeeMode>(
    sponsoredAvailable ? "sponsored" : "user_pays"
  );
  const [batchFeeMode, setBatchFeeMode] = useState<FeeMode>(
    sponsoredAvailable ? "sponsored" : "user_pays"
  );

  function pushActivity(message: string, tone: ActivityTone) {
    setActivity((current) => [createActivity(message, tone), ...current].slice(0, 12));
  }

  async function refreshBalancesState(
    nextWallet: WalletInterface | null = wallet,
    nextTokens: TokenMap | null = tokens
  ) {
    if (!nextWallet || !nextTokens) {
      return;
    }

    const nextBalances = await loadBalances(nextWallet, [
      resolveToken(nextTokens, "ETH"),
      resolveToken(nextTokens, "USDC", "USDC.e"),
      resolveToken(nextTokens, "STRK"),
    ]);

    setBalances(nextBalances);
  }

  async function refreshBridgeState(
    nextWallet: WalletInterface | null = wallet,
    nextConnection: EthereumConnection | null = ethereumConnection,
    nextBridgeToken: BridgeToken | null = bridgeToken
  ) {
    if (!nextWallet || !nextConnection || !nextBridgeToken) {
      return;
    }

    const snapshot = await readBridgeSnapshot({
      externalWallet: nextConnection.wallet,
      token: nextBridgeToken,
      wallet: nextWallet,
    });

    setBridgeSnapshot(snapshot);
  }

  async function handleConnectWallet() {
    if (!privateKey.trim()) {
      pushActivity("Enter a Starknet private key first.", "error");
      return;
    }

    setBusy("starknet");
    setWalletStatus("Connecting Starknet signer wallet...");

    try {
      const nextWallet = await sdk.connectWallet({
        account: { signer: new StarkSigner(privateKey.trim()) },
        defaultSwapProviderId: swapProvider.id,
        swapProviders: [swapProvider],
      });

      const nextTokens = getPresets(nextWallet.getChainId()) as TokenMap;
      const nextBridgeToken = await getEthereumBridgeToken(sdk, "ETH");

      setWallet(nextWallet);
      setTokens(nextTokens);
      setBridgeToken(nextBridgeToken);
      setWalletStatus(
        `Connected ${shortAddress(nextWallet.address)} on ${networkLabel(nextWallet.getChainId())}.`
      );
      pushActivity(
        `Connected Starknet wallet ${shortAddress(nextWallet.address)} on ${nextWallet
          .getChainId()
          .toLiteral()}.`,
        "success"
      );

      try {
        await nextWallet.ensureReady({
          deploy: "if_needed",
          feeMode: sponsoredAvailable ? "sponsored" : "user_pays",
        });
        setWalletStatus("Wallet connected and ready for transactions.");
        pushActivity("wallet.ensureReady({ deploy: \"if_needed\" }) completed.", "success");
      } catch (error) {
        setWalletStatus("Wallet connected, but deployment/readiness still needs attention.");
        pushActivity(
          `Wallet connected, but ensureReady did not finish cleanly: ${formatError(error)}`,
          "info"
        );
      }

      await refreshBalancesState(nextWallet, nextTokens);
    } catch (error) {
      setWalletStatus("Failed to connect the Starknet wallet.");
      pushActivity(`Starknet connection failed: ${formatError(error)}`, "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleConnectEthereum() {
    if (!wallet) {
      pushActivity("Connect Starknet first so the bridge can target the right network.", "error");
      return;
    }

    setBusy("ethereum");

    try {
      const nextConnection = await connectInjectedEthereumWallet(wallet.getChainId());
      setEthereumConnection(nextConnection);
      pushActivity(
        `Connected injected Ethereum wallet ${shortAddress(nextConnection.account)} on chain ${nextConnection.chainId}.`,
        "success"
      );
      await refreshBridgeState(wallet, nextConnection, bridgeToken);
    } catch (error) {
      pushActivity(`Ethereum wallet connection failed: ${formatError(error)}`, "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleBridgeDeposit() {
    if (!wallet || !ethereumConnection || !bridgeToken) {
      pushActivity("Connect both Starknet and Ethereum wallets before bridging.", "error");
      return;
    }

    setBusy("bridge");

    try {
      const result = await executeBridgeDeposit({
        amount: bridgeAmount,
        externalWallet: ethereumConnection.wallet,
        recipient: wallet.address,
        token: bridgeToken,
        wallet,
      });

      pushActivity(
        `Bridge deposit submitted: ${result.amount.toFormatted(true)} -> ${shortAddress(result.hash)}.`,
        "success"
      );

      await refreshBridgeState();
      await refreshBalancesState();
    } catch (error) {
      pushActivity(`Bridge deposit failed: ${formatError(error)}`, "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleQuoteSwap() {
    if (!wallet || !tokens) {
      pushActivity("Connect Starknet before requesting a swap quote.", "error");
      return;
    }

    setBusy("quote");

    try {
      const preview = await quoteSwap({
        amount: swapAmount,
        provider: "avnu",
        tokenIn: resolveToken(tokens, "ETH"),
        tokenOut: resolveToken(tokens, "USDC", "USDC.e"),
        wallet,
      });

      setSwapPreview(preview);
      pushActivity(
        `Quote ready: ${preview.amountIn.toFormatted(true)} -> ${preview.amountOut.toFormatted(true)}.`,
        "success"
      );
    } catch (error) {
      pushActivity(`Swap quote failed: ${formatError(error)}`, "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleExecuteSwap() {
    if (!wallet || !tokens) {
      pushActivity("Connect Starknet before submitting a swap.", "error");
      return;
    }

    setBusy("swap");

    try {
      const result = await executeSwap({
        amount: swapAmount,
        feeMode: swapFeeMode,
        provider: "avnu",
        tokenIn: resolveToken(tokens, "ETH"),
        tokenOut: resolveToken(tokens, "USDC", "USDC.e"),
        wallet,
      });

      pushActivity(
        `Swap submitted with ${feeModeLabel(swapFeeMode)} mode: ${shortAddress(result.tx.hash)}.`,
        "success"
      );

      await result.tx.wait();
      pushActivity("Swap confirmed on Starknet.", "success");
      await refreshBalancesState();
    } catch (error) {
      pushActivity(`Swap failed: ${formatError(error)}`, "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleBatchTransaction() {
    if (!wallet || !tokens) {
      pushActivity("Connect Starknet before running the batch demo.", "error");
      return;
    }

    if (!recipient.trim()) {
      pushActivity("Enter a Starknet recipient for the batch transfer.", "error");
      return;
    }

    setBusy("batch");

    try {
      const tokenIn = resolveToken(tokens, "ETH");
      const usdc = resolveToken(tokens, "USDC", "USDC.e");
      const recipientAddress = fromAddress(recipient.trim());

      const tx = await wallet
        .tx()
        .swap({
          amountIn: Amount.parse(batchSwapAmount, tokenIn),
          provider: "avnu",
          slippageBps: 100n,
          tokenIn,
          tokenOut: usdc,
        })
        .transfer(usdc, {
          amount: Amount.parse(batchTransferAmount, usdc),
          to: recipientAddress,
        })
        .send({ feeMode: batchFeeMode });

      pushActivity(
        `Atomic batch sent with ${feeModeLabel(batchFeeMode)} mode: ${shortAddress(tx.hash)}.`,
        "success"
      );

      await tx.wait();
      pushActivity("Batch transaction confirmed.", "success");
      await refreshBalancesState();
    } catch (error) {
      pushActivity(`Batch transaction failed: ${formatError(error)}`, "error");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!wallet || !ethereumConnection || !bridgeToken) {
      return;
    }

    void refreshBridgeState(wallet, ethereumConnection, bridgeToken);
  }, [wallet, ethereumConnection, bridgeToken]);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero__eyebrow">Starkzap v2 demo repo</div>
        <h1>Bridge ETH to Starknet, swap to USDC, and show balances in one React app.</h1>
        <p className="hero__lead">
          This repo is opinionated on purpose: it keeps the UI minimal, uses a signer wallet
          for the Starknet side, and stays honest about the extra setup the bridge and sponsored
          mode actually need.
        </p>

        <div className="hero__chips">
          <span className="chip">Network: {configuredNetwork}</span>
          <span className="chip">Swap provider: AVNU</span>
          <span className="chip">
            Bridge peer dep: {ethereumRpcUrl ? "ethers + custom RPC" : "ethers"}
          </span>
          <span className="chip">
            Gasless: {sponsoredAvailable ? "paymaster URL configured" : "optional / disabled"}
          </span>
        </div>
      </section>

      <section className="feature-strip">
        <article className="feature-tile">
          <span>1</span>
          <h2>Signer wallet</h2>
          <p>`sdk.connectWallet()` + `wallet.ensureReady()` on Starknet Sepolia.</p>
        </article>
        <article className="feature-tile">
          <span>2</span>
          <h2>ETH bridge</h2>
          <p>`sdk.getBridgingTokens()` + injected Ethereum wallet + `wallet.deposit(...)`.</p>
        </article>
        <article className="feature-tile">
          <span>3</span>
          <h2>Gasless swap</h2>
          <p>`wallet.getQuote()` and `wallet.swap()` through the registered AVNU provider.</p>
        </article>
      </section>

      <section className="grid grid--two">
        <article className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__eyebrow">Step 1</div>
              <h2>Connect Starknet</h2>
            </div>
            <span className="status-pill">{wallet ? "Connected" : "Idle"}</span>
          </div>

          <label className="field">
            <span>Private key</span>
            <textarea
              className="input input--mono"
              rows={3}
              value={privateKey}
              onChange={(event) => setPrivateKey(event.target.value)}
              placeholder="0x..."
            />
          </label>

          <p className="note">
            Browser-side private keys are only acceptable for a throwaway testnet demo. Fund the
            derived address from a Sepolia faucet before trying a user-paid deploy.
          </p>

          <div className="button-row">
            <button
              className="btn btn--primary"
              onClick={handleConnectWallet}
              disabled={busy !== null}
            >
              {busy === "starknet" ? "Connecting..." : "Connect wallet"}
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => void refreshBalancesState()}
              disabled={!wallet || busy !== null}
            >
              Refresh balances
            </button>
          </div>

          <div className="info-stack">
            <div className="info-row">
              <span>Status</span>
              <strong>{walletStatus}</strong>
            </div>
            <div className="info-row">
              <span>Address</span>
              <strong className="mono">{wallet ? shortAddress(wallet.address) : "n/a"}</strong>
            </div>
            <div className="info-row">
              <span>Fee mode default</span>
              <strong>{sponsoredAvailable ? "Sponsored available" : "User pays only"}</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__eyebrow">Step 2</div>
              <h2>Bridge ETH</h2>
            </div>
            <span className="status-pill status-pill--muted">
              {ethereumConnection ? "Ethereum ready" : "Connect injected wallet"}
            </span>
          </div>

          <p className="note">
            The bridge path is different from the draft thread. The current SDK uses bridge tokens
            plus an external wallet object, not `wallet.bridge().deposit(...)`.
          </p>

          <div className="button-row">
            <button
              className="btn btn--primary"
              onClick={handleConnectEthereum}
              disabled={!wallet || busy !== null}
            >
              {busy === "ethereum" ? "Connecting..." : "Connect Ethereum wallet"}
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => void refreshBridgeState()}
              disabled={!wallet || !ethereumConnection || busy !== null}
            >
              Refresh bridge data
            </button>
          </div>

          <label className="field">
            <span>Bridge amount ({bridgeToken?.symbol ?? "ETH"})</span>
            <input
              className="input input--mono"
              value={bridgeAmount}
              onChange={(event) => setBridgeAmount(event.target.value)}
              placeholder="0.01"
            />
          </label>

          <div className="info-stack">
            <div className="info-row">
              <span>Injected wallet</span>
              <strong className="mono">
                {ethereumConnection ? shortAddress(ethereumConnection.account) : "n/a"}
              </strong>
            </div>
            <div className="info-row">
              <span>L1 balance</span>
              <strong>{bridgeSnapshot?.externalBalance.toFormatted(true) ?? "n/a"}</strong>
            </div>
            <div className="info-row">
              <span>L2 balance</span>
              <strong>{bridgeSnapshot?.starknetBalance.toFormatted(true) ?? "n/a"}</strong>
            </div>
            <div className="info-row">
              <span>Allowance</span>
              <strong>
                {bridgeSnapshot?.allowance
                  ? bridgeSnapshot.allowance.toFormatted(true)
                  : bridgeSnapshot
                    ? "Not applicable"
                    : "n/a"}
              </strong>
            </div>
          </div>

          <div className="metric-grid">
            <div className="metric-card">
              <span>L1 fee</span>
              <strong>{getBridgeFeeValue(bridgeSnapshot, "l1Fee")}</strong>
            </div>
            <div className="metric-card">
              <span>L2 fee</span>
              <strong>{getBridgeFeeValue(bridgeSnapshot, "l2Fee")}</strong>
            </div>
            <div className="metric-card">
              <span>Approval fee</span>
              <strong>{getBridgeFeeValue(bridgeSnapshot, "approvalFee")}</strong>
            </div>
          </div>

          <button
            className="btn btn--primary btn--full"
            onClick={handleBridgeDeposit}
            disabled={!wallet || !ethereumConnection || busy !== null}
          >
            {busy === "bridge" ? "Submitting deposit..." : "Bridge ETH to Starknet"}
          </button>
        </article>
      </section>

      <section className="grid grid--two">
        <article className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__eyebrow">Step 3</div>
              <h2>Swap ETH to USDC</h2>
            </div>
            <span className="status-pill">{swapPreview ? "Quote ready" : "Awaiting quote"}</span>
          </div>

          <label className="field">
            <span>Swap amount</span>
            <input
              className="input input--mono"
              value={swapAmount}
              onChange={(event) => setSwapAmount(event.target.value)}
              placeholder="0.005"
            />
          </label>

          <label className="field field--inline">
            <span>Fee mode</span>
            <select
              className="input"
              value={swapFeeMode}
              onChange={(event) => setSwapFeeMode(event.target.value as FeeMode)}
            >
              <option value="sponsored">Sponsored</option>
              <option value="user_pays">User pays</option>
            </select>
          </label>

          <div className="button-row">
            <button
              className="btn btn--ghost"
              onClick={handleQuoteSwap}
              disabled={!wallet || busy !== null}
            >
              {busy === "quote" ? "Quoting..." : "Get quote"}
            </button>
            <button
              className="btn btn--primary"
              onClick={handleExecuteSwap}
              disabled={!wallet || busy !== null}
            >
              {busy === "swap" ? "Swapping..." : "Submit swap"}
            </button>
          </div>

          <div className="metric-grid">
            <div className="metric-card">
              <span>Input</span>
              <strong>{swapPreview?.amountIn.toFormatted(true) ?? "ETH 0"}</strong>
            </div>
            <div className="metric-card">
              <span>Output</span>
              <strong>{swapPreview?.amountOut.toFormatted(true) ?? "USDC 0"}</strong>
            </div>
            <div className="metric-card">
              <span>Route calls</span>
              <strong>{swapPreview?.quote.routeCallCount ?? 0}</strong>
            </div>
            <div className="metric-card">
              <span>Price impact</span>
              <strong>
                {swapPreview?.quote.priceImpactBps != null
                  ? `${Number(swapPreview.quote.priceImpactBps) / 100}%`
                  : "n/a"}
              </strong>
            </div>
          </div>

          <p className="note">
            Gasless mode is real only if a paymaster endpoint is live. This repo exposes the
            switch, but it does not pretend that sponsored execution works without backend help.
          </p>
        </article>

        <article className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__eyebrow">Step 4</div>
              <h2>Balances</h2>
            </div>
            <span className="status-pill status-pill--muted">{balances.length} tokens</span>
          </div>

          <div className="balance-list">
            {balances.length === 0 ? (
              <div className="balance-card balance-card--empty">
                Connect a Starknet wallet to load ETH, USDC and STRK balances.
              </div>
            ) : (
              balances.map((entry) => (
                <div key={entry.token.address} className="balance-card">
                  <span>{entry.token.symbol}</span>
                  <strong>{entry.amount.toFormatted(true)}</strong>
                  <small className="mono">raw: {entry.amount.toBase().toString()}</small>
                </div>
              ))
            )}
          </div>

          <div className="code-slab">
            <code>Amount.parse()</code>
            <code>.toFormatted()</code>
            <code>wallet.balanceOf()</code>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <div className="panel__eyebrow">Bonus</div>
            <h2>Atomic batch transaction</h2>
          </div>
          <span className="status-pill status-pill--muted">swap + transfer</span>
        </div>

        <div className="grid grid--three">
          <label className="field">
            <span>Swap amount (ETH)</span>
            <input
              className="input input--mono"
              value={batchSwapAmount}
              onChange={(event) => setBatchSwapAmount(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Transfer amount (USDC)</span>
            <input
              className="input input--mono"
              value={batchTransferAmount}
              onChange={(event) => setBatchTransferAmount(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Recipient</span>
            <input
              className="input input--mono"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="0x..."
            />
          </label>
        </div>

        <div className="button-row">
          <select
            className="input input--compact"
            value={batchFeeMode}
            onChange={(event) => setBatchFeeMode(event.target.value as FeeMode)}
          >
            <option value="sponsored">Sponsored</option>
            <option value="user_pays">User pays</option>
          </select>
          <button
            className="btn btn--primary"
            onClick={handleBatchTransaction}
            disabled={!wallet || busy !== null}
          >
            {busy === "batch" ? "Sending batch..." : "Run batch demo"}
          </button>
        </div>

        <p className="note">
          This matches the current SDK transaction builder API:
          `wallet.tx().swap(...).transfer(...).send()`.
        </p>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <div className="panel__eyebrow">Log</div>
            <h2>Activity</h2>
          </div>
          <span className="status-pill status-pill--muted">{busy ?? "idle"}</span>
        </div>

        <div className="activity-log">
          {activity.map((item) => (
            <div key={item.id} className={`activity-row activity-row--${item.tone}`}>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
