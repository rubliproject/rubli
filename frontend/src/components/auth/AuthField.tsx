/**
 * AuthField — label (Spectral SC 13) over a 48px ink-ruled input (DESIGN.md §8 Search).
 * Passwords set in mono: tokens are read precisely.
 */
import { type InputHTMLAttributes } from 'react'

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  id: string
  /** Mono value (passwords). Default false. */
  mono?: boolean
}

export function AuthField({ label, id, mono = false, className, ...inputProps }: AuthFieldProps) {
  return (
    <div className="au-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className={[mono ? 'is-mono' : null, className].filter(Boolean).join(' ')} {...inputProps} />
    </div>
  )
}

/** AuthErrorPill — the error as a 3px critical rule + mono line, no wash. */
export function AuthErrorPill({ message }: { message: string }) {
  return <p role="alert" className="au-error">{message}</p>
}
