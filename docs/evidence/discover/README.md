# Discover mode (2026-11-22)

Owner: "I want both modes… pass what I picked or blacklisted… ask it to make no mistakes and
cross-reference OpenStreetMap; some places might be only on Google Maps or only on Insta."

- **Judge a list** (as before): MapPal picks places from the map by the rules; the agent judges them.
- **Discover** (new): the agent names the top N within K km itself. The prompt carries the charter,
  strict no-mistakes rules (a checked link per place, Google pin coordinates, leave out what it can't
  verify), the use-case rules, the known places (don't repeat), and the family's likes and dislikes
  incl. "never". Connector: `preview_discover` → `discover` → `submit_discoveries`; Manual run:
  the Discover switch, paste the JSON back.
- Every answer is matched to the OSM index (osm_ref, or a similar name near the pin; a looser name
  only very close). Matched → the OSM place. Not matched → kept as `ext/<hash>` with the agent's
  pin and its Google/Instagram/website link, shown as "⚠ not on the map — check the link".
  Already-known places are skipped.

Local proof (iPhone 13, dark mode, local DB, Tester A): 01 Discover switch · 02 the built prompt
(5 Food use cases, ~8k tokens) · 03 list with "not on map" · 04 card with the warning. In the
submit test, two real cafés given with drifting pins were matched to their OSM elements (and
skipped as already known); a made-up test place was kept as not on the map. The answers were
written by this session, not by a real chat agent.
