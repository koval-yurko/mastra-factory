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
 * The value has to be a run of ASCII digits and nothing else, which is what the
 * operator READMEs promise ("a whole number", "a run of digits"). The check is
 * ahead of the coercion because `Number` accepts spellings no operator meant to
 * write and turns each into a DIFFERENT valid number: `'0x10'` is 16, `'0b11'`
 * is 3, `'1e3'` is 1000, `'+5'` is 5, `' 3 '` is 3. Every one of those is a
 * typo'd knob that silently takes effect instead of falling back to the
 * default — the failure mode this parser exists to prevent. `Number.parseInt`
 * is no help either: `parseInt('4 workers')` is 4, the same silent success.
 * The safe-integer and `> 0` checks stay below it, because a long run of digits
 * passes the regex and is still not a safe integer.
 *
 * Imported by `./sandbox` and by `./factory`; pinned by `positive-int.test.ts`.
 */
export function positiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  if (!/^[0-9]+$/.test(raw)) return undefined;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}
