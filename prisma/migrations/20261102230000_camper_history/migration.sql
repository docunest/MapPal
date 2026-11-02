-- CreateTable
CREATE TABLE "mappal_camper_sample" (
    "ts" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "mappal_camper_sample_pkey" PRIMARY KEY ("ts")
);

-- CreateTable
CREATE TABLE "mappal_camper_event" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "device" TEXT NOT NULL,
    "what" TEXT NOT NULL,
    "value" TEXT,
    "by" TEXT,

    CONSTRAINT "mappal_camper_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mappal_camper_event_ts_idx" ON "mappal_camper_event"("ts");
