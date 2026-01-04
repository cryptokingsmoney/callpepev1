import React, { createContext, useContext, useMemo, useState } from 'react'

type Toast = { id: string; text: string }

type ToastApi = {
  push: (text: string) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const api = useMemo<ToastApi>(() => ({
    push: (text: string) => {
      const id = Math.random().toString(36).slice(2)
      const t: Toast = { id, text }
      setItems((prev) => [t, ...prev].slice(0, 4))
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id))
      }, 2600)
    }
  }), [])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toastHost" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div key={t.id} className="toast">{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function ToastHost() {
  // This component is kept for backwards compat if you want to mount provider later.
  return null
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) {
    // lightweight fallback to avoid crashing if provider not used
    return { push: (t: string) => console.log('[toast]', t) }
  }
  return ctx
}
