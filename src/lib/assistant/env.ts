/**
 * Reads the Anthropic API key from the environment.
 *
 * Server-only. Never imported by client components — the key must never
 * reach a browser bundle.
 */

const API_KEY_VAR = "ANTHROPIC_API_KEY";

/** Throws, naming the missing variable, rather than letting the SDK fail generically. */
export function getAnthropicApiKey(): string {
  const key = process.env[API_KEY_VAR];
  if (!key) {
    throw new Error(
      `Missing required environment variable: ${API_KEY_VAR}. ` +
        `Copy .env.example to .env.local and set it.`,
    );
  }
  return key;
}
