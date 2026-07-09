import eslintPluginPrettier from "eslint-plugin-prettier";
import typescriptEslintPlugin from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import deprecationPlugin from "eslint-plugin-deprecation";

export default [
  {
    files: ["src/**/*.ts"],
    ignores: ["node_modules/**"],

    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        project: "./tsconfig.json"
      }
    },

    plugins: {
      "@typescript-eslint": typescriptEslintPlugin,
      prettier: eslintPluginPrettier,
      deprecation: deprecationPlugin
    },

    rules: {
      "prettier/prettier": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "deprecation/deprecation": "warn"
    },

    settings: {
      "import/resolver": {
        typescript: {}
      }
    }
  }
];
