# CallPepe Backend Skeleton

## Quick start

> **Install note:** use `npm install` (not `npm ci`) unless you have generated a fresh lockfile on your machine.

```bash
cp .env.example .env
# edit .env with your Stripe + DB
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

API base: `http://localhost:4000/api`

- `POST /api/auth/wallet` `{ wallet }` → `{ user, token }`
- `GET /api/admin/health`
- `POST /api/billing/checkout` (auth required)
- `POST /api/calls/start` (auth required)
- `POST /api/calls/end` (auth required)

WebSocket signaling: same host, Socket.io namespace `/`.
