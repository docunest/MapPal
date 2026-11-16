-- Place categories for sent places (docs/DOCK.md "Place categories").
ALTER TABLE "mappal_dock_item" ADD COLUMN "category" TEXT;
ALTER TABLE "mappal_dock_item" ADD COLUMN "categorySource" TEXT;
ALTER TABLE "mappal_dock_item" ADD COLUMN "bigCity" BOOLEAN NOT NULL DEFAULT false;
