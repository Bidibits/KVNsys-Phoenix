import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/** How long a notice stays, unless another replaces it first. */
const ShownForMs = 6000;

const ShowNotice = createContext<(message: string) => void>(() => {});

/**
 * Short notices that pop up in a corner and go on their own (design-direction.md, rule 8), such as
 * "Saved Sardines 155g." One at a time: a new one replaces the last, so two saves in a row never
 * stack two notices. Screen readers announce each as it appears.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{ key: number; message: string } | null>(null);
  const show = useCallback((message: string) => setNotice((last) => ({ key: (last?.key ?? 0) + 1, message })), []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), ShownForMs);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <ShowNotice.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-6 bottom-6 z-50">
        {notice && (
          <div key={notice.key} role="status" className="pointer-events-auto rounded-lg bg-success px-5 py-3 text-base text-success-foreground shadow-md">
            {notice.message}
          </div>
        )}
      </div>
    </ShowNotice.Provider>
  );
}

/** Pops up a notice that goes on its own. */
export function useToast(): (message: string) => void {
  return useContext(ShowNotice);
}
