-- Optional saved zoom/crop "view" on an image: { z, px, py } or null.
ALTER TABLE "ImageAsset" ADD COLUMN "view" JSONB;
