-- AlterTable: add nullable first — mappal_category already has rows
-- (waterfalls, factories) in production, so a NOT NULL column with no
-- default would fail. Backfill below, then enforce NOT NULL.
ALTER TABLE "mappal_category" ADD COLUMN     "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "elementTypes" JSONB,
ADD COLUMN     "exclude" JSONB,
ADD COLUMN     "extractFields" JSONB,
ADD COLUMN     "include" JSONB,
ADD COLUMN     "overpassFilters" JSONB,
ADD COLUMN     "searchPhrases" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- Backfill the known default categories with their real rules (matching
-- lib/categories/*.ts at the time this migration was written), so existing
-- scan jobs keep working exactly as before. Dollar-quoted so none of the
-- apostrophes in the English text need manual SQL escaping.
UPDATE "mappal_category" SET
  "elementTypes" = $json$["node","way"]$json$::jsonb,
  "overpassFilters" = $json$[{"key":"waterway","value":"waterfall"},{"key":"natural","value":"waterfall"}]$json$::jsonb,
  "include" = $json$["natural waterfalls, including seasonal ones","waterfalls on named rivers/streams, even if small"]$json$::jsonb,
  "exclude" = $json$["man-made fountains","irrigation/dam spillways with no natural fall"]$json$::jsonb,
  "searchPhrases" = $json$["cascada {place}","salto de agua {place}","ruta cascada {place}","waterfall near {place}"]$json$::jsonb,
  "extractFields" = $json$["season","hike length/difficulty","parking","access notes"]$json$::jsonb
WHERE "slug" = 'waterfalls';

UPDATE "mappal_category" SET
  "elementTypes" = $json$["node","way"]$json$::jsonb,
  "overpassFilters" = $json$[{"key":"man_made","value":"works"},{"key":"disused:man_made","value":"works"},{"key":"abandoned:man_made","value":"works"},{"key":"building","value":"industrial"}]$json$::jsonb,
  "include" = $json$["active factories/plants (for the 'what's that building' drive-by list)","disused/abandoned factories or works, especially ones with urbex posts about access"]$json$::jsonb,
  "exclude" = $json$["pure office buildings with no plant/works tag","retail/warehouse-only sites"]$json$::jsonb,
  "searchPhrases" = $json$["fábrica abandonada {place}","nave industrial abandonada {place} acceso","urbex {place} fábrica"]$json$::jsonb,
  "extractFields" = $json$["status (active/disused)","product/operator if known","accessibility note + source"]$json$::jsonb
WHERE "slug" = 'factories';

-- Any other/unexpected row (shouldn't exist pre-migration, but don't let
-- the NOT NULL step below fail if one somehow does): safe empty defaults.
UPDATE "mappal_category" SET
  "elementTypes" = COALESCE("elementTypes", '["node","way"]'::jsonb),
  "overpassFilters" = COALESCE("overpassFilters", '[]'::jsonb),
  "include" = COALESCE("include", '[]'::jsonb),
  "exclude" = COALESCE("exclude", '[]'::jsonb),
  "searchPhrases" = COALESCE("searchPhrases", '[]'::jsonb),
  "extractFields" = COALESCE("extractFields", '[]'::jsonb),
  "updatedAt" = COALESCE("updatedAt", "createdAt", now())
WHERE "elementTypes" IS NULL OR "overpassFilters" IS NULL OR "include" IS NULL
   OR "exclude" IS NULL OR "searchPhrases" IS NULL OR "extractFields" IS NULL OR "updatedAt" IS NULL;

ALTER TABLE "mappal_category"
  ALTER COLUMN "elementTypes" SET NOT NULL,
  ALTER COLUMN "overpassFilters" SET NOT NULL,
  ALTER COLUMN "include" SET NOT NULL,
  ALTER COLUMN "exclude" SET NOT NULL,
  ALTER COLUMN "searchPhrases" SET NOT NULL,
  ALTER COLUMN "extractFields" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;
