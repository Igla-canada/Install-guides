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
| Author a guide | Dashboard → New guild (identity is dropdown-only) → editor: page surface + chat surface, autosave, publish = version snapshot, rollback in History |
| Photos & wiring annotations | Any image block → camera/upload → “Annotate wires” (points/arrows/boxes, labels, editable forever). Works offline: queued in IndexedDB, syncs when back online |
| Give an installer access | Access links → label + mobile + expiry (+ max views) → send the one-time URL. Installer verifies via SMS code, sees a watermarked view-only page. Revoke any time |
| Installer accounts | Users → role INSTALLER → grant guilds; they log in at `/` and see `/my-guilds` |
| Watch for leaks | Alerts (burst views, cross-make, probing, new device) + Audit log; one-click revoke from an alert |
| Igla app auto-pull | `GET /api/guild/resolve?vin=…&make=…&model=…&year=…&serial=…` with `Authorization: Bearer <token>` (`npm run token:service`). VIN first, alias-normalized free text fallback, serial → product |
| Internal PDF/archival | Editor → Export (`/print/<id>`), admin/tech only — installer paths never expose downloads |

## Production notes

- Set real values in `.env`: `DATABASE_URL`, `S3_*` (real S3, `ca-central-1`),
  `SESSION_SECRET`, `SMS_PROVIDER=twilio` + `TWILIO_*`, `APP_BASE_URL`.
- SMS in dev prints codes to the server console (`SMS_PROVIDER=console`).
- Replace the internal inventory table with the Igla portal inventory API in
  `src/lib/inventory.ts` when it exists (open item #2 in the plan).

## Open items from the plan (owner input)

1. Trim-specific guilds — resolve already returns candidates when several match.
3. Full Compass/IGLA product catalog — manage under Taxonomy.
4. Hosting region — defaulted to Canada (`ca-central-1`).
7. Scale estimates — alert thresholds tunable in `src/lib/audit.ts`.
