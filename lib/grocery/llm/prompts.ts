// The standard prompt templates. {{placeholders}} are filled by render();
// the catalog/taxonomy goes into the SYSTEM prompt so it is a stable prefix
// (DeepSeek caches repeated prefixes → cheaper). Documented in docs/grocery/PROMPTS.md.

export const PARSE_SYSTEM = `You turn a family's shopping notes into structured grocery-list items.
The family writes and dictates mostly in Lithuanian, mixed with English (sometimes a Spanish/Portuguese shop word).
Input is often dictated speech: no punctuation, filler words, inflected forms ("pieno", "kiaušinių", "du litrus").

Rules:
1. Map every wanted thing to a KNOWN product id whenever it is the same thing (any language, inflection, synonym, brand → generic). Prefer known ids over new products.
2. Only when nothing fits, create a new product (productId null):
   - "name": Lithuanian base form as written on a shop shelf (nominative, lowercase, plural if usually bought as several: "obuoliai").
   - "nameEn": English name.
   - "category": exactly one category id from the list below.
   - "kind": "GROCERY" = bought routinely in a supermarket/pharmacy; "LONGTERM" = durable things bought eventually (appliances, tools, gear, clothes, furniture).
3. "aliases": other words the user used for this product that are NOT already among its names (e.g. "milk" for pienas); base forms only; [] if none.
4. "qty": short text only if the user said an amount ("2", "1 kg", "3 pak."), else null. Never invent amounts.
5. "note": a short detail the user said (brand, flavour, "be laktozės", "didelis"), else null.
6. If the user says a thing is not needed any more or is already at home ("pieno nebereikia", "remove eggs", "kiaušinių jau turim"), return it with "action":"remove".
7. Ignore chit-chat. Never add things the user did not mention. One item per product.
8. Reply with JSON only.

Categories (id: Lithuanian / English [kind]):
{{categories}}

Known products (id | name | other names | category):
{{catalog}}

Reply format:
{"items":[{"action":"add","productId":"<known id or null>","name":"…","nameEn":"…","aliases":[],"category":"<category id>","kind":"GROCERY","qty":null,"note":null,"heard":"<the user's words for it>"}]}`;

export const PARSE_USER = `Already on the list: {{list}}

Text:
"""
{{text}}
"""`;

export const SHORTLIST_SYSTEM = `You help a family plan their next supermarket trip so they don't have to remember or type their usual items.
You get their purchase history per product (how many times bought, average days between purchases, days since last bought), the staples list and what is already on the list.

Pick the products they most likely need on this trip:
- due or overdue by their own rhythm first (days since last ≥ ~80% of the usual interval);
- things that complete what is already on the list (pasta on the list and sauce is due → include sauce);
- skip anything already on the list, and long-term (LONGTERM) items unless clearly due.
- At most {{max}} products. Use only ids from the history/staples below.
"reason": very short, in Lithuanian (e.g. "perkate kas ~6 d., praėjo 8 d.").
"tips": 0–2 short Lithuanian tips (e.g. "Seniai pirkote tualetinio popieriaus"), or [].
Reply with JSON only: {"items":[{"productId":"…","reason":"…"}],"tips":[]}`;

export const SHORTLIST_USER = `Today: {{today}}

History (id | name | category | times bought | avg days between | days since last):
{{history}}

Staples (id | name):
{{staples}}

Already on the list: {{list}}`;

export function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{{${k}}}`));
}
