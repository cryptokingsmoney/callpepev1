export type Stablecoin = {
  symbol: 'USDT' | 'USDC'
  name: string
  address: string
  decimals: number
}

// BNB Smart Chain (chainId 56)
// USDT (Binance-Peg BSC-USD): 0x55d398326f99059fF775485246999027B3197955 (18)
// USDC (Binance-Peg USD Coin): 0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d (18)
export const STABLECOINS_BSC: Stablecoin[] = [
  {
    symbol: 'USDT',
    name: 'Tether USD (BSC)',
    address: '0x55d398326f99059fF775485246999027B3197955',
    decimals: 18
  },
  {
    symbol: 'USDC',
    name: 'USD Coin (BSC)',
    address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    decimals: 18
  }
]

export const DEFAULT_TREASURY = '0x7CEAbE8C631Dd3Bf1F62F0a7CE187Db537553951'
