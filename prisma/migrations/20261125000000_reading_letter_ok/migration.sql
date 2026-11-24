-- Per-letter result for word levels ("11011" = 1 right first time), as the brief asks to log.
ALTER TABLE "reading_attempt" ADD COLUMN "letter_ok" TEXT;
