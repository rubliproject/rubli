/**
 * AuthContext — provides user session state and auth actions throughout the app.
 * JWT stored in localStorage under "rubli_jwt".
 * On mount, validates an existing token via GET /auth/me; clears on 401.
 */

import { createContext, useContext } from 'react'
import type { User } from '@/lib/auth-api'

export const JWT_KEY = 'rubli_jwt'

export interface AuthContextValue {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
