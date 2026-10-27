-- CreateTable
CREATE TABLE "mappal_dock_inbox_log" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "contentType" TEXT,
    "query" TEXT,
    "headers" JSONB NOT NULL,
    "body" TEXT,
    "status" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "itemId" TEXT,

    CONSTRAINT "mappal_dock_inbox_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mappal_dock_inbox_log_createdAt_idx" ON "mappal_dock_inbox_log"("createdAt");
