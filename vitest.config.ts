import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@likagame/contracts": fileURLToPath(new URL("./packages/contracts/src/index.ts", import.meta.url)),
      "@likagame/game-core": fileURLToPath(new URL("./packages/game-core/src/index.ts", import.meta.url)),
      "@likagame/content": fileURLToPath(new URL("./packages/content/src/index.ts", import.meta.url))
    }
  },
  test: {
    environment: "node",
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
