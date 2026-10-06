import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `server-only` throws when imported outside a React Server environment. Tests run in
// plain Node, so it resolves to an empty module here; Next.js still enforces it in the app.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./vitest.server-only-stub.ts", import.meta.url)),
      // Mirrors tsconfig's "@/*" path so tests can import pages that use it.
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
