-- CreateTable
CREATE TABLE "mappal_login_token" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappal_login_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mappal_login_token_token_key" ON "mappal_login_token"("token");

-- AddForeignKey
ALTER TABLE "mappal_login_token" ADD CONSTRAINT "mappal_login_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "mappal_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
