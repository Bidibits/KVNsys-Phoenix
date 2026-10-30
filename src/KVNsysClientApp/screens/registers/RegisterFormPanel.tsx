import type { ListedRegister, RegisterResult, RegisterStatus, SentRegister } from '@kvnsys/client';
import { Button, FormPanel, Notice, SelectField, TextField } from '@kvnsys/ui';
import { useState } from 'react';

/** Every status, with what it means. Naming them by RegisterStatus makes the build fail if one is missing. */
const StatusChoices = {
  Active: 'Active: people can sign in at it',
  Inactive: 'Inactive: switched off, nobody can sign in at it',
} satisfies Record<RegisterStatus, string>;
const StatusOptions = Object.entries(StatusChoices).map(([value, label]) => ({ value, label }));

/**
 * Naming a register, or switching it off, in a panel from the right. The server PC can only be
 * renamed: switching it off would lock its own screen out.
 */
export function RegisterFormPanel({
  register,
  onClose,
  onSaved,
  onSignInAgain,
}: {
  register: ListedRegister;
  onClose: () => void;
  onSaved: (register: SentRegister) => void;
  onSignInAgain: () => void;
}) {
  const [name, setName] = useState(register.name);
  const [status, setStatus] = useState<string>(register.status);
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    setProblem(null);
    const answer = await window.kvnsys.saveRegister(register.id, { name, status }).catch(
      (error: unknown): RegisterResult => ({
        ok: false,
        reason: 'unreachable',
        message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
    setSaving(false);
    if (answer.ok) onSaved(answer.register);
    else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
  }

  return (
    <FormPanel
      title="Edit register"
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
          {register.code}
          {register.computerName && ` · ${register.computerName}`}
        </p>
        <TextField size="compact" label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <SelectField label="Status" value={status} options={StatusOptions} onChange={setStatus} disabled={register.isServer} />
        {register.isServer && <p className="text-[15px] text-muted-foreground">The server PC stays switched on. Only its name can change.</p>}
      </div>
    </FormPanel>
  );
}
