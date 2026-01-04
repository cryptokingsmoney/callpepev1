import { useEffect, useMemo, useState } from 'react'

declare global {
  interface Window {
    ethereum?: any
  }
}

const LS_KEY = 'callpepe_connected_wallet'

function shortAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''
}

export function useWallet() {
  const [addr, setAddr] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [available, setAvailable] = useState<boolean>(() => !!window.ethereum?.request)

  // Try to re-hydrate connection silently if the wallet is still connected.
  useEffect(() => {
    const eth = window.ethereum
    setAvailable(!!eth?.request)
    if (!eth?.request) return

    let mounted = true
    ;(async () => {
      try {
        const accounts: string[] = await eth.request({ method: 'eth_accounts' })
        if (!mounted) return
        if (accounts?.[0]) {
          setAddr(accounts[0])
          try { localStorage.setItem(LS_KEY, accounts[0]) } catch {}
        }
      } catch {
        // ignore
      }
    })()

    const onAccountsChanged = (accounts: string[]) => {
      const next = accounts?.[0] ?? ''
      setAddr(next)
      try {
        if (next) localStorage.setItem(LS_KEY, next)
        else localStorage.removeItem(LS_KEY)
      } catch {
        // ignore
      }
    }

    const onDisconnect = () => {
      setAddr('')
      try { localStorage.removeItem(LS_KEY) } catch {}
    }

    eth.on?.('accountsChanged', onAccountsChanged)
    eth.on?.('disconnect', onDisconnect)

    return () => {
      mounted = false
      eth.removeListener?.('accountsChanged', onAccountsChanged)
      eth.removeListener?.('disconnect', onDisconnect)
    }
  }, [])

  return useMemo(() => {
    return {
      isAvailable: available,
      isConnected: !!addr,
      address: addr,
      addressShort: shortAddr(addr),
      connect: async () => {
        try {
          const eth = window.ethereum
          if (!eth?.request) return false
          const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
          const next = accounts?.[0] ?? ''
          if (next) {
            setAddr(next)
            try { localStorage.setItem(LS_KEY, next) } catch {}
            return true
          }
          return false
        } catch {
          return false
        }
      },
      disconnect: () => {
        // Most injected wallets don't support programmatic disconnect.
        // We clear local state so the UI/log-in flow resets.
        setAddr('')
        try { localStorage.removeItem(LS_KEY) } catch {}
      }
    }
  }, [addr, available])
}
