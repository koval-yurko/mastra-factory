/**
 * The env-knob parser Story 5.5 lifted out of the entry along with its only two
 * consumers.
 *
 * These assertions moved here unchanged from `../index.test.ts`. What they pin
 * is not visible to `tsc`: every arm of the parser returns `number | undefined`,
 * so flooring a fraction, accepting `0` or letting `Infinity` through all
 * typecheck, and each of them silently changes a capacity ceiling rather than
 * failing anywhere.
 *
 * Unlike every other module in this directory this one reads no environment at
 * all — it takes the raw string as an argument — so there is nothing to sweep
 * or stub, and it is imported statically.
 */
import { describe, expect, it } from 'vitest';
import { positiveInt } from './positive-int';

describe('positiveInt', () => {
  it('returns undefined for an unset or empty value', () => {
    expect(positiveInt(undefined)).toBeUndefined();
    expect(positiveInt('')).toBeUndefined();
  });

  it('returns undefined for non-positive values', () => {
    expect(positiveInt('0')).toBeUndefined();
    expect(positiveInt('-1')).toBeUndefined();
  });

  it('returns undefined for unparseable values', () => {
    expect(positiveInt('abc')).toBeUndefined();
    expect(positiveInt('4 workers')).toBeUndefined();
    expect(positiveInt('NaN')).toBeUndefined();
  });

  it('rejects fractional values rather than flooring them', () => {
    // Flooring `0.5` to `0` would silently disable a capacity knob.
    expect(positiveInt('0.5')).toBeUndefined();
    expect(positiveInt('2.5')).toBeUndefined();
  });

  it('returns undefined for values beyond the safe-integer range', () => {
    expect(positiveInt('9007199254740993')).toBeUndefined();
    expect(positiveInt('Infinity')).toBeUndefined();
  });

  it('returns the parsed number for a positive integer', () => {
    expect(positiveInt('3')).toBe(3);
    expect(positiveInt('1')).toBe(1);
  });

  it('accepts the alternative spellings `Number` understands, so a typo can become a valid knob', () => {
    // Pins today's behaviour rather than endorsing it. These are the dangerous
    // malformed inputs: each yields a different valid number instead of
    // `undefined`, so a typo'd knob silently takes effect rather than falling
    // back to the default. Changing this is out of the story's scope; the test
    // makes any such change a visible edit here.
    expect(positiveInt('0x10')).toBe(16);
    expect(positiveInt('0b11')).toBe(3);
    expect(positiveInt('1e3')).toBe(1000);
    expect(positiveInt('+5')).toBe(5);
    expect(positiveInt(' 3 ')).toBe(3);
  });
});
