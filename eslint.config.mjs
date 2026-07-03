import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next v16 ships flat configs natively; the previous FlatCompat
// wrapper breaks against them. Mirrors cert-candidate-portal's working setup.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "exam-template/**",
    "scripts/**",
  ]),
]);

export default eslintConfig;
