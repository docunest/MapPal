-- AlterTable
ALTER TABLE "mappal_agent_review" ADD COLUMN     "briefId" TEXT;

-- CreateTable
CREATE TABLE "mappal_rule" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_rule_version" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "config" JSONB,
    "hash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_rule_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_brief" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "useCase" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "layers" JSONB NOT NULL,
    "area" JSONB NOT NULL,
    "candidates" JSONB NOT NULL,
    "excluded" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "agent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "mappal_brief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_place_facts" (
    "osmRef" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_place_facts_pkey" PRIMARY KEY ("osmRef")
);

-- CreateIndex
CREATE UNIQUE INDEX "mappal_rule_slug_key" ON "mappal_rule"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_rule_version_ruleId_version_key" ON "mappal_rule_version"("ruleId", "version");

-- CreateIndex
CREATE INDEX "mappal_brief_runId_idx" ON "mappal_brief"("runId");

-- CreateIndex
CREATE INDEX "mappal_brief_useCase_createdAt_idx" ON "mappal_brief"("useCase", "createdAt");

-- AddForeignKey
ALTER TABLE "mappal_rule_version" ADD CONSTRAINT "mappal_rule_version_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "mappal_rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- docunest hard rules §5: RLS on, no policies (the server's role bypasses it).
ALTER TABLE "mappal_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mappal_rule_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mappal_brief" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mappal_place_facts" ENABLE ROW LEVEL SECURITY;
