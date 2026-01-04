// Minimal EVM helpers without external deps.

export function isHexString(v: string) {
  return /^0x[0-9a-fA-F]*$/.test(v)
}

export function pad32(hexNo0x: string) {
  return hexNo0x.padStart(64, '0')
}

export function cleanHex(hex: string) {
  return hex.startsWith('0x') ? hex.slice(2) : hex
}

// Parses a decimal string into a bigint with token decimals.
export function parseUnits(amount: string, decimals: number): bigint {
  const s = amount.trim()
  if (!s) throw new Error('Enter an amount')
  if (!/^[0-9]*\.?[0-9]*$/.test(s)) throw new Error('Invalid amount')

  const [wholeRaw, fracRaw = ''] = s.split('.')
  const whole = wholeRaw === '' ? '0' : wholeRaw
  const frac = fracRaw
  if (frac.length > decimals) throw new Error(`Too many decimals (max ${decimals})`)
  const fracPadded = frac.padEnd(decimals, '0')
  const combined = `${whole}${fracPadded}`.replace(/^0+/, '') || '0'
  return BigInt(combined)
}

export function toHex(n: bigint): string {
  return '0x' + n.toString(16)
}

export function encodeErc20Transfer(to: string, amount: bigint): string {
  // transfer(address,uint256) selector = 0xa9059cbb
  const selector = 'a9059cbb'
  const toClean = cleanHex(to).toLowerCase()
  if (toClean.length !== 40) throw new Error('Invalid recipient address')
  const amountHex = amount.toString(16)
  const data =
    '0x' +
    selector +
    pad32(toClean) +
    pad32(amountHex)
  return data
}

export async function getChainId(): Promise<number | null> {
  const eth = (window as any).ethereum
  if (!eth?.request) return null
  const hexId = (await eth.request({ method: 'eth_chainId' })) as string
  if (!hexId || !isHexString(hexId)) return null
  return Number.parseInt(hexId, 16)
}

export async function sendErc20Transfer(
  tokenAddress: string,
  from: string,
  to: string,
  amount: bigint
): Promise<string> {
  const eth = (window as any).ethereum
  if (!eth?.request) throw new Error('No injected wallet found')
  const data = encodeErc20Transfer(to, amount)
  const txHash = (await eth.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from,
        to: tokenAddress,
        data,
        value: '0x0'
      }
    ]
  })) as string
  return txHash
}

export async function watchAsset(tokenAddress: string, symbol: string, decimals: number) {
  const eth = (window as any).ethereum
  if (!eth?.request) return false
  try {
    return await eth.request({
      method: 'wallet_watchAsset',
      params: {
        type: 'ERC20',
        options: {
          address: tokenAddress,
          symbol,
          decimals
        }
      }
    })
  } catch {
    return false
  }
}
