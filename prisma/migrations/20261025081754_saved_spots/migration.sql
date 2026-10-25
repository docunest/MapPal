-- CreateTable
CREATE TABLE "mappal_saved_spot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "wikidata" TEXT,
    "imageUrl" TEXT,
    "note" TEXT,
    "status" "mappal_place_visit_status" NOT NULL DEFAULT 'MUST_VISIT',
    "savedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_saved_spot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mappal_saved_spot_sourceKey_key" ON "mappal_saved_spot"("sourceKey");

-- CreateIndex
CREATE INDEX "mappal_saved_spot_status_idx" ON "mappal_saved_spot"("status");
