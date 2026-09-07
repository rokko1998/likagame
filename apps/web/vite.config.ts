import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@likagame/contracts": fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
      "@likagame/game-core": fileURLToPath(new URL("../../packages/game-core/src/index.ts", import.meta.url)),
      "@likagame/content": fileURLToPath(new URL("../../packages/content/src/index.ts", import.meta.url))
    }
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/phaser/")) return "phaser";
          if (id.includes("/react/") || id.includes("/react-dom/")) return "react";
          return undefined;
        }
      }
    }
  }
});
