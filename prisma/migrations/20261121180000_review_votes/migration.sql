-- CreateTable
CREATE TABLE "mappal_voter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_voter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_vote" (
    "id" TEXT NOT NULL,
    "voter" TEXT NOT NULL,
    "placeKey" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mappal_voter_name_key" ON "mappal_voter"("name");

-- CreateIndex
CREATE INDEX "mappal_vote_placeKey_idx" ON "mappal_vote"("placeKey");

-- CreateIndex
CREATE INDEX "mappal_vote_updatedAt_idx" ON "mappal_vote"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_vote_voter_placeKey_key" ON "mappal_vote"("voter", "placeKey");


-- docunest hard rules §5: RLS on, no policies (the server's role bypasses it).
ALTER TABLE "mappal_voter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mappal_vote" ENABLE ROW LEVEL SECURITY;
