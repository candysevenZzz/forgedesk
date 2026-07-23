import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["apps/desktop/dist/**", "apps/desktop/tsconfig.tsbuildinfo"],
  },
  {
    files: ["apps/desktop/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      curly: ["error", "all"],
    },
  },
];
