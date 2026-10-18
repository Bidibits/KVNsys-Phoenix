/**
 * Money in KVNsys is a whole number of centavos, never pesos with a fraction: in floating point
 * 0.1 + 0.2 isn't 0.3, and a till can't be a centavo out. The database keeps pesos as an exact
 * numeric, and KVNsysPostgres converts at the boundary, through text, never through a float.
 */

/** The most the database's money columns hold: numeric(14,2), 999,999,999,999.99 pesos. */
export const MaxCentavos = 99_999_999_999_999;

/** A whole, non-negative number of centavos that the database can hold. */
export function isCentavos(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MaxCentavos;
}

/**
 * Reads a peso amount as a person or a spreadsheet writes it ("1,234.50", "12.5", "12") into
 * centavos. Null when it isn't one: a negative amount, more than two decimals, commas in the
 * wrong places, or more than the database holds.
 */
export function parsePesos(text: string): number | null {
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const pesos = match[1]!.replace(/,/g, '').replace(/^0+(?=\d)/, '');
  if (pesos.length > 12) return null;
  const centavos = Number(pesos) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return isCentavos(centavos) ? centavos : null;
}

/** Centavos as plain pesos, the way the database and an edit box take them: 123450 is "1234.50". */
export function pesosText(centavos: number): string {
  if (!isCentavos(centavos)) throw new RangeError(`${centavos} isn't a whole, non-negative number of centavos.`);
  return `${Math.trunc(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}
