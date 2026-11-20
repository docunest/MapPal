-- CreateTable
CREATE TABLE "grocery_agent_token" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "grocery_agent_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grocery_agent_token_token_hash_key" ON "grocery_agent_token"("token_hash");


-- docunest hard rules §5: RLS on, no policies.
ALTER TABLE "grocery_agent_token" ENABLE ROW LEVEL SECURITY;

-- The first two connector tokens (issued 2026-11-20, hashes were in code) become revocable rows.
INSERT INTO "grocery_agent_token" ("id", "name", "token_hash", "created_by") VALUES
  ('agent_claude_20261120', 'claude', 'e46cd0d6bc88cfd650177fac1b6acb0508469c1543364ce97c7c23ba2e2fcb28', 'setup'),
  ('agent_chatgpt_20261120', 'chatgpt', '803c1d8f27740a545a63e6aa6861449879c7e89b231185297ccea0ac852b7fd6', 'setup')
ON CONFLICT ("token_hash") DO NOTHING;
