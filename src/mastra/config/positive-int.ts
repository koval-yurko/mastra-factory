/**
 * The positive-integer parser every capacity knob in this deployment is read
 * through.
 *
 * It is its own module for the reason `database-url.ts` is: a value two
 * concerns share belongs to neither of them. `./sandbox` needs it for the
 * memory, CPU and concurrent-session knobs, and `./factory` needs it for
 * `dispatcher.maxInFlight` — and `./factory` imports `./sandbox`, so taking the
 * parser from there would file a shared value under one of its two consumers.
 *
 * See `README.md` in this directory for what the entry was forked from and how
 * these modules are reconciled with an upstream template update.
 */

/**
 * Parse a positive-integer env knob; anything else means "use the default".
 * Fractional values are rejected rather than floored — flooring `0.5` to `0`
 * would silently disable a capacity knob or turn an idle window into
 * immediate expiry.
 *
 * Imported by `./sandbox` and by `./factory`; pinned by `positive-int.test.ts`.
 */
export function positiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}
