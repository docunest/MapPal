-- CreateEnum
CREATE TYPE "grocery_kind" AS ENUM ('GROCERY', 'LONGTERM');

-- CreateEnum
CREATE TYPE "grocery_entry_status" AS ENUM ('OPEN', 'BOUGHT', 'REMOVED');

-- CreateTable
CREATE TABLE "grocery_category" (
    "id" TEXT NOT NULL,
    "name_lt" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "kind" "grocery_kind" NOT NULL DEFAULT 'GROCERY',
    "sort_order" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category_id" TEXT NOT NULL,
    "kind" "grocery_kind" NOT NULL DEFAULT 'GROCERY',
    "staple" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'user',
    "seed_key" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_entry" (
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "kind" "grocery_kind" NOT NULL DEFAULT 'GROCERY',
    "qty" TEXT,
    "note" TEXT,
    "status" "grocery_entry_status" NOT NULL DEFAULT 'OPEN',
    "via" TEXT NOT NULL DEFAULT 'typed',
    "added_by" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bought_at" TIMESTAMP(3),
    "bought_by" TEXT,
    "trip_id" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_trip" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_by" TEXT,
    "ended_at" TIMESTAMP(3),
    "ended_by" TEXT,

    CONSTRAINT "grocery_trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_member" (
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_member_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "grocery_ai_call" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,

    CONSTRAINT "grocery_ai_call_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grocery_product_seed_key_key" ON "grocery_product"("seed_key");

-- CreateIndex
CREATE INDEX "grocery_entry_archived_idx" ON "grocery_entry"("archived");

-- CreateIndex
CREATE INDEX "grocery_entry_product_id_idx" ON "grocery_entry"("product_id");

-- CreateIndex
CREATE INDEX "grocery_ai_call_at_idx" ON "grocery_ai_call"("at");

-- AddForeignKey
ALTER TABLE "grocery_product" ADD CONSTRAINT "grocery_product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "grocery_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_entry" ADD CONSTRAINT "grocery_entry_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "grocery_product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

