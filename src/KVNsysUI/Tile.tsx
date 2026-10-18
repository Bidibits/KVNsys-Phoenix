import { useId } from 'react';

/**
 * One area of the system on Home: a big button (design-direction.md, rule 4). One the person may
 * not use is greyed out and says why. That only saves a pointless click: the server still checks
 * every request.
 */
export function Tile({
  title,
  description,
  unavailable,
  onOpen,
}: {
  title: string;
  description: string;
  /** Why this person can't open it. Leave it out when they can. */
  unavailable?: string | undefined;
  onOpen: () => void;
}) {
  const noteId = useId();
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={unavailable !== undefined}
      aria-describedby={noteId}
      // Switched off by its colours, not by fading: the reason it gives has to stay readable.
      className="group flex min-h-32 w-full flex-col items-start justify-between gap-3 rounded-lg border border-border bg-card p-5 text-left outline-none transition-colors hover:border-input hover:bg-field focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:border-dashed disabled:bg-muted disabled:hover:border-border disabled:hover:bg-muted"
    >
      <span className="text-xl font-semibold group-disabled:text-muted-foreground">{title}</span>
      <span id={noteId} className="text-[15px] leading-snug text-muted-foreground group-disabled:text-foreground">
        {unavailable ?? description}
      </span>
    </button>
  );
}
