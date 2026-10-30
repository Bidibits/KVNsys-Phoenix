import { cn } from 'cn';
import { Badge } from './components/ui/badge';

/**
 * The colour each status shows wherever it appears (design-direction.md, rule 6). The audit log's
 * kinds of change are coloured as Beta's were: made green, changed amber, switched off grey.
 */
const Colours: Record<string, string> = {
  Active: 'bg-success text-success-foreground',
  Inactive: 'bg-muted text-muted-foreground border-border',
  Created: 'bg-success text-success-foreground',
  Updated: 'bg-warning text-warning-foreground',
  Decommissioned: 'bg-muted text-muted-foreground border-border',
};

/** A record's status, or another word from a fixed list, as a small coloured label. A word with no colour of its own gets a plain one. */
export function StatusLabel({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('text-[13px]', Colours[status])}>
      {status}
    </Badge>
  );
}
