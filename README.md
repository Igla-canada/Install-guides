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
| Internal PDF/archival | Editor → Export (`/print/<id>`), admin/tech only — installer paths never expose downloads |

## Deploying to Vercel + Supabase

The app is built for this target — serverless-safe (`after()` keeps alert
evaluation alive past the response) and storage-agnostic (any S3-compatible
endpoint).

1. **Supabase project** → copy from *Settings → Database*:
   - `DATABASE_URL` = the **Transaction pooler** string (port 6543) with
     `?pgbouncer=true` appended
   - `DIRECT_URL` = the **direct/Session** string (port 5432) — used only by
     `prisma migrate deploy`
2. **Supabase Storage** → create a **private** bucket (e.g. `igla-guilds`),
   then *Settings → Storage → S3 access keys*:
   - `S3_ENDPOINT` = `https://<project-ref>.storage.supabase.co/storage/v1/s3`
   - `S3_REGION` = your project region, `S3_FORCE_PATH_STYLE=true`
   - `S3_ACCESS_KEY` / `S3_SECRET_KEY` = the generated S3 keys
   - `S3_BUCKET` = the bucket name
   (Plain Amazon S3 in `ca-central-1` works identically if preferred for data
   residency — only these env vars change.)
3. **Vercel** → import the repo, set all `.env` values (`SESSION_SECRET` to a
   fresh 32+ char secret, `SMS_PROVIDER=twilio` + `TWILIO_*`,
   `APP_BASE_URL=https://<your-domain>`, optionally `IGLA_SERVICE_TOKEN`).
4. **Migrate + seed** once against the direct URL:
   `npx prisma migrate deploy` then `npm run db:seed`.

Notes: Supabase Postgres region selection covers the Canada data-residency
requirement (`ca-central-1`). SMS in dev prints codes to the server console
(`SMS_PROVIDER=console`). Replace the internal inventory table with the Igla
portal inventory API in `src/lib/inventory.ts` when it exists (open item #2).

## Open items from the plan (owner input)

1. Trim-specific guilds — resolve already returns candidates when several match.
3. Full Compass/IGLA product catalog — manage under Taxonomy.
4. Hosting region — defaulted to Canada (`ca-central-1`).
7. Scale estimates — alert thresholds tunable in `src/lib/audit.ts`.
