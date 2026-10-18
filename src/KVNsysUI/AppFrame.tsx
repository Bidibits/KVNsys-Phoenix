import type { ButtonHTMLAttributes, ReactNode } from 'react';
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
 * actions. So far that's Home, who's signed in, and Sign out; Back, Forward, search, the register
 * and Settings join it as they're built.
 */
export function AppFrame({
  title,
  signedIn,
  onHome,
  onSignOut,
  signingOut = false,
  children,
}: {
  /** The screen's name, shown in the bar. */
  title: string;
  signedIn: { name: string; username: string };
  onHome: () => void;
  onSignOut: () => void;
  signingOut?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 bg-title-bar px-3 text-title-bar-foreground">
        <TitleBarButton onClick={onHome}>Home</TitleBarButton>
        <h1 className="ml-2 truncate text-xl font-semibold">{title}</h1>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <p className="min-w-0 text-right leading-tight" aria-label="Signed in">
            <span className="block truncate font-semibold">{signedIn.name}</span>
            <span className="block truncate text-sm opacity-80">{signedIn.username}</span>
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
