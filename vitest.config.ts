import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./worker/db/migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            SESSION_SECRET: "test-session-secret",
            ADMIN_PASSWORD_SALT: "00112233445566778899aabbccddeeff",
            ADMIN_PASSWORD_HASH: "54d9680604f8895cf4e0ed2a8d68c307035a8bb702fbaa06e48f502da9f36923",
            DEV_FILE_PROXY: "1",
            R2_ACCESS_KEY_ID: "",
            R2_SECRET_ACCESS_KEY: "",
            R2_ACCOUNT_ID: "",
            TURN_KEY_ID: "",
            TURN_KEY_API_TOKEN: "",
          },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/setup.ts"],
      testTimeout: 20_000,
    },
  };
});
