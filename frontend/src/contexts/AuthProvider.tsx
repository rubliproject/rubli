/** AuthProvider — session state + auth actions; context and useAuth live in ./AuthContext. */

import { useEffect, useState, useCallback } from 'react'
import { apiLogin, apiRegister, apiMe, type User } from '@/lib/auth-api'
import { AuthContext, JWT_KEY } from './AuthContext'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(JWT_KEY))
  // Loading only while a stored token is being validated.
  const [isLoading, setIsLoading] = useState<boolean>(() => localStorage.getItem(JWT_KEY) !== null)

  // On mount: if a stored token exists, validate it
  useEffect(() => {
    const stored = localStorage.getItem(JWT_KEY)
    if (!stored) return
    apiMe(stored)
      .then((me) => {
        setUser(me)
        setToken(stored)
      })
      .catch(() => {
        // Token invalid or expired — clear it silently
        localStorage.removeItem(JWT_KEY)
        setToken(null)
        setUser(null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password)
    localStorage.setItem(JWT_KEY, data.access_token)
    setToken(data.access_token)
    setUser(data.user)
  }, [])

  const register = useCallback(async (email: string, password: string, name: string) => {
    const data = await apiRegister(email, password, name)
    localStorage.setItem(JWT_KEY, data.access_token)
    setToken(data.access_token)
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(JWT_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
