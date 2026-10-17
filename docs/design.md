# Phoenix — design

How the system is shaped, and why. Read it before writing code. The *why* matters more than
the *what*: most of these choices were learned from a bug in an earlier generation.

---

## 1. The business

A general merchandise company with **seven branches** in Quezon. One branch is **head office
(HQ)**: it takes delivery from suppliers, has trained staff who encode each product, sets the
price, and sends goods to the six smaller branches. The smaller branches don't have staff
trained to encode products.

Today every branch types every product in again by hand.

## 2. The constraint: no reliable internet

Most branches have no reliable internet. A week without a connection has to be survivable.

But **goods already travel from HQ to each branch on a delivery truck**. So the data can travel
with the goods. That's the idea every KVNsys generation has been built on.

> **Non-negotiable:** a branch can sell with no connection to anything, indefinitely.

## 3. Every record has one owner

Offline sync is normally hard. It becomes easy under one rule: **only the owner of a record ever
writes it.**

| Owner | Owns |
|---|---|
| **HQ** | The catalog: products, prices, categories, brands, suppliers |
| **Each branch** | Its own sales, shifts, stock counts and staff |

Nothing is ever written in two places, so there's nothing to merge and no conflicts to resolve.

## 4. Where it runs

| Piece | Runs on |
|---|---|
| **Each branch** | One PC runs the API + PostgreSQL as a Windows service. Cashier screens are browsers on the shop's own Wi-Fi/LAN. |
| **HQ** | The same app on its own server PC |

No Docker on branch PCs: install Node and PostgreSQL directly. One install script sets up a
branch in one sitting.

**The risk this creates:** if a branch PC dies, that branch stops selling. That's handled
operationally with a UPS, a nightly backup to USB, and a spare PC that can be restored in under
an hour.

## 5. How data moves between HQ and a branch

*Proposed 2026-10-16, not yet built.*

HQ's changes travel as **numbered packages**, and a package can travel **either way**:

| Step | What happens |
|---|---|
| 1 | Every product or price change at HQ goes into a change log with a number: 41, 42, 43… |
| 2 | **Internet up:** HQ sends the branch everything after the last number it confirmed. The branch replies "I have up to 43." |
| 3 | **Internet down:** the same package goes on a USB stick with the delivery |
| 4 | At the branch, **Receive delivery** loads the products and the stock in one step. Nobody types. |
| 5 | When a connection returns, the branch's confirmation reaches HQ and anything missing follows |

Rules that make it safe:

- **A package holds everything since the branch's last confirmation**, not just today's changes.
  A lost USB stick is harmless because the next package covers it.
- **Importing the same package twice changes nothing.** The internet copy and the USB copy can
  both arrive.
- **A branch never needs HQ to sell.** It keeps the prices it last received, and shows "catalog
  as of <date>".
- **Temporary products:** if a branch receives goods directly from a supplier, a small form
  (name, price, scanned barcode) lets it sell them at once. HQ links or properly encodes them
  later, and the proper version replaces the temporary one on the next package.

Sales summaries travel the other way, branch to HQ, on the same rails.

## 6. The structure

**Dependencies point inward.** The business rules know nothing about the database or the screen.
The code is cut by **business area** (a folder each), and every area has the same four layers:

