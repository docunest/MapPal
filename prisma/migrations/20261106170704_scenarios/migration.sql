-- CreateEnum
CREATE TYPE "mappal_stop_status" AS ENUM ('FUTURE', 'CURRENT', 'PAST');

-- CreateTable
CREATE TABLE "mappal_stop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "status" "mappal_stop_status" NOT NULL DEFAULT 'FUTURE',
    "country" TEXT,
    "area" TEXT,
    "arriveOn" TIMESTAMP(3),
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "mappal_stop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_scenario" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT NOT NULL,
    "activeVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "mappal_scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_scenario_version" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_scenario_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_scenario_plan" (
    "id" TEXT NOT NULL,
    "scenarioVersionId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "by" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_scenario_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_scenario_result" (
    "id" TEXT NOT NULL,
    "scenarioVersionId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "notes" JSONB NOT NULL,
    "aiTokensIn" INTEGER NOT NULL DEFAULT 0,
    "aiTokensOut" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_scenario_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_poi" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "osmRef" TEXT,
    "googlePlaceId" TEXT,
    "brand" TEXT,
    "country" TEXT,
    "data" JSONB NOT NULL,
    "checks" JSONB NOT NULL DEFAULT '{}',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_poi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mappal_stop_status_idx" ON "mappal_stop"("status");

-- CreateIndex
CREATE INDEX "mappal_stop_updatedAt_idx" ON "mappal_stop"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_scenario_slug_key" ON "mappal_scenario"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_scenario_version_scenarioId_version_key" ON "mappal_scenario_version"("scenarioId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_scenario_plan_scenarioVersionId_area_key" ON "mappal_scenario_plan"("scenarioVersionId", "area");

-- CreateIndex
CREATE INDEX "mappal_scenario_result_stopId_idx" ON "mappal_scenario_result"("stopId");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_scenario_result_scenarioVersionId_stopId_key" ON "mappal_scenario_result"("scenarioVersionId", "stopId");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_poi_osmRef_key" ON "mappal_poi"("osmRef");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_poi_googlePlaceId_key" ON "mappal_poi"("googlePlaceId");

-- CreateIndex
CREATE INDEX "mappal_poi_lat_lng_idx" ON "mappal_poi"("lat", "lng");

-- AddForeignKey
ALTER TABLE "mappal_scenario_version" ADD CONSTRAINT "mappal_scenario_version_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "mappal_scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mappal_scenario_plan" ADD CONSTRAINT "mappal_scenario_plan_scenarioVersionId_fkey" FOREIGN KEY ("scenarioVersionId") REFERENCES "mappal_scenario_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mappal_scenario_result" ADD CONSTRAINT "mappal_scenario_result_scenarioVersionId_fkey" FOREIGN KEY ("scenarioVersionId") REFERENCES "mappal_scenario_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mappal_scenario_result" ADD CONSTRAINT "mappal_scenario_result_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "mappal_stop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
