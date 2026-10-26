-- CreateTable
CREATE TABLE "mappal_dock_item" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "resolvedUrl" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "locatedBy" TEXT NOT NULL,
    "address" TEXT,
    "note" TEXT,
    "sentBy" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "seenAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_dock_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mappal_dock_item_createdAt_idx" ON "mappal_dock_item"("createdAt");

-- CreateIndex
CREATE INDEX "mappal_dock_item_updatedAt_idx" ON "mappal_dock_item"("updatedAt");
