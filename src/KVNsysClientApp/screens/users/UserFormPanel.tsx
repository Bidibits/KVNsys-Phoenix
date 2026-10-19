import type { Account, AccountStatus, PasswordResult, RoleChoice, UserForm, UserFormResult, UserResult } from '@kvnsys/client';
import { Button, FormPanel, Notice, SelectField, TextField } from '@kvnsys/ui';
import { useEffect, useState } from 'react';

/** Every status, with what it means. Naming them by AccountStatus makes the build fail if one is missing. */
const StatusChoices = {
  Active: 'Active: can sign in',
  Inactive: 'Switched off: cannot sign in',
} satisfies Record<AccountStatus, string>;
const StatusOptions = Object.entries(StatusChoices).map(([value, label]) => ({ value, label }));

const roleOptions = (roles: RoleChoice[]) =>
  roles.map((role) => ({ value: role.id, label: role.status === 'Active' ? role.name : `${role.name} (switched off)` }));

const somethingWentWrong = (error: unknown) => ({
  ok: false as const,
  reason: 'unreachable' as const,
  message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
});

/**
 * Adding an account (id null) or changing one, in a panel from the right. A new account gets its
 * first password here, typed twice. A password is never shown: changing one is its own action,
 * further down, and it signs that person out wherever they are.
 */
export function UserFormPanel({
  id,
  onClose,
  onSaved,
  onSignInAgain,
}: {
  id: string | null;
  onClose: () => void;
  onSaved: (account: Account) => void;
  onSignInAgain: () => void;
}) {
  const [form, setForm] = useState<UserForm | null>(null);
  const [roles, setRoles] = useState<RoleChoice[]>([]);
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState({ password: '', again: '' });
  const [passwordAnswer, setPasswordAnswer] = useState<{ good: boolean; message: string } | null>(null);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .userForm(id)
      .catch((error: unknown): UserFormResult => somethingWentWrong(error))
      .then((answer) => {
        if (!showing) return;
        if (answer.ok) {
          setForm(answer.form);
          setRoles(answer.roles);
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
    const answer = await window.kvnsys.saveUser(id, form).catch((error: unknown): UserResult => somethingWentWrong(error));
    setSaving(false);
    if (answer.ok) onSaved(answer.user);
    else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
  }

  async function changePassword() {
    if (id === null) return;
    setPasswordAnswer(null);
    const answer = await window.kvnsys
      .resetPassword(id, newPassword.password, newPassword.again)
      .catch((error: unknown): PasswordResult => somethingWentWrong(error));
    if (answer.ok) {
      setNewPassword({ password: '', again: '' });
      setPasswordAnswer({ good: true, message: 'Password changed. They have to sign in again with the new one.' });
    } else {
      setPasswordAnswer({ good: false, message: answer.message });
      if (answer.reason === 'ended') setProblem({ message: answer.message, ended: true });
    }
  }

  const typed = (field: keyof UserForm) => (value: string) => setForm((current) => current && { ...current, [field]: value });

  return (
    <FormPanel
      title={id === null ? 'New user' : 'Edit user'}
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
          <TextField size="compact" label="First name" value={form.firstName} onChange={(e) => typed('firstName')(e.target.value)} autoFocus />
          <TextField size="compact" label="Middle name (if any)" value={form.middleName} onChange={(e) => typed('middleName')(e.target.value)} />
          <TextField size="compact" label="Last name" value={form.lastName} onChange={(e) => typed('lastName')(e.target.value)} />
          <TextField
            size="compact"
            label="Username"
            autoComplete="off"
            value={form.username}
            onChange={(e) => typed('username')(e.target.value)}
          />
          <SelectField label="Role" value={form.roleId} options={roleOptions(roles)} onChange={typed('roleId')} />
          <SelectField label="Status" value={form.status} options={StatusOptions} onChange={typed('status')} />
          {id === null && (
            <>
              <TextField
                size="compact"
                label="Password (at least 8 characters)"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => typed('password')(e.target.value)}
              />
              <TextField
                size="compact"
                label="Type the password again"
                type="password"
                autoComplete="new-password"
                value={form.passwordAgain}
                onChange={(e) => typed('passwordAgain')(e.target.value)}
              />
            </>
          )}
          {id !== null && (
            <section aria-label="Change password" className="mt-5 border-t border-border pt-4">
              <h3 className="mb-3 text-[15px] font-semibold">Change password</h3>
              {passwordAnswer && <Notice tone={passwordAnswer.good ? 'good' : 'problem'}>{passwordAnswer.message}</Notice>}
              <div className="mt-3 first:mt-0">
                <TextField
                  size="compact"
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword.password}
                  onChange={(e) => setNewPassword((p) => ({ ...p, password: e.target.value }))}
                />
                <TextField
                  size="compact"
                  label="Type the new password again"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword.again}
                  onChange={(e) => setNewPassword((p) => ({ ...p, again: e.target.value }))}
                />
                <Button type="button" variant="secondary" size="compact" onClick={() => void changePassword()}>
                  Set new password
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
    </FormPanel>
  );
}
