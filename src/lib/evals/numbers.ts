/**
 * Number extraction for the grounding, figures and abstention graders.
 *
 * Pulls every figure out of an answer's prose, and every number out of the
 * sources an answer may legitimately quote: tool results and the user's own
 * messages. See design.md (add-eval-harness), decision 8.
 */

/** One number found in text, with every value it can reasonably be read as. */
export interface NumberToken {
  /** The text as written, sign included — e.g. "−1,40". */
  text: string;
  /**
   * `1.650` reads as 1.65 or 1650 depending on whether the writer used `.` as
   * a decimal point or a thousands separator. Both are kept; a grader accepts
   * the token when any reading matches.
   */
  readings: number[];
}

/**
 * Spans that contain digits but are not figures: entity identifiers
 * (`NAP-12`, `FR-03`, `OLT-RES-01`, `SUB-014`), splitter ratios (`1:16`), and
 * ordered-list markers at the start of a line (`1.`, `2)`).
 */
const NOT_FIGURES = [
  /\b\p{L}+(?:-\p{L}+)*-\d+\b/gu,
  /\b\d+:\d+\b/g,
  /^[ \t]*(?:[-*+][ \t]+)?\d+[.)](?=[ \t])/gm,
];

/**
 * An optional sign attached to the digits, then digit groups joined by `.`
 * or `,`. The lookbehind keeps `x2`-style tokens and the right-hand side of
 * a hyphenated range (`3-5`) from being read as signed numbers.
 */
const NUMBER = /(?<![\p{L}\p{N}_])([-−+])?(\d+(?:[.,]\d+)*)/gu;

/** Every reading of an unsigned digit string such as `29,40`, `1.650` or `1.234,5`. */
function readUnsigned(digits: string): number[] {
  const separators = digits.match(/[.,]/g) ?? [];
  if (separators.length === 0) return [Number(digits)];

  const groups = digits.split(/[.,]/);
  const lastSeparatorAt = Math.max(digits.lastIndexOf("."), digits.lastIndexOf(","));
  const asLastDecimal = Number(
    digits.slice(0, lastSeparatorAt).replace(/[.,]/g, "") + "." + digits.slice(lastSeparatorAt + 1),
  );
  const thousandsShaped = groups.slice(1).every((group) => group.length === 3);
  const asThousands = Number(groups.join(""));

  if (separators.length === 1) {
    return thousandsShaped ? [asLastDecimal, asThousands] : [asLastDecimal];
  }
  const allSame = separators.every((sep) => sep === separators[0]);
  // `1.234.567`: only a thousands reading. `1.234,56`: the last separator is the decimal.
  if (allSame) return thousandsShaped ? [asThousands] : [];
  return [asLastDecimal];
}

/** Every figure in `text`, in order of appearance. */
export function extractNumbers(text: string): NumberToken[] {
  let masked = text;
  for (const pattern of NOT_FIGURES) {
    masked = masked.replace(pattern, (span) => " ".repeat(span.length));
  }

  const tokens: NumberToken[] = [];
  for (const match of masked.matchAll(NUMBER)) {
    const [, sign, digits] = match;
    const readings = readUnsigned(digits);
    if (readings.length === 0) continue;
    const negative = sign === "-" || sign === "−";
    tokens.push({
      text: (sign ?? "") + digits,
      readings: readings.map((value) => (negative ? -value : value)),
    });
  }
  return tokens;
}

/**
 * Every number in a tool result: JSON numbers at any depth, plus every
 * figure in any string — which covers the text of `search_result` blocks and
 * values such as a ratio's neighbours in prose.
 */
export function numbersInValue(value: unknown, into: number[] = []): number[] {
  if (typeof value === "number") {
    if (Number.isFinite(value)) into.push(value);
  } else if (typeof value === "string") {
    for (const token of extractNumbers(value)) into.push(...token.readings);
  } else if (Array.isArray(value)) {
    for (const item of value) numbersInValue(item, into);
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) numbersInValue(item, into);
  }
  return into;
}

/** A set of numbers compared by value, immune to `0.1 + 0.2`-style float noise. */
export class NumberSet {
  private readonly keys = new Set<string>();
  private readonly absKeys = new Set<string>();

  constructor(values: Iterable<number> = []) {
    for (const value of values) this.add(value);
  }

  private static key(value: number): string {
    return (Math.round(value * 1e6) / 1e6).toString();
  }

  add(value: number): void {
    this.keys.add(NumberSet.key(value));
    this.absKeys.add(NumberSet.key(Math.abs(value)));
  }

  has(value: number): boolean {
    return this.keys.has(NumberSet.key(value));
  }

  /** True when some member has the same absolute value. */
  hasAbs(value: number): boolean {
    return this.absKeys.has(NumberSet.key(Math.abs(value)));
  }
}
