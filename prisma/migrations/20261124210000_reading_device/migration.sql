-- CreateTable: devices and agents allowed to call the reading API (hashed tokens only)
CREATE TABLE "reading_device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "reading_device_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reading_device_token_sha256_key" ON "reading_device"("token_sha256");

-- Hard rule: RLS on, no policies.
ALTER TABLE "reading_device" ENABLE ROW LEVEL SECURITY;
