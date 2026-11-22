# Activities baseline (2026-11-22)

From the owner's survey and answers: requirements first, any agent/model gets the same text.

- **Tree** (rules as data, editable in Config): Activities → Outdoors with the family, On the water,
  Motors and adrenaline, For the 6-year-old, Places with a wow, Local events (+ Exploration, the
  map-list kind). Love / Maybe / No lists from the survey are in each kind's text. These kinds are
  *discover*: the agent finds the places; the map index is just one tool.
- **Shared requirements** (Activities text): whole family + dog; 40 km normal, up to 120 km for a must-do
  with a reason; must run in this season and inside the window; price for the family with how sure;
  dogs yes/no/unknown; don't rank, the family filters.
- **Window**: today → +60 days, written as real dates into every prompt (owner: up to 2 months, filter in Swipe).
- **Answer contract v3**: price_family_eur, price_tier (family: free · € <40 · €€ <120 · €€€ <240 · €€€€ 240+,
  the survey's per-person bands × 4; the server derives the tier from the euros), price_confidence
  (high = published price · medium = similar/range · low = guess), price_note, season_note, event_start/end,
  dogs, must_do_reason.
- **Food off by default**: not run and not listed unless picked ("All (no food)").
- **Swipe/Browse filters**: price for the family; events from today to 7/14/30/60 days; past events hidden.

Local proof (iPhone 13, dark mode, local DB, Tester A; answers written by this session, two marked as tests):
01 list without food (0 food of 108), 02 card with "€€€ ~€180 ●○○ family (a guess)" and "no dogs",
03 Óbidos Vila Natal with "📅 27 Nov – 3 Jan", 04 filters (€€ cap: 108 → 107).
The default Discover prompt now covers the 7 activity kinds and no food; each states
"Search window: 2026-11-22 to 2027-01-21".
