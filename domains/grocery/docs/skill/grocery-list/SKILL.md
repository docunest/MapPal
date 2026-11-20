---
name: grocery-list
description: Read and update the family's shared grocery list ("Pirkiniai") — add things to buy from free text or dictation (Lithuanian or English), see what's on the list grouped in supermarket aisle order, cross items out while shopping, finish a shopping trip, and suggest what the family usually needs. Use whenever the user mentions the shopping/grocery list, pirkiniai, "nupirkti", "reikia nupirkti", what to buy, what's in the fridge or what they ran out of, or long-term purchases to remember.
---

# Family grocery list

The family keeps one shared list in the Pirkiniai app (phones and this assistant
see the same data, live). Names are Lithuanian; English is understood.

## Connection

Use the **grocery-list MCP connector** tools if they are available (or the same
actions over REST — `listItems`, `addItems`, `markBought`, `removeItems`,
`finishShopping`, `suggestItems`, `searchCatalog` — when it is set up as OpenAPI actions):
`get_list`, `add_items`, `mark_bought`, `remove_items`, `finish_shopping`,
`suggest_items`, `search_catalog`.

If the tools are not available, tell the user to add a custom connector with
this assistant's own connector URL (`https://<MapPal URL>/api/grocery/mcp/<agent token>`,
created in the app: ⚙️ Nustatymai → Asistentai → name → Sukurti), with no authentication. Never ask for the token
in chat, and never invent list contents.

## How to act

- **Adding:** pass the user's words unchanged to `add_items.text`, even if it is
  a messy dictated sentence ("pieno, du kepalus duonos ir dar šildytuvo"). The
  server matches the family catalog, quantities and Lithuanian word forms, and
  classifies new things. Don't translate or normalise first. Use `items[]` only
  when you build the list yourself (e.g. from a recipe), with Lithuanian names when
  you know them; set `long_term: true` for durable goods.
- **Fridge photo or recipe:** work out the missing items, then send them in one
  `add_items` call.
- **"What do we need?":** call `suggest_items` (add `use_ai: true` only if asked
  for a smarter list), show the suggestions grouped, and add only what the user confirms.
- **Shopping:** `mark_bought` with names in any language, or the `{id:…}` from
  `get_list`. `bought: false` undoes it. `finish_shopping` only when the user says
  they're done. Unbought items stay on the list automatically.
- **Long-term items** (heater, tools, clothes, camping gear) stay on the list
  until bought; mention them only when relevant ("if you pass a hardware store…").
- Answer in the user's language. When you show the list, keep the aisle grouping
  from `get_list`.
- Report what the tool says it did ("already on list", "new product"). Don't claim
  something was added if the tool didn't confirm it.
