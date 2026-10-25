# The database, as Phoenix has it

The design is [`Release/SCHEMA-PLAN.md`](../../Release/SCHEMA-PLAN.md). Since 2026-10-25 every table it
names is in Phoenix's database, in its column order: `src/KVNsysPostgres/prisma/schema.prisma`, built
by the one baseline migration, which is still edited in place because no shop has real data yet.

This page says which tables Phoenix uses so far, and every place Phoenix differs from the plan, with
the reason. Release is kept as a reference and isn't edited from here, so the plan's changes are
written down on this page instead.

## Every table, and what uses it

| # | Table | Plan section | Used so far |
|---|---|---|---|
| 1–5 | `countries`, `regions`, `provinces`, `municipalities`, `barangays` | 1–5 Where things are | Empty. A shop can point at them; nothing fills them yet |
| 6 | `locations` | 6–11 | ✅ The shop, set up at install |
| 7–8 | `roles`, `accesses` | 6–11 | ✅ Roles screen |
| 9 | `users` | 6–11 | ✅ Users screen, sign-in |
| 10 | `machines` | 6–11 | ✅ Registers screen; every register records itself at sign-in |
| 11 | `audits` | 6–11 | Nothing writes here yet |
| 12–15 | `brands`, `manufacturers`, `suppliers`, `categories` | 12–17 The catalogue | One list screen and form panel for all four, and the product form picks from them (2026-10-25) |
| 16 | `affiliations` | 12–17 | No screens yet |
| 17 | `products` | 12–17 | ✅ Every field, on the product form, and the list shows the picture, category and brand (2026-10-25). The till applies only the retail price so far |
| 18–19 | `stock_documents`, `stock_document_items` | 18–21 Stock | No screens yet |
| 20 | `inventory` | 18–21 | ✅ Stock on hand. Min stock, max stock and reorder point are kept; no alerts yet |
| 21 | `inventory_logs` | 18–21 | ✅ The stock ledger, recording three of its seven kinds so far |
| 22 | `shifts` | 22–25 Selling | ✅ Start and end shift |
| 23–25 | `receipts`, `receipt_items`, `receipt_payments` | 22–25 | ✅ Selling, the day's sales. Voiding isn't built |
| 26–28 | `transfer_imports`, `sales_imports`, `consolidated_sales` | 26–28 HQ and branch | Not yet: HQ ↔ branch comes after launch |
| 29 | `user_settings` | 29–30 | Not yet |
| 30 | `schema_migrations` | 29–30 | Prisma's own `_prisma_migrations` does this job |

## Where Phoenix differs from the plan, and why

| Plan | Phoenix | Why |
|---|---|---|
| Quantities aren't given a type (Release's old database used decimals) | **Whole pieces everywhere**: stock, the ledger, receipt lines, delivery lines, HQ's totals | Nothing the shop sells goes by weight or length (decided 2026-10-20). Selling by the kilo would be a schema change |
| `receipts`: id, code, shift, money, status, void reason, three events | **Also** `location_id`, `number`, and `discount_kind`, `discount_id_number`, `discount_customer_name` | Receipts are numbered per shop with no gaps (the plan's gap 1). The senior/PWD discount needs the ID number and the name on the receipt, by law |
| `receipts` opened(4) · settled(4) · voided(4) | **settled is when it was paid; opened stays empty for now** | The register keeps the cart. The server hears of a sale only when it's paid, so paying is the moment a receipt is made. Opened gets filled if the register later says when the sale began |
| `receipt_items`: product, quantity, prices, price basis | **Also** `line_number`, `product_code`, `product_name` | Kept as sold, so renaming or repricing a product never changes a receipt already given |
| `shifts` | **Also** `number` | Numbered per shop with no gaps, like receipts |
| `inventory_logs.movement_type`: seven kinds | The database takes all seven; KVNsysCore records three so far | `to_supplier`, `transfer`, `from_customer` and `disposal` come with the features that make them |
| `audits` | **Kept as written**: the database refuses to change or remove a row. `column_name` may be empty | An audit log anyone can edit isn't one. A change to a record as a whole, such as creating it, names no single column |
| `transfer_imports.from_location`, `sales_imports.location_id`, `consolidated_sales.location_id` | **Not foreign keys** | They name another site's shop, which this database may not hold. The same reasoning as the lineage columns |
| `receipt_payments.payment_type` | Cash only, for now (a check in the migration) | Other ways to pay come later; the plan's gap 3 (a table of payment types) isn't decided |

## What the plan says that needs code, not built yet

- **A delivery that has received anything can't be cancelled; it's closed.** It belongs with the
  delivery screens.
- **The till charges the cheapest price the customer qualifies for.** Promo and wholesale prices are
  kept, but selling uses the retail price only (`price_basis` is Retail).
- **`tracks_stock` false means a sale takes nothing out of stock.** Kept, not yet applied: until the
  product form shows it, every product tracks stock.
- **The place tables get PSA's published list,** checked against PSA first (the plan's "Still open" 1).

## Not taken from the plan's gaps

The plan lists these as gaps, not decisions, so they aren't in the database: a table of units, a table
of payment types, customers, several barcodes per product (`product_barcodes`), and a promo's date window.
