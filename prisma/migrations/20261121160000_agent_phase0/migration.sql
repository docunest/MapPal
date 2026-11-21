-- CreateTable
CREATE TABLE "mappal_agent_run" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "caps" JSONB NOT NULL,
    "counters" JSONB NOT NULL,
    "cappedBy" TEXT,
    "usageBeforePct" DOUBLE PRECISION,
    "usageAfterPct" DOUBLE PRECISION,
    "model" TEXT,
    "report" TEXT,
    "approvedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_agent_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_agent_review" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "candidate" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "osmRef" TEXT NOT NULL,
    "googlePlaceId" TEXT,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "verdict" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "relevant" BOOLEAN NOT NULL,
    "keep" BOOLEAN NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "agent" TEXT NOT NULL,
    "ownerRating" TEXT,
    "ownerRatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_agent_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_agent_tile" (
    "id" TEXT NOT NULL,
    "geohash" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "checked" INTEGER NOT NULL,
    "kept" INTEGER NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_agent_tile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_travel_fix" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "label" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_travel_fix_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mappal_agent_run_createdAt_idx" ON "mappal_agent_run"("createdAt");

-- CreateIndex
CREATE INDEX "mappal_agent_review_osmRef_createdAt_idx" ON "mappal_agent_review"("osmRef", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_agent_review_runId_candidate_key" ON "mappal_agent_review"("runId", "candidate");

-- CreateIndex
CREATE INDEX "mappal_agent_tile_geohash_idx" ON "mappal_agent_tile"("geohash");

-- CreateIndex
CREATE INDEX "mappal_travel_fix_at_idx" ON "mappal_travel_fix"("at");

-- AddForeignKey
ALTER TABLE "mappal_agent_review" ADD CONSTRAINT "mappal_agent_review_runId_fkey" FOREIGN KEY ("runId") REFERENCES "mappal_agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- docunest hard rules §5: RLS on, no policies (the server's role bypasses it).
ALTER TABLE "mappal_agent_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mappal_agent_review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mappal_agent_tile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mappal_travel_fix" ENABLE ROW LEVEL SECURITY;
