import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Type-aware linting: strict-type-checked catches real bugs the base Next
  // config can't see (floating promises, unsafe `any`, dead conditions, etc.).
  ...tseslint.configs.strictTypeChecked,

  // React Compiler lint rule (react-hooks v7). Flags code the compiler can't
  // safely optimize.
  reactHooks.configs.flat["recommended-latest"],

  {
    languageOptions: {
      parserOptions: {
        // Enables type-aware rules without listing every tsconfig by hand.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Disable the noisy *stylistic* type-checked rules while keeping the
      // correctness ones. These fire hundreds of times without catching bugs.
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // eslint-config-prettier must stay last so it can turn off any formatting
  // rules that would conflict with Prettier.
  eslintConfigPrettier,

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
