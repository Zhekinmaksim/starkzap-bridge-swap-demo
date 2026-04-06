import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePolyfillShims(): Plugin {
  return {
    name: "resolve-polyfill-shims",
    resolveId(source) {
      if (source.startsWith("vite-plugin-node-polyfills/shims/")) {
        return require.resolve(source).replace(/\.cjs$/, ".js");
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), nodePolyfills(), resolvePolyfillShims()],
  envPrefix: "VITE_",
  resolve: {
    alias: {
      "@fatsolutions/tongo-sdk": path.resolve(
        __dirname,
        "src/shims/tongo-sdk.ts"
      ),
    },
  },
});
