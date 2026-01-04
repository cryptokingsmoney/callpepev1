import { useMemo, useState } from 'react'

declare global {
  interface Window { ethereum?: any }
}

export function useWalletStub() {
  const [addr, setAddr] = useState<string>('')

  const isConnected = !!addr

  return useMemo(() => ({
    isConnected,
    address: addr,
    addressShort: addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '',
    connect: async () => {
      try {
        if (!window.ethereum?.request) return false
        const accounts: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' })
        if (accounts?.[0]) setAddr(accounts[0])
        return true
      } catch {
        return false
      }
    }
  }), [addr, isConnected])
}
