/**
 * Modal focus contract (lifted from RayosX): focus moves inside on open, Tab cycles within,
 * Esc closes, and focus returns to the opener on close.
 */
import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Keeps Tab / Shift+Tab inside `root`. */
export function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const els = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
  if (!els.length) return
  const first = els[0], last = els[els.length - 1], at = document.activeElement
  if (!root.contains(at) || (e.shiftKey ? (at === first || at === root) : at === last)) { e.preventDefault(); (e.shiftKey ? last : first).focus() }
}

export function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!active) return
    const opener = document.activeElement as HTMLElement | null
    const root = ref.current
    if (root && !root.contains(opener)) (root.querySelector<HTMLElement>(FOCUSABLE) ?? root).focus()
    const onKey = (e: KeyboardEvent) => {
      const r = ref.current
      if (!r) return
      if (e.key === 'Escape') { e.preventDefault(); close.current() } else if (e.key === 'Tab') trapTab(e, r)
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); if (opener?.isConnected) opener.focus() }
  }, [active, ref])
}

/** Non-modal side panel: focus moves to `target` once on open (not on every content change)
 *  and returns to the opener on close, unless the reader already moved it elsewhere. */
export function usePanelFocus(target: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    target.current?.focus({ preventScroll: true })
    return () => {
      const at = document.activeElement
      if (opener?.isConnected && (!at || at === document.body)) opener.focus({ preventScroll: true })
    }
  }, [target])
}
