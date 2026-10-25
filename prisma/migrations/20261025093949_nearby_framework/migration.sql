-- CreateTable
CREATE TABLE "mappal_source_usage" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mappal_source_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_source_setting" (
    "source" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_source_setting_pkey" PRIMARY KEY ("source")
);

-- CreateTable
CREATE TABLE "mappal_feedback" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "placeKey" TEXT NOT NULL DEFAULT '',
    "placeKind" TEXT,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_prompt_template" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mappal_prompt_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappal_prompt_version" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_prompt_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mappal_source_usage_source_sku_day_key" ON "mappal_source_usage"("source", "sku", "day");

-- CreateIndex
CREATE INDEX "mappal_feedback_targetType_targetKey_idx" ON "mappal_feedback"("targetType", "targetKey");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_feedback_userEmail_targetType_targetKey_placeKey_key" ON "mappal_feedback"("userEmail", "targetType", "targetKey", "placeKey");

-- CreateIndex
CREATE UNIQUE INDEX "mappal_prompt_template_slug_key" ON "mappal_prompt_template"("slug");

-- CreateIndex
CREATE INDEX "mappal_prompt_version_templateId_createdAt_idx" ON "mappal_prompt_version"("templateId", "createdAt");

-- AddForeignKey
ALTER TABLE "mappal_prompt_version" ADD CONSTRAINT "mappal_prompt_version_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "mappal_prompt_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
