import { useId, type ReactNode } from 'react';

/** One titled part of the dashboard, on a card. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-3">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}
