---
name: Coffee Land ERP Architecture
description: Full-stack bilingual ERP for Coffee Land restaurant — key decisions, quirks, and patterns to stay consistent with
---

## Stack
- **Frontend**: React + Vite, Tailwind v4 (`@tailwindcss/vite`), wouter routing, Orval React Query hooks — `artifacts/coffee-land`
- **Backend**: Express + Drizzle ORM, JWT RBAC (admin/manager/cashier/kitchen) — `artifacts/api-server`
- **DB**: Replit PostgreSQL, Drizzle push (no migration files)
- **API client**: generated at `lib/api-client-react/src/generated/api.ts`

## Critical CSS fix
`artifacts/coffee-land/src/main.tsx` **must** have `import './index.css'` — missing import causes all styles to be blank.

## Auth
- JWT in `localStorage` as `coffee_land_token`; secret = `SESSION_SECRET` env var
- `requireAuth` middleware in `artifacts/api-server/src/lib/auth.ts`

## Generated hook naming — common mismatch
Dashboard hook is **`useGetDashboardSummary`** / **`getGetDashboardSummaryQueryKey`**, NOT `useGetDashboard`.
Always grep the generated file for the exact export name before writing imports.

## QR Customer Order Flow (public, no auth)
- Admin: Tables → hover card → "View QR Code" → Download SVG → print on table
- Customer: scan QR → `/menu/table/:tableId` (no login) → add items → Place Order
- Submits to `POST /api/orders/public` (no auth) — placed BEFORE the `requireAuth` POST route in `orders.ts`
- Order appears in KDS (10s poll), POS, Payments immediately
- `staffId: null`, `branchId` resolved from table record

## Mobile Responsiveness Pattern
- Layout: sidebar is `fixed lg:static`, hidden via `-translate-x-full lg:translate-x-0`
- Mobile top bar (`lg:hidden`) has hamburger (`AlignJustify`) toggling `sidebarOpen` state
- Sidebar closes automatically on route change via `useEffect([location])`
- Customer menu is mobile-first (max-w-lg, 390px optimized)

## Ethiopian Payment Verification
- CBE: PDF via `pdf-parse`; TeleBirr: HTML via `cheerio`
- Auto-approved if amount ≈ total AND receiver account matches; else `manual_review`

## Demo Credentials
admin/admin123 · manager1/pass123 · cashier1/pass123 · kitchen1/pass123

## Build
`build.mjs` emits `dist/index.mjs` + `dist/seed.mjs`. `pnpm seed` to re-seed DB.
