-- docunest hard rules §5: every table gets RLS with no policies, so the
-- public Supabase API (anon key) can't read it. The server's DATABASE_URL role
-- bypasses RLS, so the app is unaffected.
ALTER TABLE "grocery_category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grocery_product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grocery_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grocery_trip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grocery_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grocery_ai_call" ENABLE ROW LEVEL SECURITY;
