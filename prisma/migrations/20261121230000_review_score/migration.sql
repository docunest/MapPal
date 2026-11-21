-- The agent's 0–100 score per place (0 = no-go, 50 = undecided, 100 = a must),
-- judged against the family's like/dislike hints. Null for older reviews.
ALTER TABLE "mappal_agent_review" ADD COLUMN "score" INTEGER;
