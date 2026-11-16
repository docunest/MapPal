-- Re-classify places after the first live run (2026-11-16): the 🏙 badge now needs a postcode
-- before the city, and towns are also matched from Nominatim's address. The owner's own
-- categories are kept.
UPDATE "mappal_dock_item" SET "categorySource" = NULL WHERE "categorySource" IS DISTINCT FROM 'owner';
