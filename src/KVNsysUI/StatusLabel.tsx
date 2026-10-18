import { cn } from 'cn';
import { Badge } from './components/ui/badge';

/** The colour each status shows wherever it appears (design-direction.md, rule 6). */
const Colours: Record<string, string> = {
  Active: 'bg-success text-success-foreground',
  Inactive: 'bg-muted text-muted-foreground border-border',
};

/** A record's status as a small coloured label. A status with no colour of its own gets a plain one. */
export function StatusLabel({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('text-[13px]', Colours[status])}>
      {status}
    </Badge>
  );
}
