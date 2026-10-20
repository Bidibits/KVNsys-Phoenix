# Design direction: how KVNsys POS & Inventory should look, work and grow

**Status: agreed direction (2026-10-18).** Nothing here is built yet beyond what the tables say.
The feature split in part 3 is a proposal for the partners to move items between.

The direction, in one line each:

- **Look:** the old generic KVNsys look, with a modern feel. It follows **Beta's design
  philosophy**, not Beta's exact pixels.
- **Architecture:** **Release's philosophy**, which Phoenix already follows. See the README.
- **Features:** **Capstone 3Re's full functionality** is the destination. The launch list
  comes first.

Until now, the colours and layout of Phoenix's first three screens (connect, sign in, signed in)
were chosen without a reference. Their green-tinted colours, in `src/KVNsysUI/styles.css`, came
from no earlier generation. This document gives the screens a reference.

Sources, all in this repository:
- Beta's own documentation: `Beta/KVNsys Clauded/Documentation/KVNsysUI.md` and `KVNsysClient.md`
- Beta's colours: `Beta/KVNsys Clauded/KVNsysUI/Theming/Themes.cs`
- Capstone 3Re's screens: `Capstone/Capstone-3Re/POS_2/usrCtrl_*`

---

## 1. Beta's design rules, for Phoenix's screens

### 1. One window, one content area

**In Beta:** the main window is a frame: a title bar on top and a single content area below.
Every screen is swapped into that area.

**In Phoenix:**
- One app window.
- The shell is a top bar plus a content area, and screens swap into the content area.
- A second window opens only when someone asks for one (see rule 5).

### 2. The title bar holds the everyday actions

**In Beta:** the title bar has two rows, holding:
- **Navigation:** Back, Forward and Home.
- **Search:** a search box that filters the screen you're on, plus Refresh and Advance Search.
- **Who and where:** who's signed in (full name and username) and which register (register name
  and computer name).
- **The rest:** the screen's title, a clock and the date, Settings, Information, Log Out, a pin
  that keeps the window on top, and the window buttons.

**In Phoenix:** the same set lives in the top bar. One difference: minimise, maximise and close
are Windows' own buttons, drawn by Windows, as in most modern desktop apps.

### 3. Back, Forward and Home, with history

**In Beta:**
- Every screen opened is remembered, so Back and Forward work like a browser's.
- Opening the screen you're already on replaces it instead of piling up copies.
- Home always opens a fresh copy.

**In Phoenix:** the same rules. The mouse's back and forward buttons, and Alt+Left and
Alt+Right, also work.

### 4. Home is a screen of big buttons, shaped by what you may do

**In Beta and Capstone:** after signing in, Home is a screen of big buttons, one per area (13 in
Capstone 3Re, counting Log Out). A button you have no right to is switched off.

**In Phoenix:**
- Home shows one tile per area. At launch: Sell, Shifts, Sales, Products, People and
  Registers. Stock, Settings and the rest join as they're built.
- A tile you may not use is greyed out, with a note saying why.
- The server still checks every request. The greyed tile only saves a pointless click.

### 5. Every table works the same way: a list, a form, a search

**In Beta:**
- **The list:** each table has a dashboard: a row of buttons above a table of records. It can
  show a second table beside or beneath the first, for a record and its details.
- **The form:** the "manager" opens in a **side panel** beside the list with a plain click, or
  in **its own window** with Ctrl+click.
- **The search:** Advance Search opens in the same side panel, with the same Ctrl+click.
- **Product form layout:** two columns: what the product is (code, name, its classification) on
  the left, everything else on the right.

Learn one table and you know them all.

**In Phoenix:**
- One shared list screen (buttons, data table, optional second table) serves every table.
- The form slides in from the right, so the list stays visible.
- Advance Search uses the same panel.
- Each table is described once (its fields, which are required, which are picked from another
  table), and the list, form and search are all built from that description. Release came to
  this after finding four product fields that could be set on the form but appeared in no list.
- Opening a form in its own window (Ctrl+click) comes later.

### 6. Themes reach everything, and colours mean something

**In Beta:**
- Colours are named by their job, not their shade: title bar, surface, field, control,
  alternate row, success, danger, close.
- **Standard**, the everyday theme, is a dark grey title bar over light grey surfaces, white
  input boxes with thin grey borders, slightly darker alternate rows, green for confirm, and red
  for delete and close.
- There are two more themes, Dark and Midnight.
- A status shows its own colour wherever it appears.

**In Phoenix:**
- The same job-named colours, mapped onto the screen parts' own colour slots.
- **Standard is the starting point.** It replaces the green-tinted colours the first screens
  used.
- The light theme comes first; dark comes later.
- Statuses appear as small coloured labels.

### 7. Each person keeps their own table settings

