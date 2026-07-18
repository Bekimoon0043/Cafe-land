# Coffee Land ERP

A bilingual (English/Amharic) Point of Sale and restaurant management system with POS, KDS (Kitchen Display), table management, inventory, staff coordination, and a QR-code-based customer-facing menu.

## Stack

- **Frontend**: React + Vite + Tailwind CSS v4 + Shadcn/UI — `artifacts/coffee-land`
- **Backend**: Express 5 + Drizzle ORM + TypeScript — `artifacts/api-server`
- **Database**: Replit PostgreSQL (Drizzle push, no migration files)
- **API client**: Orval-generated React Query hooks — `lib/api-client-react`
- **Monorepo**: pnpm workspaces

## Running the app

```bash
# Install dependencies
pnpm install

# Push DB schema (first time or after schema changes)
pnpm --filter @workspace/db run push

# Seed demo data
pnpm --filter @workspace/api-server run seed

# Start API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Start frontend (port from $PORT env)
pnpm --filter @workspace/coffee-land run dev
```

Both services are managed as Replit workflows and start automatically.

## Environment variables

- `DATABASE_URL` / `PG*` — Replit-provided PostgreSQL (auto-configured)
- `SESSION_SECRET` — JWT signing secret (stored as Replit secret)

## Demo credentials

| Role    | Username  | Password  |
|---------|-----------|-----------|
| Admin   | admin     | admin123  |
| Manager | manager1  | pass123   |
| Cashier | cashier1  | pass123   |
| Kitchen | kitchen1  | pass123   |

## User preferences

_No custom preferences recorded yet._
