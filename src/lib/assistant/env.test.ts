import { afterEach, beforeEach, expect, test } from "vitest";

import { getAnthropicApiKey } from "@/lib/assistant/env";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
});

test("throws naming the missing variable when it is unset", () => {
  expect(() => getAnthropicApiKey()).toThrow(/ANTHROPIC_API_KEY/);
});

test("throws when the variable is set but empty", () => {
  process.env.ANTHROPIC_API_KEY = "";
  expect(() => getAnthropicApiKey()).toThrow(/ANTHROPIC_API_KEY/);
});

test("returns the key when it is set", () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  expect(getAnthropicApiKey()).toBe("sk-ant-test-key");
});
