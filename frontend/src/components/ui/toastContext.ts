// Context + hook live apart from the provider component (react-refresh/only-export-components).
import { createContext, useContext, useMemo } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

/** How long each toast stays up (a lifetime, not an animation — not a motion token). */
const TOAST_LIFETIME_MS = { success: 4000, error: 6000, warning: 5000, info: 4000 } as const

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }

  const { addToast } = context

  // Memoized on the stable addToast: a fresh object every render made
  // `useEffect(..., [toast])` callers re-fire on each toast → React #185 loop.
  return useMemo(
    () => ({
      success: (title: string, message?: string) =>
        addToast({ type: 'success', title, message, duration: TOAST_LIFETIME_MS.success }),
      error: (title: string, message?: string) =>
        addToast({ type: 'error', title, message, duration: TOAST_LIFETIME_MS.error }),
      warning: (title: string, message?: string) =>
        addToast({ type: 'warning', title, message, duration: TOAST_LIFETIME_MS.warning }),
      info: (title: string, message?: string) =>
        addToast({ type: 'info', title, message, duration: TOAST_LIFETIME_MS.info }),
    }),
    [addToast],
  )
}
