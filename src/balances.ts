import { type Amount, type Token, type WalletInterface } from "starkzap";

export type BalanceEntry = {
  amount: Amount;
  token: Token;
};

export async function loadBalances(
  wallet: WalletInterface,
  tokens: Token[]
): Promise<BalanceEntry[]> {
  const amounts = await Promise.all(tokens.map((token) => wallet.balanceOf(token)));

  return tokens.map((token, index) => ({
    amount: amounts[index]!,
    token,
  }));
}
