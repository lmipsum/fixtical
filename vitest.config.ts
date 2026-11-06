import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "text"],
      // Below the floor fails: raise it as coverage grows, never lower it.
      thresholds: { statements: 98, branches: 91, functions: 100, lines: 99 },
    },
  },
});
