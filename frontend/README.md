# CallPepe Frontend (Wired)

This is a Vite + React (TS) frontend wired to your existing backend:

- Backend URL: `https://call-36jh.onrender.com`
- API base: `VITE_API_BASE_URL`
- Socket URL: `VITE_SOCKET_URL`

## What’s wired right now (safe wiring, no backend changes)

1) **Creator discovery**
- Fetches `GET /api/creators/online` and lists online creators (search/filter client-side)

2) **Auth**
- Wallet connect (stub) + `POST /api/auth/wallet` returns `{ user, token }`
- Token stored in localStorage and sent as `Authorization: Bearer ...`

3) **Room / Call flow**
- Socket.io events match backend: `join-call`, `signal`, `end-call`
- Basic 1:1 WebRTC signaling (offer/answer/ice) over `signal`

4) **Billing + call records**
- Guest starts the DB call record via `POST /api/calls/start` (requires auth)
- End call calls `POST /api/calls/end`
- Stripe checkout via `POST /api/billing/checkout`

5) **User dashboard + Stablecoin credits (no Stripe required)**
- New route: `/dashboard` shows wallet + credits balance
- New route: `/buy` sends USDT/USDC (BSC) directly to your treasury and then calls `POST /api/credits/claim`
- New route: `/creators` lists online creators with quick call links

## Run locally

```bash
npm install
npm run dev
```

## Deploy (Netlify)

- Build command: `npm run build`
- Publish directory: `dist`
- Add env vars in Netlify:
  - `VITE_API_BASE_URL=https://call-36jh.onrender.com`
  - `VITE_SOCKET_URL=https://call-36jh.onrender.com`
  - `VITE_TREASURY_ADDRESS=0x7CEAbE8C631Dd3Bf1F62F0a7CE187Db537553951`

## Notes on the “4 big items”

This frontend implements **as much as possible** without changing your backend:

- **Room creation/persistence:** rooms are socket-based; we generate `roomId` and share links.
- **Creator matching UI:** click a creator → auto-creates a room and passes `creatorId` in the URL (used for `/api/calls/start`).
- **Presence/busy:** online/offline is wired; busy is currently local-only (needs backend/socket broadcast to be global).
- **Billing timer + deductions:** call records start/end are wired. Actual credit deduction is still TODO in backend services.
