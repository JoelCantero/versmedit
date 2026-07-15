import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest config for unit/component tests (constitution Principle XII).
// JSX is transformed by esbuild using tsconfig's "jsx": "react-jsx".
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/{unit,integration}/**/*.{test,spec}.{ts,tsx}",
      "src/**/*.{test,spec}.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/generated/**",
        "src/**/*.d.ts",
        "src/**/*.{test,spec}.{ts,tsx}",
        // Framework composition roots are exercised against the production
        // standalone artifact by Playwright; unit coverage tracks app logic.
        "src/app/[locale]/**",
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
