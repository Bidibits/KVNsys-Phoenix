import type { SaleResult } from '@kvnsys/client';
import { Pesos, ShopTime } from '@kvnsys/ui';
import { DiscountChoices } from './discounts';

/**
 * A receipt as it was given, on screen until there's a printer: the shop, the receipt's number,
 * when and who, every line, the discount and whose ID it was, the total, the cash and the change.
 */
export function ReceiptPaper({ sale }: { sale: Extract<SaleResult, { ok: true }> }) {
  const { receipt, shop, cashier } = sale;
  return (
    <article aria-label="Receipt" className="w-[420px] shrink-0 self-start rounded-lg border border-border bg-field p-6 text-[15px] shadow-sm">
      <header className="mb-4 text-center">
        <p className="text-lg font-semibold">{shop.name}</p>
        <p>Receipt {receipt.code}</p>
        <p className="text-muted-foreground">
          <ShopTime at={receipt.createdAt} />
        </p>
        {/* No name when the cashier's account isn't on this server. */}
        {cashier && <p className="text-muted-foreground">Cashier: {cashier}</p>}
      </header>
      <ul className="border-y border-dashed border-border py-3">
        {receipt.lines.map((line, index) => (
          <li key={index} className="flex justify-between gap-3 py-0.5">
            <span>
              {line.quantity} × {line.name}
              <span className="block text-[13px] text-muted-foreground">
                @ <Pesos centavos={line.unitPrice} />
              </span>
            </span>
            <Pesos centavos={line.subtotal} />
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1">
        <dt>Subtotal</dt>
        <dd className="text-right">
          <Pesos centavos={receipt.subtotal} />
        </dd>
        {receipt.discount && (
          <>
            <dt>
              {DiscountChoices[receipt.discount.kind]} 20%
              <span className="block text-[13px] text-muted-foreground">
                {receipt.discount.customerName} · ID {receipt.discount.idNumber}
              </span>
            </dt>
            <dd className="text-right">
              −<Pesos centavos={receipt.discountTotal} />
            </dd>
          </>
        )}
        <dt className="pt-2 text-lg font-semibold">Total</dt>
        <dd className="pt-2 text-right text-lg font-semibold">
          <Pesos centavos={receipt.total} />
        </dd>
        <dt>Cash</dt>
        <dd className="text-right">
          <Pesos centavos={receipt.payment.tendered} />
        </dd>
        <dt>Change</dt>
        <dd className="text-right">
          <Pesos centavos={receipt.payment.change} />
        </dd>
      </dl>
    </article>
  );
}
