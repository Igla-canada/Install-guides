<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Igla Installation Guilds — invariants for anyone working on this code

"Guild" = an installation guide for one vehicle + Igla product combination.
These rules come from the system plan and must never erode:

1. **Strict identity, free body.** A guild's identity (make/model/generation/
   trim/product/region) is taxonomy FKs only — never free text. The content
   body (sections/blocks, JSONB) is unlimited. The Igla app's auto-pull
   depends on the identity layer staying strict.

2. **One canonical document, two editing surfaces.** The preview editor and
   the chat editor both dispatch operations against the SAME guild document
   in the DB. Chat must NEVER hold its own copy of the document state —
   that's how sync bugs are born. See src/lib/guild-doc.ts (operations layer).

3. **Watermark at serve time, per view.** Never pre-generate or cache a shared
   PDF/page for installers. Every served view is stamped with grantee identity
   + timestamp + grant id. Caching a shared artifact silently destroys leak
   traceability.

4. **Installer paths are view-only.** No download buttons, no raw PDF
   responses to grants/installer accounts. PDF export is admin/tech-only.
   Images are served via short-lived signed S3 URLs only.

5. **Every installer-facing access is audited** through src/lib/audit.ts
   logEvent(), which also runs the leak-detection alert rules. New
   installer-facing routes must call it.

6. **Tracking is forensics, not prevention.** Don't oversell it in UI copy.

## Dev environment

- `docker compose up -d` → Postgres (5432) + MinIO (9000/9001, console login
  igla-minio / igla_dev_password).
- `npm run db:migrate` then `npm run db:seed` (admin: admin@igla.local /
  igla-admin-2026 unless SEED_ADMIN_* env set).
- `npm run dev` → http://localhost:3000
- SMS one-time codes print to the server console when SMS_PROVIDER=console.
- `npm run token:service` → mint a bearer token for the Igla resolve API.
