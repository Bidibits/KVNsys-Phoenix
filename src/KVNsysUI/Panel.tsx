import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from './components/ui/card';

/** A screen's frame: a titled card in the middle of the window. */
export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-[540px] gap-0 rounded-lg shadow-none">
        <CardHeader className="px-8 pb-5">
          <h1 className="text-[26px] leading-tight font-semibold">{title}</h1>
          {subtitle && <CardDescription className="text-[17px]">{subtitle}</CardDescription>}
        </CardHeader>
        <CardContent className="px-8">{children}</CardContent>
      </Card>
    </main>
  );
}
