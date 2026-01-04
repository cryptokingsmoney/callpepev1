// Small runtime helpers so the app works out-of-the-box in more deploy setups.

/**
 * Returns the configured API base URL.
 * - If VITE_API_BASE_URL is set (recommended for Netlify -> Render), it is used.
 * - Otherwise we fall back to same-origin (""), which works when frontend and backend are served together.
 */
export function apiBaseUrl(): string {
  const v = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  return v
}
