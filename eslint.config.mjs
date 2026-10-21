import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"] },
  // The Node test harness deliberately uses CommonJS require() to load and mock transpiled TypeScript.
  { files: ["tests/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
]);
