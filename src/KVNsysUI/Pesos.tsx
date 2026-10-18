import { displayPesos } from '@kvnsys/core';

/** An amount of money, the way KVNsysCore writes it ("₱1,450.50"), with digits that line up in a column. */
export function Pesos({ centavos }: { centavos: number }) {
  return <span className="tabular-nums">{displayPesos(centavos)}</span>;
}
