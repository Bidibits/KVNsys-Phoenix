import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from 'cn';

/** A button on the dark title bar. */
function TitleBarButton({ className, ...button }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...button}
      className={cn(
        'h-10 rounded-md px-3 text-[15px] font-medium outline-none transition-colors',
        'hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-white/50 disabled:opacity-50',
        className,
      )}
    />
  );
}

/**
 * The window once someone is signed in (design-direction.md, rules 1 and 2): the title bar on top,
 * and below it the one content area every screen is swapped into. The bar holds the everyday
 * actions. So far that's Back, Forward and Home, the screen's search, who's signed in and at which
 * register, and Sign out; Settings and the clock join it as they're built.
 */
export function AppFrame({
  title,
  signedIn,
  onHome,
  onBack,
  onForward,
  search,
  onSignOut,
  signingOut = false,
  children,
}: {
  /** The screen's name, shown in the bar. */
  title: string;
  /** Back and Forward through the screens opened (rule 3); null when there's nowhere to go. Alt+Left and Alt+Right, and the mouse's own back and forward buttons, do the same. */
  onBack: (() => void) | null;
  onForward: (() => void) | null;
  /** The box that filters the list on the screen (rule 2), or null on a screen with no list. */
  search: { value: string; onChange: (value: string) => void } | null;
  /** Who's signed in, and at which register, if any. */
  signedIn: { name: string; username: string; register?: string | null };
  onHome: () => void;
  onSignOut: () => void;
  signingOut?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowLeft' && onBack) (event.preventDefault(), onBack());
      if (event.key === 'ArrowRight' && onForward) (event.preventDefault(), onForward());
    }
    // A mouse's back and forward buttons are buttons 3 and 4.
    function mouse(event: MouseEvent) {
      if (event.button === 3 && onBack) (event.preventDefault(), onBack());
      if (event.button === 4 && onForward) (event.preventDefault(), onForward());
    }
    window.addEventListener('keydown', key);
    window.addEventListener('mouseup', mouse);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('mouseup', mouse);
    };
  }, [onBack, onForward]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 bg-title-bar px-3 text-title-bar-foreground">
        <TitleBarButton onClick={() => onBack?.()} disabled={!onBack} aria-label="Back" title="Back (Alt+Left)">
          ‹
        </TitleBarButton>
        <TitleBarButton onClick={() => onForward?.()} disabled={!onForward} aria-label="Forward" title="Forward (Alt+Right)">
          ›
        </TitleBarButton>
        <TitleBarButton onClick={onHome}>Home</TitleBarButton>
        <h1 className="ml-2 truncate text-xl font-semibold">{title}</h1>
        {search && (
          <input
            type="search"
            aria-label="Search this list"
            placeholder="Search this list"
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            className="ml-4 h-10 w-64 min-w-0 rounded-md border border-white/20 bg-white/10 px-3 text-[15px] text-title-bar-foreground placeholder:text-white/60 outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
          />
        )}
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <p className="min-w-0 text-right leading-tight" aria-label="Signed in">
            <span className="block truncate font-semibold">{signedIn.name}</span>
            <span className="block truncate text-sm opacity-80">
              {signedIn.register ? `${signedIn.username} · ${signedIn.register}` : signedIn.username}
            </span>
          </p>
          <TitleBarButton onClick={onSignOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </TitleBarButton>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
