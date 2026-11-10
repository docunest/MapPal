-- CreateTable
CREATE TABLE "mappal_dock_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "device" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "tag" TEXT NOT NULL,
    "msg" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_dock_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mappal_dock_log_device_seq_key" ON "mappal_dock_log"("device", "seq");

-- CreateIndex
CREATE INDEX "mappal_dock_log_at_idx" ON "mappal_dock_log"("at");
