import type { RecordStockResult, StockItem, StockItemResult } from '@kvnsys/client';
import { Button, FormPanel, Notice, Pieces, TextField } from '@kvnsys/ui';
import { useRef, useState, type KeyboardEvent } from 'react';

const somethingWentWrong = (error: unknown) => ({
  ok: false as const,
  reason: 'unreachable' as const,
  message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
});

interface Line {
  key: number;
  item: StockItem;
  /** As typed: the client engine reads it when the delivery is saved. */
  pieces: string;
}

/**
 * Taking in a delivery, in a panel from the right: scan or type each product's code or barcode, then
 * how many pieces came, and add it; when everything's in, save it all at once. A scanner's Enter in
 * the code box finds the product and moves on to its pieces; Enter in the pieces box adds the line.
 * Neither saves: only Save delivery, or Enter in the note, does.
 */
export function ReceivePanel({
  onClose,
  onSaved,
  onSignInAgain,
}: {
  onClose: () => void;
  /** How many lines were saved. */
  onSaved: (lines: number) => void;
  onSignInAgain: () => void;
}) {
  const [code, setCode] = useState('');
  const [found, setFound] = useState<StockItem | null>(null);
  const [pieces, setPieces] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const codeBox = useRef<HTMLInputElement>(null);
  const piecesBox = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  /** Finds what's in the code box, at the server. */
  async function look(): Promise<StockItem | null> {
    setBusy(true);
    const answer = await window.kvnsys.findStockItem(code).catch((error: unknown): StockItemResult => somethingWentWrong(error));
    setBusy(false);
    if (!answer.ok) {
      setFound(null);
      setProblem({ message: answer.message, ended: answer.reason === 'ended' });
      codeBox.current?.focus();
      return null;
    }
    setProblem(null);
    setFound(answer.item);
    return answer.item;
  }

  async function add() {
    if (busy) return;
    const item = found ?? (await look());
    if (!item) return;
    if (!pieces.trim()) {
      setProblem({ message: `Type how many pieces of ${item.product.name} came.`, ended: false });
      piecesBox.current?.focus();
      return;
    }
    setLines((current) => [...current, { key: nextKey.current++, item, pieces }]);
    setProblem(null);
    setCode('');
    setPieces('');
    setFound(null);
    codeBox.current?.focus();
  }

  async function save() {
    if (busy || lines.length === 0) return;
    setBusy(true);
    setProblem(null);
    const sent = lines.map((line) => ({ productId: line.item.product.id, name: line.item.product.name, pieces: line.pieces }));
    const answer = await window.kvnsys.receiveStock(sent, note).catch((error: unknown): RecordStockResult => somethingWentWrong(error));
    setBusy(false);
    if (answer.ok) onSaved(answer.movements.length);
    else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
  }

  function codeEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (busy) return;
    void look().then((item) => item && piecesBox.current?.focus());
  }

  function piecesEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void add();
  }

  return (
    <FormPanel
      title="Receive stock"
      onClose={onClose}
      onSubmit={() => void save()}
      actions={
        <>
          <Button type="button" variant="secondary" size="compact" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="compact" disabled={busy || lines.length === 0}>
            {busy && lines.length > 0 ? 'Saving…' : 'Save delivery'}
          </Button>
        </>
      }
    >
      {problem && <Notice tone="problem">{problem.message}</Notice>}
      {problem?.ended && (
        <Button type="button" size="compact" className="mt-3" onClick={onSignInAgain}>
          Sign in again
        </Button>
      )}
      <div className="mt-4 first:mt-0">
        <TextField
          ref={codeBox}
          size="compact"
          label="Code or barcode"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setFound(null);
          }}
          onKeyDown={codeEnter}
          autoFocus
        />
        {found && (
          <p role="status" className="-mt-1 mb-3 text-[15px] text-muted-foreground">
            {found.product.name}: KVNsys has <Pieces count={found.stock} /> here.
          </p>
        )}
        <TextField ref={piecesBox} size="compact" label="Pieces" inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} onKeyDown={piecesEnter} />
        <Button type="button" variant="secondary" size="compact" disabled={busy} onClick={() => void add()}>
          Add to delivery
        </Button>

        <h3 className="mt-6 mb-2 text-[15px] font-semibold">This delivery</h3>
        {lines.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">Nothing added yet.</p>
        ) : (
          <ul aria-label="This delivery" className="divide-y divide-border rounded-md border border-border bg-field">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center gap-3 px-3 py-2 text-[15px]">
                <span className="min-w-0 flex-1 truncate">{line.item.product.name}</span>
                <span className="tabular-nums">{line.pieces}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  className="h-8 px-3"
                  aria-label={`Remove ${line.item.product.name}`}
                  onClick={() => setLines((current) => current.filter((other) => other.key !== line.key))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6">
          <TextField size="compact" label="Note (optional)" placeholder="Such as the supplier's DR number" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </FormPanel>
  );
}
