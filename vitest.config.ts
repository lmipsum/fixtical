import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "text"],
      // Below the floor fails: raise it as coverage grows, never lower it.
      thresholds: { statements: 95, branches: 88, functions: 95, lines: 95 },
    },
  },
});
