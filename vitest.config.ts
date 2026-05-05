import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/__tests__/**"],
      thresholds: {
        lines: 95,
        functions: 100,
        branches: 94,
        statements: 95,
      },
    },
  },
})
