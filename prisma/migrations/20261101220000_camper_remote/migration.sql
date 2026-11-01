-- CreateTable
CREATE TABLE "mappal_camper_state" (
    "id" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_camper_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_camper_command" (
    "id" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "sentBy" TEXT,
    "takenAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_camper_command_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mappal_camper_command_takenAt_createdAt_idx" ON "mappal_camper_command"("takenAt", "createdAt");
