**KVNsysUI** — shared screen pieces: big buttons, keypad, tables. May use: KVNsysCore.

Built on [shadcn/ui](https://ui.shadcn.com) and Tailwind. shadcn's parts are copied into
`components/ui/` and become our code: add one with `npx shadcn@4.22.0 add <part>` from this
folder, then pin any dependency it adds to an exact version. KVNsys's own parts, such as `Button`
and `TextField`, are built on them, and screens use ours. `styles.css` holds the KVNsys colours.
