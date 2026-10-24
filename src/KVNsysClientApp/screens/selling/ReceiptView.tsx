import type { SaleResult } from '@kvnsys/client';
import { Button, Pesos } from '@kvnsys/ui';
import { ReceiptPaper } from './ReceiptPaper';

/**
 * The receipt of a sale just paid, on screen until there's a printer (decided 2026-10-20), with
 * the change to give in big type. New sale, or Enter, starts the next one.
 */
export function ReceiptView({ sale, onNewSale }: { sale: Extract<SaleResult, { ok: true }>; onNewSale: () => void }) {
  return (
    <div className="flex h-full gap-6 overflow-auto">
      <ReceiptPaper sale={sale} />
      <div className="flex flex-1 flex-col justify-center gap-4">
        <p className="text-lg">Change to give</p>
        <p className="text-5xl font-bold" aria-label="Change to give">
          <Pesos centavos={sale.receipt.payment.change} />
        </p>
        <Button type="button" className="mt-4 max-w-xs" onClick={onNewSale} autoFocus>
          New sale
        </Button>
      </div>
    </div>
  );
}
