import {
  Amount,
  ConnectedEthereumWallet,
  ExternalChain,
  type Address,
  type BridgeDepositFeeEstimation,
  type BridgeToken,
  type ChainId,
  type Eip1193Provider,
  type StarkZap,
  type Token,
  type WalletInterface,
} from "starkzap";

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export type EthereumConnection = {
  account: string;
  chainId: number;
  wallet: ConnectedEthereumWallet;
};

export type BridgeSnapshot = {
  externalBalance: Amount;
  starknetBalance: Amount;
  allowance: Amount | null;
  feeEstimate: BridgeDepositFeeEstimation;
};

const ETHEREUM_MAINNET = 1;
const ETHEREUM_SEPOLIA = 11155111;

function expectedEthereumChainId(starknetChainId: ChainId): number {
  return starknetChainId.isMainnet() ? ETHEREUM_MAINNET : ETHEREUM_SEPOLIA;
}

function toStarknetToken(token: BridgeToken): Token {
  return {
    address: token.starknetAddress,
    decimals: token.decimals,
    name: token.name,
    symbol: token.symbol,
  };
}

export async function connectInjectedEthereumWallet(
  starknetChainId: ChainId
): Promise<EthereumConnection> {
  const provider = window.ethereum;

  if (!provider) {
    throw new Error(
      "No injected EVM wallet found. Open the demo in a browser with MetaMask or another EIP-1193 wallet."
    );
  }

  const accounts = await provider.request<string[]>({
    method: "eth_requestAccounts",
  });
  const account = accounts[0];

  if (!account) {
    throw new Error("The injected EVM wallet did not return an account.");
  }

  const chainHex = await provider.request<string>({ method: "eth_chainId" });
  const chainId = Number(BigInt(chainHex));
  const expectedChainId = expectedEthereumChainId(starknetChainId);

  if (chainId !== expectedChainId) {
    throw new Error(
      `Wrong EVM network. Expected chainId ${expectedChainId}, got ${chainId}.`
    );
  }

  const wallet = await ConnectedEthereumWallet.from(
    {
      address: account,
      chain: ExternalChain.ETHEREUM,
      chainId,
      provider,
    },
    starknetChainId
  );

  return { account, chainId, wallet };
}

export async function getEthereumBridgeToken(
  sdk: StarkZap,
  symbol: string
): Promise<BridgeToken> {
  const tokens = await sdk.getBridgingTokens(ExternalChain.ETHEREUM);
  const token = tokens.find((item) => item.symbol === symbol);

  if (!token) {
    throw new Error(
      `Could not find bridge token "${symbol}" on the configured Starknet network.`
    );
  }

  return token;
}

export async function readBridgeSnapshot(params: {
  wallet: WalletInterface;
  externalWallet: ConnectedEthereumWallet;
  token: BridgeToken;
}): Promise<BridgeSnapshot> {
  const starknetToken = toStarknetToken(params.token);

  const [externalBalance, starknetBalance, allowance, feeEstimate] =
    await Promise.all([
      params.wallet.getDepositBalance(params.token, params.externalWallet),
      params.wallet.balanceOf(starknetToken),
      params.wallet.getAllowance(params.token, params.externalWallet),
      params.wallet.getDepositFeeEstimate(params.token, params.externalWallet),
    ]);

  return {
    allowance,
    externalBalance,
    feeEstimate,
    starknetBalance,
  };
}

export async function executeBridgeDeposit(params: {
  wallet: WalletInterface;
  externalWallet: ConnectedEthereumWallet;
  token: BridgeToken;
  amount: string;
  recipient: Address;
}): Promise<{ amount: Amount; hash: string }> {
  const amount = Amount.parse(
    params.amount,
    params.token.decimals,
    params.token.symbol
  );

  const response = await params.wallet.deposit(
    params.recipient,
    amount,
    params.token,
    params.externalWallet
  );

  return {
    amount,
    hash: response.hash,
  };
}
