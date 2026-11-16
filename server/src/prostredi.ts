/**
 * The only server module that reads process.env.
 * Getters stay lazy so tests can set variables before the call.
 */

/** Live view of the process environment. */
export function prostredi(): NodeJS.ProcessEnv {
  return process.env;
}

/** Raw value. Callers trim when they need to. Missing stays undefined. */
export function ctiEnv(klic: string): string | undefined {
  return process.env[klic];
}

/** True only when NODE_ENV is exactly "production". */
export function jeProdukce(): boolean {
  return process.env["NODE_ENV"] === "production";
}
