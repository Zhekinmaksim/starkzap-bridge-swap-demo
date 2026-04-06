import {
  Amount,
  type FeeMode,
  type SwapQuote,
  type Token,
  type Tx,
  type WalletInterface,
} from "starkzap";

export type SwapPreview = {
  amountIn: Amount;
  amountOut: Amount;
  quote: SwapQuote;
};

export async function quoteSwap(params: {
  wallet: WalletInterface;
  tokenIn: Token;
  tokenOut: Token;
  amount: string;
  provider?: string;
  slippageBps?: bigint;
}): Promise<SwapPreview> {
  const amountIn = Amount.parse(params.amount, params.tokenIn);
  const quote = await params.wallet.getQuote({
    amountIn,
    provider: params.provider ?? "avnu",
    slippageBps: params.slippageBps ?? 100n,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
  });

  return {
    amountIn,
    amountOut: Amount.fromRaw(quote.amountOutBase, params.tokenOut),
    quote,
  };
}

export async function executeSwap(params: {
  wallet: WalletInterface;
  tokenIn: Token;
  tokenOut: Token;
  amount: string;
  feeMode: FeeMode;
  provider?: string;
  slippageBps?: bigint;
}): Promise<{ amountIn: Amount; tx: Tx }> {
  const amountIn = Amount.parse(params.amount, params.tokenIn);
  const tx = await params.wallet.swap(
    {
      amountIn,
      provider: params.provider ?? "avnu",
      slippageBps: params.slippageBps ?? 100n,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
    },
    { feeMode: params.feeMode }
  );

  return { amountIn, tx };
}
