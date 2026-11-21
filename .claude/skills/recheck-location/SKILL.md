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
   ("Current week (all models)"). One number. Note the time now (ISO).
2. `get_travel_state` — every location hint with its weight, and the best
   guess. Say in one line where they are. If the owner says otherwise,
   `set_location` (or pass lat/lng to the briefs).
3. `preview_briefs` (free) — zone, per use case: found in the index, dropped
   by the rules, already known (negative list), on this page, left for later;
   layer versions. Show the owner, short. **Ask: "Pull? (yes/no)" and wait.**
   Missing index cells → offer `index_area` first.
4. On yes: `get_briefs(owner_approved=true)` with the same arguments — every
   brief at once: charter, output format, location once; then per use case
   its rules, the known places (never return those) and the places to judge.
5. Judge each brief; `submit_results(brief_id, results)` (≤ 20 per call).
   - `fetch_page` / `fetch_image` only for a place you keep (menu, prices) or
     when one check changes the verdict. Each costs.
   - Summaries in your own words; don't copy review text.
6. **CAP HIT** in any reply: stop at once, submit what you have, go to step 7.
7. **Usage after.** Ask for `/usage` again, and read your own token use:
   `node <this skill's folder>/usage.mjs --since <the time from step 1>`.
8. `finish_run(run_id, usage_before_pct, usage_after_pct, claude_* numbers,
   model, notes)` — notes = a short yield report: what was worth it, what
   produced little and why. If a rule should change (a chain the rules let
   through, a kind that's always junk), say so — or `update_rule` with a note,
   after asking the owner.
9. Tell the owner in 2–3 lines: kept places, % of the week used (pass < 5 %),
   and the pull page link (its "Under the hood" map shows every step and cost).

"More places here" = run steps 3–8 again: everything already judged is in the
negative list, so the next page comes up.

## Keep it cheap

- Don't re-read or re-summarise batches; judge and submit right after each.
- Don't open places the server didn't send you.
- Use the smallest model that judges well (Sonnet). Opus uses the weekly
  limit faster.
