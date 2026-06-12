# Igla Guilds

Installation-guide system for Igla alarm installs. A **guild** = one guide for
one vehicle + Igla product combination. Staff author rich section-based guides
(preview editor + chat editor over one canonical document); installers get
time-limited, watermarked, view-only access; every access is audited with
leak-detection alerts; the Igla portal auto-pulls the right guide via the
resolve API.

Built from the owner's system plan — see [AGENTS.md](AGENTS.md) for the
invariants that must not erode (strict identity layer, single canonical
document, serve-time watermarks, view-only installer paths, audit everywhere).

## Quickstart (dev)

```powershell
docker compose up -d        # Postgres (host port 5442) + MinIO (9000/9001)
npm install
npm run db:migrate          # prisma migrate dev
npm run db:seed             # admin login + Canada + IGLA/Compass + BMW sample
npm run dev                 # http://localhost:3000
```

Default admin: `admin@igla.local` / `igla-admin-2026` (override with
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` before seeding).

> Host port **5442** for Postgres because this machine runs a native
> PostgreSQL on 5432/5433. MinIO console: http://localhost:9001
> (igla-minio / igla_dev_password).

## The flows

| Flow | Where |
|---|---|
| Author a guide | Dashboard → New guild: type make/model + years (auto-created if new, no taxonomy pre-setup) → editor: page surface + chat surface, autosave, publish = version snapshot, rollback in History |
| Photos & wiring annotations | Any image block → camera/upload → “Annotate wires” (points/arrows/boxes, labels, editable forever). Works offline: queued in IndexedDB, syncs when back online |
| Give an installer access | Access links → label + mobile + expiry (+ max views) → send the one-time URL. Installer verifies via SMS code, sees a watermarked view-only page. Revoke any time |
| Installer accounts | Users → role INSTALLER → grant guilds; they log in at `/` and see `/my-guilds` |
| Watch for leaks | Alerts (burst views, cross-make, probing, new device) + Audit log; one-click revoke from an alert |
| Igla app auto-pull | `GET /api/taxonomy?published=1` feeds the portal's dropdowns (only cars with published guides); `GET /api/guild/resolve?makeId=…&modelId=…&year=…&serial=…` then matches exactly. VIN and alias-normalized free text remain as fallbacks. Both use `Authorization: Bearer <token>` (`npm run token:service`) |
| See it as the installer will | Editor → 👁 Preview tab — the exact dark installer rendering (drafts included) |
| Internal PDF/archival | Editor → Export (`/print/<id>`), admin/tech only — installer paths never expose downloads |
| Migrate from Notion | `npm run import:notion -- <parent-page-id>` with `NOTION_TOKEN` set (share the guides page with a Notion integration first). Pages → draft guilds: sections, photos, tables, callouts, properties, file attachments. Review + publish each |

## Setup: Supabase (database) + AWS S3 `igla-guides` (storage)

`.env` is pre-structured — fill the four `<PASTE-…>` values, then:

```powershell
npm run db:deploy      # creates all tables on Supabase
npm run db:seed        # admin login + Canada + IGLA/Compass products
npx tsx --env-file=.env scripts/probe-s3.ts   # verifies S3 upload/download
npm run dev
```

### Supabase (2 values)

Dashboard → **Connect** → connection strings:
- `DATABASE_URL` = the **Transaction pooler** string (port 6543) with
  `?pgbouncer=true` appended
- `DIRECT_URL` = the **Session pooler / direct** string (port 5432)

Replace `[YOUR-PASSWORD]` inside both with the database password.

### AWS S3 (2 values + 2 one-time bucket configs)

Everything the system stores — install photos, annotated images, firmware
files, covers — goes into the **`igla-guides`** bucket (us-east-1), under
`images/…` and `notion-import/…` prefixes. The other igla-* buckets are
untouched.

- `S3_ACCESS_KEY` / `S3_SECRET_KEY` = an IAM access key whose user has this
  policy (only this bucket):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::igla-guides/*"
    },
    { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::igla-guides" }
  ]
}
```

- **Bucket CORS** (S3 console → igla-guides → Permissions → CORS) — required
  for browser photo uploads via presigned URLs:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["http://localhost:3000", "https://YOUR-VERCEL-DOMAIN"],
    "ExposeHeaders": []
  }
]
```

- Keep **Block Public Access ON** — the app only ever serves short-lived
  signed URLs; nothing is public.

### Vercel (when ready to host)

Import the repo, paste the same `.env` values into Project → Environment
Variables, set `APP_BASE_URL=https://<your-domain>`, add the domain to the
bucket CORS, and (for real SMS) set `SMS_PROVIDER=twilio` + `TWILIO_*`.

Other notes: SMS codes print to the server console while
`SMS_PROVIDER=console`. The Igla app's bearer token for /api/guild/resolve
and /api/taxonomy is `IGLA_SERVICE_TOKEN` in `.env` (or mint DB-managed,
revocable ones with `npm run token:service`). Replace the internal inventory
table with the portal inventory API in `src/lib/inventory.ts` when available.

## Open items from the plan (owner input)

1. Trim-specific guilds — resolve already returns candidates when several match.
3. Full Compass/IGLA product catalog — manage under Taxonomy.
4. Hosting region — defaulted to Canada (`ca-central-1`).
7. Scale estimates — alert thresholds tunable in `src/lib/audit.ts`.