**In Beta:** for each table, each person chooses which columns show, their order, width and
heading, the row stripes, and the sort order. Settings is a page with a section list down the
left.

**In Phoenix:** the same, stored on the server for each person, so the settings follow them to
whichever register they sign in at. Release did this too.

### 8. Notices, not message boxes

**In Beta:**
- Short pop-up notices disappear on their own, coloured by kind.
- A decision that needs more than Yes or No gets a themed dialog with its own buttons.
- Plain Windows message boxes are almost never used: four in the whole program.

**In Phoenix:** the same. Problems are explained in plain words that say what to do, as
Phoenix's screens already do.

### 9. The window holds no business rules

**In Beta:** the main window is only a frame. It knows nothing about selling or stock.

**In Phoenix:** the same, which is Release's philosophy too:
- Screens and shared parts (`KVNsysClientApp`, `KVNsysUI`) show things and pass along what the
  person did.
- The rules live in `KVNsysCore` and the client engine.
- Only the server touches the database.

---

## 2. What "modern" means here

The old KVNsys look is a plain business application: greys, white input boxes, tables of
records, forms of labelled boxes, and colour only where it means something. It stays generic and
calm. "Modern" changes how it feels, not what it is:

| | Old (Beta) | Phoenix |
|---|---|---|
| Parts | Windows Forms controls, some custom-painted so the theme could reach them | shadcn/ui parts, keyboard- and screen-reader-friendly from the start, and themeable all the way down |
| Colour | Standard: dark grey title bar, light grey surfaces, white inputs; bright green to confirm, pure red to delete | Standard's scheme in calmer shades. The green and red come from Beta's own Dark theme, which already softened them. |
| Edges | Square, with thin grey borders on inputs; only the pop-up notices and the scrollbar handle are rounded | Slightly rounded corners and thin borders, no heavy shadows |
| Icons | Emoji on the title-bar buttons (🏠 ⚙ 🚪 📌) | One matching icon set (Lucide, shadcn's own) |
| Lists | Data grids | A proper data table: sortable, the header stays put while you scroll, the arrow keys move between rows, columns can hide |
| Forms | A side panel or a pop-up window | A panel that slides in from the right while the list stays visible |
| Notices | Rounded pop-up notices, in the middle of the screen unless told otherwise | Pop-up notices in a corner, and themed dialogs for decisions |
| Movement | None | A little: the short fades and slides shadcn's parts come with, nothing bouncy |
| Size | One size | **Two:** back-office lists compact, so many rows fit, as in Beta; the selling screen large, with big buttons and type, for speed (and for fingers, if the registers have touch screens) |

On the selling screen the keyboard comes first: the barcode box always has the cursor, and a
scan or Enter adds the item. The keys for payment and discount get decided with the cashiers.

---

## 3. Capstone 3Re's features: before January, and after

**Finished** means one branch running one full real day alongside the old register, with
matching totals (see `decisions.md`). So **before January** is the smallest thing that can take
real money and close a real day. Everything else is **after**, roughly in the order listed.
This split is a proposal: move items between the columns.

Key:
- ✅ already in Phoenix
- 🟢 before January
- ⏭ after January

### Signing in, people and places

| Capstone 3Re | What it does there | Phoenix |
|---|---|---|
| Log in (`logInLocalDatabase`, `logInConnectToServer`) | Sign in, against a local database or a server | ✅ Connect to the shop's server over secure HTTPS, sign in, sessions. Registers always go through the server: no local-database mode, by design. |
| Users (list, form, search) | Accounts and their roles | ✅ A users list and form, to create the cashiers' accounts (2026-10-19) · ⏭ search |
| Roles (list, form, search) | Roles and the rights each holds | ✅ Only the Administrator is made at install (decided 2026-10-19) · ✅ making and editing roles and their rights, so a shop can make a cashier role (2026-10-19) · ⏭ search |
| Terminals (list, form, search) | The registers | 🟢 Each register recorded by itself the first time it connects, as Beta did, plus a list to name them · ⏭ search |
| Configurations | This PC's shop and register | ✅ It remembers its server · ⏭ a settings page |
| Locations (list, form, search) | The shops | ✅ The first shop is made at install · ⏭ screens, when a second branch joins |
| Storages (list, form, search) | Places stock is kept inside a shop | ⏭ |
| Server Manager | Start or stop the server, change its port, see connected registers | ✅ The server sets up its own database and first shop, and its port is a setting · ⏭ a list of connected registers, and disconnecting one |

### Selling and the day

| Capstone 3Re | What it does there | Phoenix |
|---|---|---|
| Transactions (the selling screen) | Scan a barcode, quantity, remove or return an item, discount, payment type, customer's cash, change, finalise, print, void a receipt, store credit from a refund, and several sales kept open at once ("sessions") | 🟢 Scan or search, quantity, remove an item, the senior/PWD 20% discount, cash, change, finalise, print the receipt on the real printer · ⏭ other payment types, store credit, several sales open at once |
| Shift Start | Start a shift with the starting cash | 🟢 |
| Shift End and the shift report | Starting cash, cash and other sales, refunds, cash in and out, expected cash, variance, closing notes | 🟢 Counted cash against expected, and the day's sales |
| Receipts (list, search) | Find past receipts | 🟢 The day's sales list · ⏭ search, reprinting |
| Shifts (list, search) | Past shifts, and from there their receipts and refunds | ⏭ |
| Flows | Money put into or taken out of the drawer during a shift | ⏭ unless the cashiers need it on day one (ask them) |
| Voids | Cancel a paid receipt from the current shift, with a reason | ⏭ unless the cashiers need it on day one (ask them) |
| Refunds and returns | Refund items against a receipt, and send them back to stock | ⏭ The refund flow is still open in `decisions.md`; settle it in the cashier interviews |

### Products and the catalog

| Capstone 3Re | What it does there | Phoenix |
|---|---|---|
| Products (list, form, search) | Products with codes, prices, classification and images | ✅ The list (2026-10-18), and the form: code, barcode, name, price, status (2026-10-19) · 🟢 and **importing the product list from a spreadsheet**, since nobody can type thousands of items before launch · ⏭ classification, images, a search screen |
| Brands, Categories, Manufacturers, Suppliers (list, form, search each) | The classification lists | ⏭ |
| Affiliations | Links between them, so picking a brand narrows the manufacturers, then the suppliers, then the categories | ⏭ |
| Markup Manager | A markup rule per category, brand, supplier or manufacturer | ⏭ |
| Price Tag Display | Electronic shelf labels (ESP32) updated over the network | ⏭ a hardware project of its own |

### Stock and moving goods

| Capstone 3Re | What it does there | Phoenix |
|---|---|---|
| Inventory, Inventory Admin, Inventory Manager | Stock on hand, entering stock, minimum and maximum per storage | 🟢 Stock on hand, receiving and adjusting, before January (decided 2026-10-20: bare bones is selling and stock) · ⏭ minimum and maximum, storages |
| Inventory logs | Every stock movement | ✅ The ledger, in the database (2026-10-20) · 🟢 a screen with a product's movements, alongside the Stock screen |
| Transfers hub: quotes, orders, receiving | Supplier quotes, orders built from them, receiving an order into stock | ⏭ |
| Transfer maker, manager and requests | Moving stock between places, and asking for a transfer | ⏭ HQ-to-branch transfers (one document carrying the stock and the product details) are the first thing after launch |

### The screens' own features (Beta's rules above)

| Feature | Phoenix |
|---|---|
| One window with the top bar, Home tiles, and Back, Forward and Home | ✅ The frame: the top bar (Home, the screen's name, who's signed in, Sign out) and Home's tiles, greyed out without the right (2026-10-18) · 🟢 Back and Forward, search, the register's name |
| A list, form and search for each table, built from one description | ✅ A shared table of records, striped, with a header that stays put (2026-10-18) and the form panel from the right (2026-10-19) · 🟢 a simple search box, and building them from one description · ⏭ Advance Search |
| Pop-up notices and themed dialogs | 🟢 |
| Light theme (Standard) | ✅ (2026-10-18) · ⏭ dark theme |
| Per-person table settings (columns, stripes, sort) | ⏭ |
| Forms in their own window (Ctrl+click) | ⏭ |

### Also before January, though not a Capstone screen

- A nightly backup, and one restore actually tested
- KVNsys Server installed from one setup file and starting with Windows (being built)
- The register app installed from one setup file (✅)

---

## 4. Where the screens go in Release's architecture

Nothing about the project's structure changes. Its rules are in the README, and the dependency
check enforces them on every build:

- **Screens** live in `KVNsysClientApp/screens/`, one folder per area, as `connection/` and
  `identity/` already do: `selling/`, `products/`, `shifts/` and so on. They show things and pass
  along what the person did.
- **Shared screen parts** live in `KVNsysUI`: the shell, the list screen, the form panel,
  notices and dialogs.
- **What each table has** (its fields and rules) will be described once, in `KVNsysCore`.
- **The client engine** (`KVNsysClient`) talks to the server. The screens never do.
- **Only the server** touches the database.

---

## 5. Still open

| Question | Who decides |
|---|---|
| Which "after" features the first branch actually needs on day one, above all refunds, voids and cash in or out | The partners, with the cashiers |
| Home tiles only, or tiles plus a slim side menu for jumping between areas | The partners |
| Whether to keep Beta's Ctrl+click for opening a form in its own window | The partners |
| When the dark theme comes | The partners |
