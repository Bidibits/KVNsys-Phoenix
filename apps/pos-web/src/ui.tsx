import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

// Touch-first: every control is at least 56px tall, well over the 44px minimum.

export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 sm:p-8">{children}</div>
    </main>
  );
}

export function Title({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold">{children}</h1>
      {hint && <p className="mt-2 text-slate-600">{hint}</p>}
    </header>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="block mb-4">
      <span className="block mb-1 font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="block mt-1 text-sm text-red-700">{error}</span>}
    </label>
  );
}

const control = 'w-full h-14 rounded-xl border border-slate-300 bg-white px-4 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-600';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={control} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={control} />;
}

export function PrimaryButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full h-14 rounded-xl bg-emerald-700 text-white text-lg font-semibold hover:bg-emerald-800 disabled:opacity-60 active:scale-[0.99]"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full h-14 rounded-xl border border-slate-300 text-lg font-medium text-slate-700 hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-800">
      {children}
    </p>
  );
}
