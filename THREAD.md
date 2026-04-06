# Thread Draft

Note: the original brief said "BTC bridge" in the title, but the implementation and code flow are ETH. This draft keeps the thread honest and consistent with the repo.

## Tweet 1

I took a plain React + Vite app and added:

✅ ETH bridge into Starknet  
✅ ETH -> USDC swap  
✅ Balance display  
✅ Atomic swap + transfer bonus

using Starkzap v2 in about 15 minutes.

What worked, what needed extra setup, and the exact code.

@Starknet 🧵

## Tweet 2

Starting point: a basic React + Vite app. No crypto rails, no wallet flow, no balance UI.

Install:

```bash
npm install starkzap ethers
```

Why both?

- `starkzap` is the SDK
- `starknet` comes in automatically as a dependency
- `ethers` is the optional peer dep you need for Ethereum bridge flows

That part matters, because "one SDK" is true, but "zero extra deps" is not if you're bridging from Ethereum.

## Tweet 3

Step 1: initialize the SDK and connect a signer wallet.

```ts
import { StarkZap, StarkSigner, AvnuSwapProvider } from "starkzap";

const sdk = new StarkZap({ network: "sepolia" });

const wallet = await sdk.connectWallet({
  account: { signer: new StarkSigner(privateKey) },
  swapProviders: [new AvnuSwapProvider()],
  defaultSwapProviderId: "avnu",
});

await wallet.ensureReady({ deploy: "if_needed" });
```

The nice part here is the shape: one SDK instance, one wallet object, one readiness call.

## Tweet 4

Step 2: bridge ETH from Ethereum into Starknet.

```ts
const token = (await sdk.getBridgingTokens(ExternalChain.ETHEREUM))
  .find((item) => item.symbol === "ETH")!;

const ethWallet = await ConnectedEthereumWallet.from(
  {
    chain: ExternalChain.ETHEREUM,
    provider: window.ethereum,
    address,
    chainId,
  },
  wallet.getChainId()
);

const fees = await wallet.getDepositFeeEstimate(token, ethWallet);

const tx = await wallet.deposit(
  wallet.address,
  Amount.parse("0.01", token.decimals, token.symbol),
  token,
  ethWallet
);
```

This is the current bridge API. It is not `wallet.bridge().deposit(...)`.

## Tweet 5

Step 3: quote and execute the ETH -> USDC swap through AVNU.

```ts
const tokens = getPresets(wallet.getChainId());

const quote = await wallet.getQuote({
  provider: "avnu",
  tokenIn: tokens.ETH,
  tokenOut: tokens.USDC,
  amountIn: Amount.parse("0.005", tokens.ETH),
  slippageBps: 100n,
});

const tx = await wallet.swap(
  {
    provider: "avnu",
    tokenIn: tokens.ETH,
    tokenOut: tokens.USDC,
    amountIn: Amount.parse("0.005", tokens.ETH),
    slippageBps: 100n,
  },
  { feeMode: "sponsored" }
);

await tx.wait();
```

Gasless works if you actually have a paymaster path configured. The SDK side is clean; the operational setup is still real.

## Tweet 6

Step 4: balances are straightforward.

```ts
const strk = await wallet.balanceOf(tokens.STRK);
const usdc = await wallet.balanceOf(tokens.USDC);
const eth = await wallet.balanceOf(tokens.ETH);

console.log(strk.toFormatted());
console.log(usdc.toFormatted());
console.log(eth.toFormatted());
```

`Amount.parse()` and `toFormatted()` do a lot of the heavy lifting that usually turns wallet demos into decimal-conversion sludge.

## Tweet 7

Bonus: batch a swap and a transfer into one atomic Starknet transaction.

```ts
const tx = await wallet
  .tx()
  .swap({
    provider: "avnu",
    tokenIn: tokens.ETH,
    tokenOut: tokens.USDC,
    amountIn: Amount.parse("0.01", tokens.ETH),
    slippageBps: 100n,
  })
  .transfer(tokens.USDC, {
    to: recipient,
    amount: Amount.parse("2", tokens.USDC),
  })
  .send({ feeMode: "sponsored" });
```

That part feels very Starknet-native: one builder, one signature, one transaction hash.

## Tweet 8

Honest take after building this:

What I liked:

- The API reads closer to a product SDK than a protocol SDK
- `Amount` types eliminate a lot of unit mistakes
- Swaps and tx batching are clean
- Token presets save time and reduce address-copy errors

What still needs work:

- Bridge docs are thinner than the wallet/swap path
- Sponsored mode needs clearer docs around paymaster setup
- Network mismatch errors could be more explicit

Overall: one of the cleaner SDK experiences I've seen for shipping DeFi UX on a new app.

## Tweet 9

Full demo repo:

🔗 GitHub: https://github.com/Zhekinmaksim/starkzap-bridge-swap-demo

Docs and resources:

- Docs: https://docs.starknet.io/build/starkzap/overview
- Repo: https://github.com/keep-starknet-strange/starkzap
- Builder group: https://t.me/+I-Vt-_DcvecwNmY0

If you're building something real, Starknet's current Seed Grants page lists funding up to $25K in STRK for early-stage teams:
https://www.starknet.io/grants/seed-grants/

## Posting checklist

- Post this 2-3 days after the earlier thread, not back-to-back.
- Tag `@Starknet` in Tweet 1.
- Attach dark-theme code cards to Tweets 3, 5, and 7.
- Replace `YOUR_REPO_LINK` after the repo is public.
- If you record a clean browser run, use that as the Tweet 1 visual instead of a static screenshot.
- Cross-post the same thread copy to WPL after the GitHub link is live.
