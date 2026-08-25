import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    "node_modules/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "**/.next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
    "**/*.min.js",
    // Agent skill templates are reference material, not application source.
    ".agents/**",
    // Prisma-generated client
    "src/generated/**",
    // Vitest coverage report output
    "coverage/**",
  ]),
]);

export default eslintConfig;
