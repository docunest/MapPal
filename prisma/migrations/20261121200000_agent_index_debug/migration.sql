-- AlterTable
ALTER TABLE "mappal_agent_run" ADD COLUMN     "claudeCacheReadTokens" INTEGER,
ADD COLUMN     "claudeCacheWriteTokens" INTEGER,
ADD COLUMN     "claudeInputTokens" INTEGER,
ADD COLUMN     "claudeOutputTokens" INTEGER;

-- CreateTable
CREATE TABLE "mappal_agent_event" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "mappal_agent_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_osm_cell" (
    "geohash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "runId" TEXT,

    CONSTRAINT "mappal_osm_cell_pkey" PRIMARY KEY ("geohash")
);

-- CreateTable
CREATE TABLE "mappal_osm_place" (
    "osmRef" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "name" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "tags" JSONB NOT NULL,
    "cell" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_osm_place_pkey" PRIMARY KEY ("osmRef")
);

-- CreateTable
CREATE TABLE "mappal_agent_token" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "mappal_agent_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mappal_agent_event_runId_at_idx" ON "mappal_agent_event"("runId", "at");

-- CreateIndex
CREATE INDEX "mappal_agent_event_at_idx" ON "mappal_agent_event"("at");

-- CreateIndex
CREATE INDEX "mappal_osm_place_lat_lng_idx" ON "mappal_osm_place"("lat", "lng");

-- CreateIndex
CREATE INDEX "mappal_osm_place_cell_idx" ON "mappal_osm_place"("cell");

-- CreateIndex
CREATE INDEX "mappal_osm_place_layer_lat_lng_idx" ON "mappal_osm_place"("layer", "lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_agent_token_hash_key" ON "mappal_agent_token"("hash");


-- docunest hard rules §5: RLS on, no policies (the server's role bypasses it).
ALTER TABLE "mappal_agent_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mappal_osm_cell" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mappal_osm_place" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mappal_agent_token" ENABLE ROW LEVEL SECURITY;
