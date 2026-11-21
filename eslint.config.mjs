import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // docunest hard rules §3: a domain imports only itself, the shared core
  // (for now MapPal's lib/db + AI usage caps) and npm packages. Outside code
  // reaches a domain only through its index.ts. test/boundaries.test.ts
  // checks the same thing.
  {
    files: ["domains/grocery/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^@/(?!lib/db$|lib/sources/usage$|lib/sources/usageDb$|lib/ai/deepseek$|lib/mcp/server$)", message: "domains/grocery may import only itself and the shared core: @/lib/db, @/lib/sources/usage(Db), @/lib/ai/deepseek, @/lib/mcp/server." }] }],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^@/domains/[^/]+/(?!ui/[^/]+\\.css$)", message: "Import a domain only through its index.ts (@/domains/<app>)." }] }],
    },
  },
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
