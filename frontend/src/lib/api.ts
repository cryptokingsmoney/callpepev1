const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('callpepe_token')
  // Always return a plain string map so TS accepts it as HeadersInit.
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(API_BASE + path, {
    headers: {
      Accept: 'application/json',
      ...authHeaders()
    }
  })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders()
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}