| Layer | Holds | Rule |
|---|---|---|
| `domain/` | The rules (totals, discounts, what's allowed) | Plain TypeScript. Imports no NestJS, no Prisma, no HTTP. |
| `application/` | The operations (ring a sale, receive a delivery) | Uses `domain/`; reaches the database only through repository interfaces |
| `infrastructure/` | Repositories | **The only place Prisma is imported** |
| `http/` | NestJS controllers | Checks permission, calls `application/`, nothing else |

The web apps **never import a module or the database**. They talk only through the API client.

These rules are **enforced by a lint rule** that fails the build, not just written down.

### Folder layout

```
Phoenix/
├─ apps/
│  ├─ api/            NestJS: wires the modules together
│  ├─ pos-web/        the cashier screen (touch-first)
│  └─ admin-web/      office screens (desktop-first)
├─ modules/
│  ├─ identity/       users, roles, accesses, sign-in
│  ├─ locations/      locations, machines, PSGC address tables
│  ├─ catalog/        products, categories, brands, manufacturers, suppliers
│  ├─ inventory/      stock, stock ledger, stock documents
│  ├─ selling/        shifts, receipts, items, payments
│  ├─ exchange/       HQ ↔ branch packages, sales summaries
│  └─ audit/          audit log, outbox
├─ packages/
│  ├─ contracts/      zod schemas shared by the api and the web apps
│  ├─ api-client/     typed calls to the api
│  ├─ pos-engine/     cart, totals; later, an offline queue
│  └─ ui/             shared components (touch-sized buttons, keypad)
├─ database/          prisma/schema.prisma, migrations, seeds
├─ deploy/            install script, backup + restore, LAN HTTPS
└─ docs/
```

Folders for CRM, HRIS, purchasing and accounting are added only when there's work for them.
Payroll and HRIS are better bought than built.

## 7. The schema

**Source:** [`../../Release/SCHEMA-PLAN.md`](../../Release/SCHEMA-PLAN.md), written once by hand
into `schema.prisma`, using `@map`/`@@map` so PostgreSQL keeps `snake_case` names. From then on,
**Prisma Migrate is the only migration tool.**

- **Money** is PostgreSQL `numeric` → Prisma `Decimal`. Never a JavaScript number
  (0.1 + 0.2 ≠ 0.3).
- **Ids** are UUID v7, generated by the app.

**Changes from SCHEMA-PLAN:**

| Change | Why |
|---|---|
| Add `outbox_events` | Records "this happened" in the same transaction, so nothing downstream misses or doubles it |
| Add `receipts.client_key` (unique) | A sale retried after a dropped connection is recognised, not doubled |
| Add a per-machine receipt counter | Sequential receipt numbers; BIR will want them |
| `machines.machine_uuid` becomes a random device token; drop `machine_name` | A browser can't read the computer's hardware id or name (§8) |
| Keep `transfer_imports`, `sales_imports`, `consolidated_sales` | Branches stay disconnected, so data moves as documents (§5) |

## 8. Build order

**First goal: the walking skeleton.** The thinnest version that goes through every layer and is
**installed on a real branch PC**, opened from another device on the shop's Wi-Fi.

| # | Build | Notes |
|---|---|---|
| 1 | **Seed the database** | First location (HQ), the roles, the first admin, and the server PC as the first machine. PSGC address tables wait until their format is checked against the PSA list. |
| 2 | **Machine recording (device registration)** | See below |
| 3 | **Machine CRUD** | List, rename, move to another location, decommission, replace a device |
| then | Sign in → products + spreadsheet import → selling → receipt printing → close shift | The first-launch list |

### Device registration

A web page can't see which computer it runs on. Browsers block hardware ids and computer names
on purpose. So a device is *registered* rather than *detected*:

1. A browser with no device token opens the app and sees "This device isn't registered."
2. A manager signs in on it, picks the location, and names it ("Front counter 1").
3. The server creates the `machines` row and gives the browser a random token, kept in a cookie.
4. Every request carries the token, and the server stamps that machine on everything saved.

**The server PC** is the one machine that *can* record itself: Node can read its computer name
and Windows machine id. It's recorded during seeding.

**If someone clears the browser's data,** the token is lost. Machine CRUD needs **"replace this
device"**, which gives a new token to the *existing* machine row instead of creating a duplicate.

## 9. The first launch list

**In:** sign in · products (add, edit, spreadsheet import) · selling (shift, scan, quantity, remove
a line, senior/PWD 20% discount, cash, change) · receipt printing · close shift with drawer count ·
nightly backup with a tested restore.

**After the first real day:** HQ → branch packages · stock · a second branch · everything else.

## 10. Lessons from earlier generations

Each was a real bug. Each gets a test here.

| Lesson | The bug |
|---|---|
| Receipt and shift codes must not start with a timestamp | Two sales in the same minute got the same code, and the second silently failed |
| Money is never floating point | |
| A zero price is refused at the till | An unpriced item rang up free |
| A discount must reach the database | Every sale was saved with a discount of 0 |
| A receipt shows paid status, date, cashier and register | All four were missing on the first printed receipts |
| A dropped connection ends its session | Disconnected clients stayed "signed in" until restart |
| A screen never does I/O or opens a dialog while it's being built | One screen hung the whole app when the server was down |
| A test that can't run shows as **skipped**, never passed | 146 tests "passed" without running |
| Importing the same document twice changes nothing; an older one is refused | HQ's sales totals grew every day from re-imported history |
