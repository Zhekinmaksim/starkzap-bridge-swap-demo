/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVATE_KEY?: string;
  readonly VITE_STARKNET_NETWORK?: string;
  readonly VITE_ETHEREUM_RPC_URL?: string;
  readonly VITE_PAYMASTER_URL?: string;
  readonly VITE_RECIPIENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
