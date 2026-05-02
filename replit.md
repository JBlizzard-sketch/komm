# Komm — Bulk Messaging Platform

## Overview
Komm is a production-grade bulk messaging platform for Kenyan SACCOs, churches, and member-based organisations. It supports SMS (Africa's Talking), WhatsApp Cloud API, and Email channels.

## Architecture

### Stack
- **Frontend**: React + Vite, wouter (routing), TanStack Query, shadcn/ui, recharts, react-hook-form + zod
- **Backend**: Express 5, Drizzle ORM, PostgreSQL
- **Code generation**: Orval (OpenAPI → React Query hooks + Zod schemas)
- **Monorepo**: pnpm workspaces

### Artifacts
- `artifacts/komm` — React/Vite frontend at path `/` (port 22559)
- `artifacts/api-server` — Express API at path `/api` (port 8080)

### Libraries
- `lib/db` — Drizzle ORM schema + DB client (`@workspace/db`)
- `lib/api-spec` — OpenAPI spec (`lib/api-spec/openapi.yaml`)
- `lib/api-zod` — Generated Zod schemas (`@workspace/api-zod`)
- `lib/api-client-react` — Generated React Query hooks (`@workspace/api-client-react`)

## Database Schema
Tables in PostgreSQL:
- `contacts` — members with phone, email, channel preference, custom fields
- `groups` — contact groups (e.g. Nairobi Branch, Loan Recipients)
- `contact_groups` — many-to-many join
- `templates` — reusable message templates with `{{variable}}` placeholders
- `campaigns` — bulk send jobs with status (draft/scheduled/sending/sent/failed)
- `campaign_messages` — per-recipient delivery records
- `inbox_messages` — inbound replies from members

## Frontend Pages
- `/dashboard` — stats, line chart (message volume), pie chart (channel), recent activity
- `/campaigns` — campaign list with status/channel filters, send/delete actions
- `/campaigns/new` — campaign composer (channel, template, groups, schedule)
- `/campaigns/:id` — campaign detail + delivery log per recipient
- `/contacts` — contact list with search + group filter, add/delete
- `/groups` — group cards with member count, create/edit/delete
- `/templates` — template cards with variable highlighting, SACCO/church categories
- `/inbox` — inbound replies with read/unread filter, mark-read action

## API Routes
All prefixed with `/api`:
- `GET/POST /contacts`, `GET/PUT/DELETE /contacts/:id`, `POST /contacts/import`
- `GET/POST /groups`, `PUT/DELETE /groups/:id`, `POST /groups/:id/contacts`
- `GET/POST /templates`, `GET/PUT/DELETE /templates/:id`
- `GET/POST /campaigns`, `GET/PUT/DELETE /campaigns/:id`, `POST /campaigns/:id/send`
- `GET /campaigns/:id/messages`
- `GET /inbox`, `POST /inbox/:id/read`
- `GET /dashboard/stats`, `GET /dashboard/activity`, `GET /dashboard/delivery-trend`, `GET /dashboard/channel-breakdown`

## Design
- **Theme**: Forest green primary (`153 58% 28%`), warm off-white background, deep forest sidebar
- **Font**: Inter (Google Fonts)
- **Kenya/fintech aesthetic** with amber accent for highlights

## Key Notes
- Campaign send is **simulated** (no real Africa's Talking / WhatsApp Cloud API integration yet). Creates delivery records with mixed statuses.
- `lib/api-zod/src/index.ts` must only contain `export * from "./generated/api";` — Orval overwrites it on each codegen run
- After running `orval`, fix `lib/api-zod/src/index.ts` and run typecheck
- `from` is a reserved SQL keyword — always quote it as `"from"` in PostgreSQL queries
- API base path is `/api`, all routes must handle their full path (no proxy rewriting)

## Running
Both workflows must be started:
1. `artifacts/api-server: API Server` — builds and starts Express server
2. `artifacts/komm: web` — starts Vite dev server
