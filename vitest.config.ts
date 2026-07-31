import { defineConfig } from "vitest/config";

/**
 * Pure-function test runner. Components / DOM tests are out of scope —
 * we focus on the deterministic modules in scope/, data/, bedrock/, and
 * pages/Telemetry/.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["ui/app/**/*.test.ts"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: ["ui/app/scope/**", "ui/app/data/**", "ui/app/bedrock/**"],
      reporter: ["text", "json-summary"],
    },
  },
});
