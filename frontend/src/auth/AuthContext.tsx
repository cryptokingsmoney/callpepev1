import React, { createContext, useContext, useMemo, useState } from 'react'
import { apiGet, apiPost } from '../lib/api'

type User = {
  id: string
  wallet: string
  role: 'USER' | 'CREATOR' | 'ADMIN' | string
  // stored as milli-credits on backend
  creditsMilli?: number
}

type AuthState = {
  user: User | null
  token: string | null
  isAuthed: boolean
  wallet: string | null
}

type AuthApi = AuthState & {
  connectWallet: () => Promise<boolean>
  logout: () => void
  refreshMe: () => Promise<void>
}

const LS_TOKEN = 'callpepe_token'
const LS_USER = 'callpepe_user'
const LS_WALLET = 'callpepe_wallet'

const AuthCtx = createContext<AuthApi | null>(null)

async function requestWalletAddress(): Promise<string> {
  const eth = (window as any).ethereum
  if (!eth?.request) throw new Error('No wallet provider found (MetaMask, etc.)')

  const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
  const w = accounts?.[0]
  if (!w) throw new Error('No wallet address returned')
  return String(w).toLowerCase()
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(LS_TOKEN))
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(LS_USER)
    return raw ? (JSON.parse(raw) as User) : null
  })
  const [wallet, setWallet] = useState<string | null>(() => localStorage.getItem(LS_WALLET))

  const api = useMemo<AuthApi>(() => ({
    user,
    token,
    wallet,
    isAuthed: Boolean(token && user),

    connectWallet: async () => {
      try {
        const walletLower = await requestWalletAddress()

        // Backend supports a simple wallet login/registration:
        // POST /api/auth/wallet { wallet }
        const res = await apiPost<{ user: User; token: string }>('/api/auth/wallet', {
          wallet: walletLower
        })

        setUser(res.user)
        setToken(res.token)
        setWallet(walletLower)

        localStorage.setItem(LS_USER, JSON.stringify(res.user))
        localStorage.setItem(LS_TOKEN, res.token)
        localStorage.setItem(LS_WALLET, walletLower)
        return true
      } catch (e) {
        console.error(e)
        return false
      }
    },

    logout: () => {
      setUser(null)
      setToken(null)
      setWallet(null)
      localStorage.removeItem(LS_USER)
      localStorage.removeItem(LS_TOKEN)
      localStorage.removeItem(LS_WALLET)
    },

    // Refresh balance from backend
    refreshMe: async () => {
      if (!token || !user) return
      try {
        const res = await apiGet<{ creditsMilli?: number }>('/api/credits/balance')
        const updated = { ...user, creditsMilli: Number(res?.creditsMilli ?? 0) }
        setUser(updated)
        localStorage.setItem(LS_USER, JSON.stringify(updated))
      } catch (e) {
        console.error(e)
      }
    }
  }), [token, user, wallet])

  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
