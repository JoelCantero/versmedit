import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest config for unit/component tests (constitution Principle XII).
// JSX is transformed by esbuild using tsconfig's "jsx": "react-jsx".
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          fileParallelism: true,
          include: [
            "tests/unit/**/*.{test,spec}.{ts,tsx}",
            "src/**/*.{test,spec}.{ts,tsx}",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          fileParallelism: false,
          include: ["tests/integration/**/*.{test,spec}.{ts,tsx}"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: process.env.CI ? ["text"] : ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/generated/**",
        "src/**/*.d.ts",
        "src/**/*.{test,spec}.{ts,tsx}",
        // Framework composition roots are exercised against the production
        // standalone artifact by Playwright; unit coverage tracks app logic.
        "src/app/\\[locale\\]/**",
        "src/i18n/navigation.ts",
        "src/i18n/request.ts",
        "src/lib/db.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
