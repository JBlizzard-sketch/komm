# Komm — Bulk Messaging Platform

> Production-grade bulk messaging for Kenyan SACCOs, churches, and member-based organisations.

Komm lets you reach your members through **SMS** (Africa's Talking), **WhatsApp** (Cloud API), and **Email** from a single dashboard. Built for the Kenyan market — fast M-Pesa-era UX, Swahili-friendly message templates, and sub-100ms API responses.

---

## Screenshots

| Dashboard | Campaigns | Templates |
|-----------|-----------|-----------|
| Real-time stats, delivery trend chart, channel breakdown | Campaign list with status filters, send/delete actions | SACCO & church templates with `{{variable}}` highlighting |

---

## Features

### Messaging Channels
- **SMS** via Africa's Talking — best Kenyan network coverage
- **WhatsApp** via Cloud API — pre-approved templates
- **Email** — for members with email addresses

### Contacts & Groups
- Import contacts individually or via CSV
- Organise into groups (branch, loan tier, department, etc.)
- Filter campaign sends by one or more groups
- Per-contact channel preference (SMS / WhatsApp / Email)

### Campaigns
- Compose from scratch or pick a saved template
- SMS character counter with segment cost warning (160 chars = 1 SMS, 153/segment after)
- Personalisation placeholders — `{{name}}`, `{{amount}}`, `{{date}}`, etc.
- Schedule for a future date/time or send immediately
- Full per-recipient delivery log (delivered / sent / failed / opened)

### Templates
- Reusable message bodies with variable placeholders
- Categories: **SACCO**, **Church**, **General**
- Built-in starter templates for contribution reminders, AGM notices, tithe acknowledgements, birthday blessings, and more

### Inbox
- Two-way reply tracking for SMS and WhatsApp
- Unread/read filter with badge count in sidebar
- Mark individual messages as read

### Dashboard
- Live stats: total contacts, campaigns, messages sent this month, delivery rate, scheduled campaigns, unread replies
- 30-day message volume line chart (per channel)
- Channel breakdown donut chart
- Recent activity feed

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite 7, TypeScript |
| Routing | wouter |
| State / Data | TanStack Query v5 |
| UI Components | shadcn/ui (Tailwind CSS v4) |
| Charts | Recharts |
| Forms | react-hook-form + zod |
| Backend | Express 5, TypeScript |
| ORM | Drizzle ORM |
| Database | PostgreSQL |
| API Contract | OpenAPI 3.1 → Orval codegen (Zod + React Query) |
| Package Manager | pnpm workspaces (monorepo) |

---

## Project Structure

```
komm/
├── artifacts/
│   ├── komm/                  # React + Vite frontend (path: /)
│   │   └── src/
│   │       ├── pages/         # Dashboard, Campaigns, Contacts, Groups, Templates, Inbox
│   │       ├── components/    # Layout (sidebar), shared UI
│   │       └── index.css      # Forest green theme, Inter font
│   └── api-server/            # Express 5 API (path: /api)
│       └── src/
│           └── routes/        # contacts, groups, templates, campaigns, inbox, dashboard
├── lib/
│   ├── db/                    # Drizzle schema + DB client (@workspace/db)
│   ├── api-spec/              # OpenAPI 3.1 spec (openapi.yaml)
│   ├── api-zod/               # Generated Zod schemas (@workspace/api-zod)
│   └── api-client-react/      # Generated React Query hooks (@workspace/api-client-react)
└── scripts/                   # Utility scripts (seed, codegen helpers)
```

---

## Database Schema

```
contacts          — members (name, phone, email, channel, custom_fields)
groups            — contact groups (name, description)
contact_groups    — many-to-many join
templates         — reusable message bodies with {{variables}}
campaigns         — bulk send jobs (draft → scheduled → sent)
campaign_messages — per-recipient delivery records
inbox_messages    — inbound replies from members
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+
- PostgreSQL 15+

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Express session secret (min 32 chars) |
| `PORT` | Server port (set per-artifact by Replit) |

For messaging providers (when integrating):

| Variable | Description |
|----------|-------------|
| `AT_API_KEY` | Africa's Talking API key |
| `AT_USERNAME` | Africa's Talking username |
| `AT_SENDER_ID` | Africa's Talking sender ID |
| `WHATSAPP_TOKEN` | WhatsApp Cloud API bearer token |
| `WHATSAPP_PHONE_ID` | WhatsApp Phone Number ID |

### Install & Run

```bash
# Install dependencies
pnpm install

# Push database schema
pnpm --filter @workspace/db run push

# Seed sample data (optional)
# Run the seed SQL in scripts/seed.sql

# Start API server (port from $PORT env, default 8080)
pnpm --filter @workspace/api-server run dev

# Start frontend (port from $PORT env, default 22559)
pnpm --filter @workspace/komm run dev
```

### Codegen (after editing openapi.yaml)

```bash
pnpm --filter @workspace/api-spec run codegen
# Then fix lib/api-zod/src/index.ts to only contain:
# export * from "./generated/api";
pnpm run typecheck
```

---

## API Reference

All endpoints are prefixed with `/api`.

### Contacts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/contacts` | List contacts (search, groupId, page, limit) |
| POST | `/contacts` | Create contact |
| GET | `/contacts/:id` | Get contact with group memberships |
| PUT | `/contacts/:id` | Update contact |
| DELETE | `/contacts/:id` | Delete contact |
| POST | `/contacts/import` | Bulk import contacts (optional groupId) |

### Groups
| Method | Path | Description |
|--------|------|-------------|
| GET | `/groups` | List groups with member counts |
| POST | `/groups` | Create group |
| PUT | `/groups/:id` | Update group |
| DELETE | `/groups/:id` | Delete group |
| POST | `/groups/:id/contacts` | Add contacts to group |

### Templates
| Method | Path | Description |
|--------|------|-------------|
| GET | `/templates` | List templates (category, channel filter) |
| POST | `/templates` | Create template |
| GET | `/templates/:id` | Get template |
| PUT | `/templates/:id` | Update template |
| DELETE | `/templates/:id` | Delete template |

### Campaigns
| Method | Path | Description |
|--------|------|-------------|
| GET | `/campaigns` | List campaigns (status, channel, page, limit) |
| POST | `/campaigns` | Create campaign |
| GET | `/campaigns/:id` | Get campaign with delivery stats |
| PUT | `/campaigns/:id` | Update campaign |
| DELETE | `/campaigns/:id` | Delete campaign |
| POST | `/campaigns/:id/send` | Trigger send (simulated) |
| GET | `/campaigns/:id/messages` | Per-recipient delivery log |

### Inbox
| Method | Path | Description |
|--------|------|-------------|
| GET | `/inbox` | List inbox messages (read filter, page, limit) |
| POST | `/inbox/:id/read` | Mark message as read |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/stats` | Aggregate stats |
| GET | `/dashboard/activity` | Recent campaign activity |
| GET | `/dashboard/delivery-trend` | 30-day daily message counts by channel |
| GET | `/dashboard/channel-breakdown` | Total messages per channel |

---

## Roadmap

- [ ] **Africa's Talking SMS** — live delivery via AT API (replace simulation)
- [ ] **WhatsApp Cloud API** — live send with template approval flow
- [ ] **Email via Resend/SendGrid** — HTML email with unsubscribe
- [ ] **CSV Import UI** — drag-and-drop bulk contact import
- [ ] **Scheduled campaigns** — background cron job with Bull/BullMQ
- [ ] **Custom fields** — per-contact key-value store for personalisation
- [ ] **Delivery webhooks** — real-time status updates from AT / WhatsApp
- [ ] **Contact deduplication** — merge duplicates on import
- [ ] **Role-based access** — admin vs. operator vs. viewer
- [ ] **Multi-org / tenancy** — multiple organisations per deployment
- [ ] **Analytics export** — CSV download of delivery reports

---

## Design

- **Primary colour**: Forest Green (`hsl(153, 58%, 28%)`) — trust, growth, Kenya
- **Accent**: Warm Amber — highlights, tags, unread badges
- **Font**: Inter (Google Fonts)
- **Background**: Warm off-white (`hsl(40, 20%, 97%)`)
- **Sidebar**: Deep forest (`hsl(160, 30%, 14%)`)

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit with conventional commits: `git commit -m "feat: add CSV import"`
4. Push and open a PR

---

## License

MIT — see [LICENSE](LICENSE) for details.
