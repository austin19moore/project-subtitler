import tsParser from "@typescript-eslint/parser";
import tseslint from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
	{
		ignores: ["**/dist/**", "**/node_modules/**", "**/*.tsbuildinfo"],
	},
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 2022,
			sourceType: "module",
			globals: { ...globals.node },
		},
		plugins: {
			"@typescript-eslint": tseslint,
			"react-hooks": reactHooks,
		},
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_" },
			],
			"@typescript-eslint/no-explicit-any": "error",
			"no-console": "off",
			"no-trailing-spaces": "error",
			"eol-last": ["error", "always"],
			"no-mixed-spaces-and-tabs": "error",
		},
	},
	{
		files: ["frontend/**/*.tsx"],
		languageOptions: {
			globals: { ...globals.browser },
		},
		rules: {
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/exhaustive-deps": "warn",
		},
	},
];
