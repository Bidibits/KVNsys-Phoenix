import { cn } from 'cn';

/**
 * A number of pieces, with digits that line up in a column: "1,200". Stock below zero shows in red,
 * so someone notices. `signed` writes a change as one, "+24" or "−2".
 */
export function Pieces({ count, signed = false }: { count: number; signed?: boolean }) {
  const digits = Math.abs(count).toLocaleString('en-US');
  const text = count < 0 ? `−${digits}` : signed && count > 0 ? `+${digits}` : digits;
  return <span className={cn('tabular-nums', !signed && count < 0 && 'font-semibold text-danger-ink')}>{text}</span>;
}
