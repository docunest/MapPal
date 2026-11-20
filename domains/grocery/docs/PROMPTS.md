# LLM prompts and templates

The templates live in `domain/prompts.ts`. `{{placeholders}}` are filled by `render()`.
The taxonomy (sections plus the whole family catalog with aliases) goes into the
**system** prompt, so it is a stable prefix that DeepSeek caches cheaply.

## When the AI is used

| Step | AI? |
| --- | --- |
| Autocomplete while typing | never (runs on the phone) |
| Typed or dictated text where every part matches the catalog | never (`domain/parse.ts`) |
| Text with something the catalog can't place | `PARSE_*` → items you confirm in a preview |
| A new item typed by hand (lands in "Kita") | `PARSE_*` right after the reply (`application/classifyNew.ts`): files it in a section, or merges it into a known product and keeps the spelling as an alias |
| "Dažniausiai perkate" | never (`domain/suggest.ts`) |
| ✨ Ask AI | `SHORTLIST_*` |

Every reply is validated (`domain/ai.ts`). Unknown product ids and sections are
dropped or replaced by catalog matches, so the model can't corrupt the catalog.

## PARSE (text → items)

- **System:** role, Lithuanian + English, the rules (prefer known ids; a new
  product gets a Lithuanian shelf name, English name, one section and
  GROCERY/LONGTERM; aliases; qty only if said; a note for details; "remove"
  for "nebereikia"), then `{{categories}}` and `{{catalog}}`.
- **User:** `{{list}}` (what is already on the list) and `{{text}}`.
- **Reply:** `{"items":[{"action","productId","name","nameEn","aliases","category","kind","qty","note","heard"}]}`

## SHORTLIST (history → what to buy now)

- **System:** pick due/overdue items by their own rhythm, complete what's on
  the list, skip what's already there, at most `{{max}}`, short Lithuanian reasons.
- **User:** `{{today}}`, `{{history}}` (id | name | section | times | avg days | days since), `{{staples}}`, `{{list}}`.
- **Reply:** `{"items":[{"productId","reason"}],"tips":[]}`

## Changing them

Edit `domain/prompts.ts` and run `npm test` (`test/domain.test.ts`) (the AI-output validation is
tested with a fake model). Section ids must stay the ones in `domain/seed-data.ts`.
