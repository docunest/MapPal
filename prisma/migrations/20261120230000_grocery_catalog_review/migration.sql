-- Grocery catalog review (owner 2026-11-20): one child of 6 (no baby items),
-- a dog (no cat), wet wipes are for camping. Only rows still as seeded are
-- changed. Also fixes two dog items that catalog v2 put under Pharmacy.
UPDATE "grocery_category" SET "name_en" = 'Kids', "emoji" = '🧒', "updated_at" = now() WHERE "id" = 'vaikams';

UPDATE "grocery_product" SET "hidden" = true, "updated_at" = now()
WHERE "source" = 'seed' AND "seed_key" IN ('vaikams:sauskelnės', 'vaikams:tyrelės', 'gyvunams:kačių maistas', 'gyvunams:kraikas');

UPDATE "grocery_product" SET "category_id" = 'higiena', "seed_key" = 'higiena:drėgnos servetėlės',
  "aliases" = array_cat(array_remove(array_remove("aliases", 'servetėlės vaikams'), 'servetėlės'), ARRAY['camping wipes', 'toallitas']), "updated_at" = now()
WHERE "seed_key" = 'vaikams:drėgnos servetėlės'
  AND NOT EXISTS (SELECT 1 FROM "grocery_product" WHERE "seed_key" = 'higiena:drėgnos servetėlės');

UPDATE "grocery_product" SET "category_id" = 'gyvunams', "seed_key" = 'gyvunams:šunų skanėstai', "updated_at" = now() WHERE "seed_key" = 'vaistine:šunų skanėstai' AND NOT EXISTS (SELECT 1 FROM "grocery_product" WHERE "seed_key" = 'gyvunams:šunų skanėstai');
UPDATE "grocery_product" SET "category_id" = 'gyvunams', "seed_key" = 'gyvunams:maišeliai šunims', "updated_at" = now() WHERE "seed_key" = 'vaistine:maišeliai šunims' AND NOT EXISTS (SELECT 1 FROM "grocery_product" WHERE "seed_key" = 'gyvunams:maišeliai šunims');
UPDATE "grocery_product" SET "staple" = true, "updated_at" = now() WHERE "seed_key" = 'gyvunams:šunų maistas' AND "source" = 'seed';

-- Open list lines follow their product's new section.
UPDATE "grocery_entry" e SET "category_id" = p."category_id", "updated_at" = now()
FROM "grocery_product" p
WHERE e."product_id" = p."id" AND e."archived" = false AND e."category_id" <> p."category_id"
  AND p."seed_key" IN ('higiena:drėgnos servetėlės', 'gyvunams:šunų skanėstai', 'gyvunams:maišeliai šunims');
