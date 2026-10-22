-- CreateEnum
CREATE TYPE "mappal_job_status" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'ERROR');

-- CreateEnum
CREATE TYPE "mappal_place_visit_status" AS ENUM ('UNKNOWN', 'MUST_VISIT', 'VISITED', 'SKIPPED');

-- CreateTable
CREATE TABLE "mappal_user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "boundary" JSONB NOT NULL,
    "h3Resolution" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_tile" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "h3Index" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "boundary" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_tile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_scan_job" (
    "id" TEXT NOT NULL,
    "tileId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "mappal_job_status" NOT NULL DEFAULT 'PENDING',
    "sourcesTried" JSONB,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_scan_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_place" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "tileId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "season" TEXT,
    "accessNotes" TEXT,
    "openingHours" TEXT,
    "popularityScore" DOUBLE PRECISION,
    "qualityScore" DOUBLE PRECISION,
    "isHiddenGem" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION,
    "lastVerifiedAt" TIMESTAMP(3),
    "visitStatus" "mappal_place_visit_status" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_place_source" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "raw" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_place_source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mappal_user_email_key" ON "mappal_user"("email");

-- CreateIndex
CREATE INDEX "mappal_region_name_idx" ON "mappal_region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_tile_h3Index_key" ON "mappal_tile"("h3Index");

-- CreateIndex
CREATE INDEX "mappal_tile_regionId_idx" ON "mappal_tile"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_category_slug_key" ON "mappal_category"("slug");

-- CreateIndex
CREATE INDEX "mappal_scan_job_status_idx" ON "mappal_scan_job"("status");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_scan_job_tileId_categoryId_key" ON "mappal_scan_job"("tileId", "categoryId");

-- CreateIndex
CREATE INDEX "mappal_place_categoryId_idx" ON "mappal_place"("categoryId");

-- CreateIndex
CREATE INDEX "mappal_place_lat_lng_idx" ON "mappal_place"("lat", "lng");

-- AddForeignKey
ALTER TABLE "mappal_tile" ADD CONSTRAINT "mappal_tile_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "mappal_region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mappal_scan_job" ADD CONSTRAINT "mappal_scan_job_tileId_fkey" FOREIGN KEY ("tileId") REFERENCES "mappal_tile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mappal_scan_job" ADD CONSTRAINT "mappal_scan_job_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "mappal_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mappal_place" ADD CONSTRAINT "mappal_place_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "mappal_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mappal_place" ADD CONSTRAINT "mappal_place_tileId_fkey" FOREIGN KEY ("tileId") REFERENCES "mappal_tile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mappal_place_source" ADD CONSTRAINT "mappal_place_source_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "mappal_place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
