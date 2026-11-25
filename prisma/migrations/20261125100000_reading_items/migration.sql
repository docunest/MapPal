-- Word management (domains/reading/DESIGN.md): items (words, letters, pairs, triples), their photos,
-- voice clips and files. RLS on, no policies (hard rule).
CREATE TABLE "reading_item" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "accented" TEXT NOT NULL,
    "accent_checked" BOOLEAN NOT NULL DEFAULT true,
    "syllables" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'naujas',
    "difficulty" TEXT NOT NULL DEFAULT 'vidutinis',
    "grade_override" TEXT,
    "needs_better_image" BOOLEAN NOT NULL DEFAULT false,
    "not_ok" BOOLEAN NOT NULL DEFAULT false,
    "groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phonogram" TEXT,
    "letters_mode" TEXT NOT NULL DEFAULT 'sounds',
    "sample_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reading_item_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reading_item_kind_text_key" ON "reading_item"("kind", "text");
CREATE INDEX "reading_item_updated_at_idx" ON "reading_item"("updated_at");

CREATE TABLE "reading_image" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "media_hash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT,
    "artist" TEXT,
    "license" TEXT,
    "page" TEXT,
    "source_url" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reading_image_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reading_image_item_id_idx" ON "reading_image"("item_id");

CREATE TABLE "reading_audio" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "media_hash" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reading_audio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reading_audio_item_id_idx" ON "reading_audio"("item_id");

CREATE TABLE "reading_media" (
    "hash" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reading_media_pkey" PRIMARY KEY ("hash")
);

ALTER TABLE "reading_attempt" ADD COLUMN "item_id" TEXT;
ALTER TABLE "reading_attempt" ADD COLUMN "audio" TEXT;
CREATE INDEX "reading_attempt_item_id_idx" ON "reading_attempt"("item_id");

ALTER TABLE "reading_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reading_image" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reading_audio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reading_media" ENABLE ROW LEVEL SECURITY;
