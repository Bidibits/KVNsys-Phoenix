import type { ListedMachine, MachineResult, MachineStatus, SentMachine } from '@kvnsys/client';
import { Button, FormPanel, Notice, SelectField, TextField } from '@kvnsys/ui';
import { useState } from 'react';

/** Every status, with what it means. Naming them by MachineStatus makes the build fail if one is missing. */
const StatusChoices = {
  Active: 'Active: people can sign in at it',
  Inactive: 'Inactive: switched off, nobody can sign in at it',
} satisfies Record<MachineStatus, string>;
const StatusOptions = Object.entries(StatusChoices).map(([value, label]) => ({ value, label }));

/**
 * Naming a machine, or switching it off, in a panel from the right. The server PC can only be
 * renamed: switching it off would lock its own screen out.
 */
export function MachineFormPanel({
  machine,
  onClose,
  onSaved,
  onSignInAgain,
}: {
  machine: ListedMachine;
  onClose: () => void;
  onSaved: (machine: SentMachine) => void;
  onSignInAgain: () => void;
}) {
  const [name, setName] = useState(machine.name);
  const [status, setStatus] = useState<string>(machine.status);
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    setProblem(null);
    const answer = await window.kvnsys.saveMachine(machine.id, { name, status }).catch(
      (error: unknown): MachineResult => ({
        ok: false,
        reason: 'unreachable',
        message: `Something went wrong on this machine: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
    setSaving(false);
    if (answer.ok) onSaved(answer.machine);
    else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
  }

  return (
    <FormPanel
      title="Edit machine"
      onClose={onClose}
      onSubmit={() => void save()}
      actions={
        <>
          <Button type="button" variant="secondary" size="compact" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="compact" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      {problem && <Notice tone="problem">{problem.message}</Notice>}
      {problem?.ended && (
        <Button type="button" size="compact" className="mt-3" onClick={onSignInAgain}>
          Sign in again
        </Button>
      )}
      <div className="mt-4 first:mt-0">
        <p className="mb-4 text-[15px] text-muted-foreground">
          {machine.code}
          {machine.computerName && ` · ${machine.computerName}`}
        </p>
        <TextField size="compact" label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <SelectField label="Status" value={status} options={StatusOptions} onChange={setStatus} disabled={machine.isServer} />
        {machine.isServer && <p className="text-[15px] text-muted-foreground">The server PC stays switched on. Only its name can change.</p>}
      </div>
    </FormPanel>
  );
}
