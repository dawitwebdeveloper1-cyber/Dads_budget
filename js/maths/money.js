// Money is always kept as whole cents (integers): $12.34 is stored as 1234.
// We never use decimals for money maths, so rounding errors can't creep in.
// Dividing (for example a yearly amount into months) is done as an exact
// fraction and rounded to the nearest cent only at the very end, for display.

/** $10,000,000. Anything bigger is surely a typo. */
export const MAX_CENTS = 1_000_000_000;

export function assertCents(n, what = 'amount') {
  if (!Number.isSafeInteger(n)) throw new Error(`${what} must be whole cents, got ${n}`);
}

const fail = (message) => ({ ok: false, message });

/**
 * Read what was typed into an amount box.
 * Accepts "85", "85.5", "85.50", "$1,200", "1200.00".
 * Refuses blanks, letters, negatives, zero, and more than 2 cents digits.
 */
export function parseAmount(input) {
  const raw = String(input ?? '').trim();
  if (raw === '') return fail('Please type an amount.');
  if (/^\$?\s*-/.test(raw)) {
    return fail('Amounts can\'t be negative. Pick "Money in" or "Money out" instead.');
  }
  let s = raw.replace(/^\$/, '').replace(/\s+/g, '');
  if (s.includes(',')) {
    if (!/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(s)) {
      return fail('Please check the commas. Type it like 1200 or 1,200.50');
    }
    s = s.replace(/,/g, '');
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return fail('Please use numbers only, like 85 or 85.50');
  const [whole, frac = ''] = s.split('.');
  if (frac.length > 2) return fail('Cents can only have 2 numbers, like 85.50');
  const dollarsText = whole.replace(/^0+(?=\d)/, '');
  if (dollarsText.length > 8) return fail('That amount is too big. Please check it.');
  const cents = Number(dollarsText || '0') * 100 + Number(frac.padEnd(2, '0'));
  if (cents === 0) return fail('The amount must be more than $0.');
  if (cents > MAX_CENTS) return fail('That amount is too big. Please check it.');
  return { ok: true, cents };
}

/** 123456 -> "$1,234.56", -500 -> "-$5.00" */
export function formatCents(cents) {
  assertCents(cents);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = abs - dollars * 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${grouped}.${String(rest).padStart(2, '0')}`;
}

/** The plain number to show in an amount box when editing: 8550 -> "85.50" */
export function centsToInput(cents) {
  assertCents(cents);
  const dollars = Math.floor(cents / 100);
  return `${dollars}.${String(cents - dollars * 100).padStart(2, '0')}`;
}

/** Exact whole-number division: returns q and r with num = q*den + r and 0 <= r < den. */
export function divMod(num, den) {
  assertCents(num, 'numerator');
  if (!Number.isSafeInteger(den) || den <= 0) throw new Error(`Bad divisor ${den}`);
  let q = Math.floor(num / den);
  let r = num - q * den;
  while (r < 0) { q -= 1; r += den; }
  while (r >= den) { q += 1; r -= den; }
  return { q, r };
}

/** num / den rounded to the nearest whole cent (halves round away from zero). */
export function roundDiv(num, den) {
  const { q, r } = divMod(Math.abs(num), den);
  const rounded = 2 * r >= den ? q + 1 : q;
  return num < 0 ? -rounded : rounded;
}

/**
 * Round each piece nums[i]/den to whole cents so that the pieces add up to
 * exactly `total`. Each piece only ever moves to the cent just below or just
 * above its true value; the pieces with the biggest leftover fractions are the
 * ones rounded up. This stops "$33.33 + $33.33 + $33.33 = $100.00" problems.
 */
export function allocateToTotal(nums, den, total) {
  assertCents(total, 'total');
  const parts = nums.map((n, i) => {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Piece ${i} is not a whole positive number: ${n}`);
    const { q, r } = divMod(n, den);
    return { i, q, r };
  });
  const floorSum = parts.reduce((s, p) => s + p.q, 0);
  let need = total - floorSum;
  const roundable = parts.filter((p) => p.r > 0);
  if (need < 0 || need > roundable.length) {
    throw new Error(`Can't split ${total} into these pieces`);
  }
  roundable.sort((a, b) => b.r - a.r || a.i - b.i);
  const result = parts.map((p) => p.q);
  for (let k = 0; k < need; k += 1) result[roundable[k].i] += 1;
  return result;
}

export function sum(numbers) {
  let total = 0;
  for (const n of numbers) {
    assertCents(n);
    total += n;
    assertCents(total, 'total');
  }
  return total;
}
