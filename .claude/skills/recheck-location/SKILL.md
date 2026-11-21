---
name: recheck-location
description: Run MapPal's Phase 0 cost test — check cafes and exploration spots (caves, mines, abandoned places, gorges) around the family's latest known location through the MapPal agent MCP connector, and log what it cost against the weekly Claude allowance. Use when the owner says "recheck location", "run the cost test", "check cafes/exploration around us", or names the MapPal agent connector.
---

# Recheck location (MapPal Phase 0 cost test)

Design: docs/PLAN.md → "Hybrid agent backend — Phase 0" (docunest/MapPal).
Tools come from the **MapPal agent** MCP connector
(`https://<MapPal host>/api/agent/mcp/<agent token>`). If its tools
(`get_travel_state`, `plan_run`, …) aren't available, tell the owner how to
add it and stop:

```
claude mcp add --transport http mappal-agent https://<MapPal host>/api/agent/mcp/<agent token>
```

## Steps

1. **Usage before.** Ask the owner to type `/usage` and tell you the weekly %
   ("Current week (all models)"). One number. Write it down.
2. `get_travel_state` — every location hint with its weight, and the best
   guess. Say in one line where they are and which stop the run will use. If
   the owner says otherwise, `set_location` (or `plan_run` with lat/lng).
   Note the time now (ISO) — the start for step 7.
3. `plan_run` — the dry run, free. It reads the place index and fetches any
   missing cell around the target first; for a bigger area (a week's route),
   call `index_area` with a radius until it says 0 missing. Show the owner, short: the zone and why,
   how many cafes and exploration spots will be checked, the estimate, any
   notes (a failed OSM query → offer to re-plan in a minute).
   **Ask: "Start? (yes/no)" and wait.**
4. On yes: `start_run(run_id, owner_approved=true)`.
5. Loop `next_batch(run_id, "cafes")` → judge → `submit_reviews`, until it
   says all were sent. Then the same for `"exploration"`.
   - Judge from the facts and the photo. Keep only what the family wants
     (the batch header repeats the criteria).
   - `fetch_page` / `fetch_image` only for a place you keep, for its menu and
     prices, or when one check changes the verdict. Each costs.
   - Summaries in your own words; don't copy review text.
6. **CAP HIT** in any reply: stop at once. Submit reviews for what you saw,
   then go to step 7. Never work around a cap.
7. **Usage after.** Ask the owner for `/usage` again, and read your own token
   use from this session's transcript:
   `node <this skill's folder>/usage.mjs --since <the time from step 2>`
   (prints claude_input_tokens, claude_output_tokens, claude_cache_read_tokens,
   claude_cache_write_tokens).
8. `finish_run(run_id, usage_before_pct, usage_after_pct, claude_* numbers, model, notes)` —
   in `notes` put a short yield report: what was worth it, what produced
   little and why (bad rule, sparse area, missing source).
9. Tell the owner in 2–3 lines: kept places, % of the week used (pass < 5 %),
   and the run page link (its "Under the hood" map shows every step and cost). Ask them to tap 👍/👎 on the kept places there; that
   is the "real and relevant" half of the test (pass ≥ 70 % 👍).

## Keep it cheap

- Don't re-read or re-summarise batches; judge and submit right after each.
- Don't open places the server didn't send you.
- Use the smallest model that judges well (Sonnet). Opus uses the weekly
  limit faster.
