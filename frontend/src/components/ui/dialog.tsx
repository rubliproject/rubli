import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { cn, omit } from '@/lib/utils'
import { X } from 'lucide-react'

interface DialogContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue>({
  open: false,
  onOpenChange: () => {},
})

interface DialogProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const Dialog: React.FC<DialogProps> = ({ children, open = false, onOpenChange }) => {
  return (
    <DialogContext.Provider value={{ open, onOpenChange: onOpenChange || (() => {}) }}>
      {children}
    </DialogContext.Provider>
  )
}

interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ children, ...rest }, ref) => {
    const props = omit(rest, ['asChild'])
    const { onOpenChange } = React.useContext(DialogContext)
    return (
      <button ref={ref} onClick={() => onOpenChange(true)} {...props}>
        {children}
      </button>
    )
  }
)
DialogTrigger.displayName = 'DialogTrigger'

type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

const DIALOG_SIZE_PX: Record<DialogSize, string> = {
  sm: '24rem',
  md: '32rem',
  lg: '42rem',
  xl: '56rem',
  full: '90vw',
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: DialogSize
  /**
   * Controls vertical alignment of the dialog panel within the overlay.
   * - 'center' (default): dialog is vertically centred — standard behaviour.
   * - 'top': dialog is pinned near the top of the screen. Use this for
   *   palettes / search modals on mobile where the on-screen keyboard rises
   *   from the bottom and would otherwise cover a centred dialog.
   * - 'bottom': full-width bottom sheet (phone filter drawers).
   */
  align?: 'center' | 'top' | 'bottom'
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, size = 'md', align = 'center', style, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(DialogContext)
    const { i18n } = useTranslation()
    const isEs = i18n.language?.startsWith('es')
    const innerRef = React.useRef<HTMLDivElement | null>(null)
    const setRefs = React.useCallback((node: HTMLDivElement | null) => {
      innerRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
    }, [ref])

    // Focus moves into the dialog on open and back to the trigger on close;
    // Esc closes it wherever focus sits (it was bound to the content's own
    // onKeyDown, dead while focus stayed on the trigger); Tab wraps inside
    // the dialog (focus trap, PARALLAX D13b § Change 8, N3).
    // Latest callback in a ref: an inline onOpenChange must not re-run the
    // effect (each re-run would pull focus off controls inside the dialog).
    const onOpenChangeRef = React.useRef(onOpenChange)
    React.useEffect(() => { onOpenChangeRef.current = onOpenChange }, [onOpenChange])
    React.useEffect(() => {
      if (!open) return
      // a child that took focus on mount (autoFocus, e.g. the ⌘K input) keeps it: this effect runs after the commit,
      // so focusing the container here stole it (AUDIT_JOURNALIST 11-07: typed text went nowhere)
      const at = document.activeElement as HTMLElement | null
      const inside = !!at && !!innerRef.current?.contains(at)
      const trigger = inside ? null : at
      if (!inside) innerRef.current?.focus()
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { onOpenChangeRef.current(false); return }
        const root = innerRef.current
        if (e.key !== 'Tab' || !root) return
        const els = [...root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
        )].filter((el) => el.offsetParent !== null)
        if (!els.length) { e.preventDefault(); root.focus(); return }
        const first = els[0], last = els[els.length - 1]
        const at = document.activeElement
        if (e.shiftKey ? (at === first || !root.contains(at)) : (at === last || !root.contains(at))) {
          e.preventDefault()
          ;(e.shiftKey ? last : first).focus()
        }
      }
      document.addEventListener('keydown', onKey)
      return () => {
        document.removeEventListener('keydown', onKey)
        if (trigger && document.contains(trigger)) trigger.focus()
      }
    }, [open])

    if (!open) return null

    return createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: align === 'top' ? 'flex-start' : align === 'bottom' ? 'flex-end' : 'center',
          justifyContent: 'center',
          padding: align === 'top' ? '1rem 1rem 0' : align === 'bottom' ? 0 : '1rem',
        }}
      >
        {/* Backdrop */}
        <div
          aria-hidden="true"
          className="overlay-fade"
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
          onClick={() => onOpenChange(false)}
        />
        {/* Content */}
        <div
          ref={setRefs}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          tabIndex={-1}
          // The caller's style merges over the layout (a bare `style={{ maxWidth }}`
          // used to replace position/zIndex/maxHeight and threw the × to the
          // viewport's corner).
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: align === 'bottom' ? '100%' : DIALOG_SIZE_PX[size],
            maxHeight: '85vh',
            overflowY: 'auto',
            outline: 'none',
            ...style,
          }}
          className={cn(
            'overlay-in border border-border bg-background-card p-6 shadow-lg rounded-sm',
            align === 'bottom' && 'rounded-b-none border-x-0 border-b-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]',
            className
          )}
          {...props}
        >
          {children}
          <button
            className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{isEs ? 'Cerrar' : 'Close'}</span>
          </button>
        </div>
      </div>,
      document.body
    )
  }
)
DialogContent.displayName = 'DialogContent'

const DialogHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
    {...props}
  />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, id, ...props }, ref) => (
  <h2
    ref={ref}
    id={id ?? 'dialog-title'}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = 'DialogTitle'

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-text-muted', className)}
    {...props}
  />
))
DialogDescription.displayName = 'DialogDescription'

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
