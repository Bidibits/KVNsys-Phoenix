import type { AccessName, RightBoxGroup, Role, RoleForm, RoleFormResult, RoleResult, RoleStatus } from '@kvnsys/client';
import { Button, FormPanel, Notice, SelectField, TextField, TickBox } from '@kvnsys/ui';
import { useEffect, useState } from 'react';

/** Every status, with what it means. Naming them by RoleStatus makes the build fail if one is missing. */
const StatusChoices = {
  Active: 'Active: its accounts can sign in',
  Inactive: 'Switched off: its accounts cannot sign in',
} satisfies Record<RoleStatus, string>;
const StatusOptions = Object.entries(StatusChoices).map(([value, label]) => ({ value, label }));

const somethingWentWrong = (error: unknown) => ({
  ok: false as const,
  reason: 'unreachable' as const,
  message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
});

/**
 * The rights ticked after one box changes. Ticking a right also ticks the one it needs (changing
 * products needs seeing them); unticking a right also unticks the ones that need it. The engine
 * and the server apply the same rule, so the boxes only show what will be saved.
 */
function afterTick(groups: RightBoxGroup[], rights: string[], access: AccessName, ticked: boolean): string[] {
  const all = groups.flatMap((group) => group.rights);
  const held = new Set(rights);
  if (ticked) {
    held.add(access);
    const needed = all.find((right) => right.access === access)?.needs;
    if (needed) held.add(needed);
  } else {
    held.delete(access);
    for (const right of all) if (right.needs === access) held.delete(right.access);
  }
  return all.map((right) => right.access).filter((right) => held.has(right));
}

/**
 * Making a role (id null) or changing one, in a panel from the right: its name, whether it's
 * switched on, and a tick box per right, grouped by area. The Administrator's boxes are all ticked
 * and can't be changed; only its name can.
 */
export function RoleFormPanel({
  id,
  onClose,
  onSaved,
  onSignInAgain,
}: {
  id: string | null;
  onClose: () => void;
  onSaved: (role: Role) => void;
  onSignInAgain: () => void;
}) {
  const [form, setForm] = useState<RoleForm | null>(null);
  const [groups, setGroups] = useState<RightBoxGroup[]>([]);
  const [fixed, setFixed] = useState(false);
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .roleForm(id)
      .catch((error: unknown): RoleFormResult => somethingWentWrong(error))
      .then((answer) => {
        if (!showing) return;
        if (answer.ok) {
          setForm(answer.form);
          setGroups(answer.groups);
          setFixed(answer.fixed);
        } else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
      });
    return () => {
      showing = false;
    };
  }, [id]);

  async function save() {
    if (!form || saving) return;
    setSaving(true);
    setProblem(null);
    const answer = await window.kvnsys.saveRole(id, form).catch((error: unknown): RoleResult => somethingWentWrong(error));
    setSaving(false);
    if (answer.ok) onSaved(answer.role);
    else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
  }

  const tick = (access: AccessName) => (ticked: boolean) =>
    setForm((current) => current && { ...current, rights: afterTick(groups, current.rights, access, ticked) });

  return (
    <FormPanel
      title={id === null ? 'New role' : 'Edit role'}
      onClose={onClose}
      onSubmit={() => void save()}
      actions={
        <>
          <Button type="button" variant="secondary" size="compact" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="compact" disabled={!form || saving}>
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
      {!form && !problem && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {form && (
        <div className="mt-4 first:mt-0">
          <TextField size="compact" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          <SelectField label="Status" value={form.status} options={StatusOptions} onChange={(status) => setForm({ ...form, status })} disabled={fixed} />
          <section aria-label="Rights" className="mt-5 border-t border-border pt-4">
            <h3 className="text-[15px] font-semibold">Rights</h3>
            <p className="mt-1 text-[14px] leading-snug text-muted-foreground">
              {fixed
                ? 'The Administrator always has every right and stays switched on. Only its name can change.'
                : 'A change counts at once, even for someone already signed in. Their Home screen shows it the next time they sign in.'}
            </p>
            {groups.map((group) => (
              <fieldset key={group.area} className="mt-4">
                <legend className="mb-1 text-[14px] font-semibold text-muted-foreground uppercase">{group.area}</legend>
                {group.rights.map((right) => (
                  <TickBox
                    key={right.access}
                    label={right.description}
                    checked={form.rights.includes(right.access)}
                    onChange={tick(right.access)}
                    disabled={fixed}
                  />
                ))}
              </fieldset>
            ))}
          </section>
        </div>
      )}
    </FormPanel>
  );
}
