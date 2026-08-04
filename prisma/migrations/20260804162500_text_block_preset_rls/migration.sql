-- Supabase linter: public tables exposed to PostgREST must have RLS enabled.
-- Match project RLS posture (Prisma connects as owner and bypasses RLS).
ALTER TABLE "TextBlockPreset" ENABLE ROW LEVEL SECURITY;
