function missingTongoSdk(): never {
  throw new Error(
    "The @fatsolutions/tongo-sdk peer dependency is not installed in this demo. Install it only if you want Starkzap confidential transfers."
  );
}

export class Account {
  publicKey = "";

  constructor() {
    missingTongoSdk();
  }

  tongoAddress(): string {
    return missingTongoSdk();
  }

  state(): Promise<never> {
    return Promise.reject(missingTongoSdk());
  }

  nonce(): Promise<never> {
    return Promise.reject(missingTongoSdk());
  }

  erc20ToTongo(): Promise<never> {
    return Promise.reject(missingTongoSdk());
  }

  tongoToErc20(): Promise<never> {
    return Promise.reject(missingTongoSdk());
  }

  fund(): Promise<never> {
    return Promise.reject(missingTongoSdk());
  }

  transfer(): Promise<never> {
    return Promise.reject(missingTongoSdk());
  }

  withdraw(): Promise<never> {
    return Promise.reject(missingTongoSdk());
  }

  ragequit(): Promise<never> {
    return Promise.reject(missingTongoSdk());
  }

  rollover(): Promise<never> {
    return Promise.reject(missingTongoSdk());
  }
}
