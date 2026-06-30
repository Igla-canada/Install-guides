-- Reusable "library" files (the Files Manager): a file uploaded once and picked
-- into many guides. libraryName non-null = a library file with that display
-- name; size is its byte length (so the manager can show it).
ALTER TABLE "ImageAsset" ADD COLUMN "size" INTEGER;
ALTER TABLE "ImageAsset" ADD COLUMN "libraryName" TEXT;
CREATE INDEX "ImageAsset_libraryName_idx" ON "ImageAsset" ("libraryName");
