import type { ReactNode } from 'react';

/** A screen's frame: a titled card in the middle of the window. */
export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="kv-screen">
      <section className="kv-panel">
        <header className="kv-panel__header">
          <h1 className="kv-panel__title">{title}</h1>
          {subtitle && <p className="kv-panel__subtitle">{subtitle}</p>}
        </header>
        {children}
      </section>
    </main>
  );
}
