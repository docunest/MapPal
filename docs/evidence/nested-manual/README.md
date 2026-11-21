# Evidence — readable text, nested use cases, tree filter, manual run (2026-11-21)

Local production build against the local test database (rules reset to their
first default versions first, like production), OpenStreetMap index around
Caldas da Rainha, test login "Tester A". Screenshots taken with the browser in
**dark mode** (where the owner saw unreadable text).

| File | Shows |
|---|---|
| 01-phone-dark-config-charter.png | Config on a phone in dark mode: readable; use cases as a tree (Food group → Cafes, Cool bars, Fast food, Restaurants) |
| 02-phone-config-cool-bars-inherits.png | Cool bars: "Food › Cool bars — town circles · 25 per page · 8 drop rules (4 from parents)…" and "+ Sub-type of Cool bars" |
| 03/04/05-phone-browse-*.png | Browse: All → Food (sub-types appear) → Cool bars (300 → 43 places; bars judged earlier as "Cafes and bars" now listed as Food › Cool bars) |
| 06/07-phone-manual-*.png | Manual run: pick Cool bars, 5 per use case, free preview, payload built (~1.7k tokens) |
| 08-phone-manual-saved.png | The answer pasted back (with a code fence and a sentence around it): "Saved 5 of 5 places" |
| 09-phone-browse-bars-after.png | Browse after saving: the five now judged |
| 10-desktop-browse-cool-bars.png | Desktop, same filter |
| 11-desktop-config-food-group.png | Desktop Config, the Food group |
| 12-desktop-manual-pull-page.png | The pull page: Food › Cool bars, 5 checked → 3 kept, model "manual: …", timeline with manual.payload / manual.import |
| 13-desktop-runs-list.png | Runs list with per-use-case counts |

Default upgrade on the database (first versions → tree), as production will do on first use:

```
output-format          v2 default  defaults updated in the code: use cases nest — Food → …
usecase:cafes          v2 default  Cafes        (was "Cafes and bars" v1, kept in history)
usecase:food/bars/restaurants/fast-food  v1 default  first version (from the code)
```

Connector, same tree (`preview_briefs` with `use_cases: ["food"]`, free):

```
Food › Cafes (rules v1 · 7859ff001cb6 › v2 · 3a5ffbba605d), page 2: 66 in the index → 5 dropped, 45 already known, 25 to judge now
Food › Cool bars (…), page 2: 14 in the index → 2 dropped, 45 already known, 2 to judge now
Food › Fast food (…), page 1: 8 in the index → 0 dropped, 45 already known, 8 to judge now
Food › Restaurants (…), page 1: 66 in the index → 3 dropped, 45 already known, 25 to judge now
```

An agent adding a sub-type: `update_rule usecase:kebab` with parent fast-food and id prefix "f" →
"the use-case tree would break: kebab: id prefix "f" is already used by fast-food"; with "k" → saved, and
the next preview shows "Food › Fast food › Kebab".

Not proven here: the owner's iPhone, and an answer from a real ChatGPT / Claude.ai chat (the pasted answer
was written in the same format by this session, judging only the facts in the payload).
