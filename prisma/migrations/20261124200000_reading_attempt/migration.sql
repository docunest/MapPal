-- CreateTable: one row per answer from the reading game (domains/reading)
CREATE TABLE "reading_attempt" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "item" TEXT NOT NULL,
    "options" TEXT[] NOT NULL,
    "answer" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "first_try" BOOLEAN NOT NULL,
    "hint_used" BOOLEAN NOT NULL,
    "response_ms" INTEGER NOT NULL,
    "client_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_attempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reading_attempt_created_at_idx" ON "reading_attempt"("created_at");
CREATE INDEX "reading_attempt_level_item_idx" ON "reading_attempt"("level", "item");

-- Hard rule: RLS on, no policies. The public Supabase API cannot read it; the server role bypasses RLS.
ALTER TABLE "reading_attempt" ENABLE ROW LEVEL SECURITY;
