// OpenAPI 3.1 description of the assistant REST API (/api/grocery/v1), for
// tools that take OpenAPI "actions" instead of MCP (ChatGPT custom GPTs,
// Gemini, scripts). Public: it holds no secrets; every call needs an
// assistant API key issued in the app.
const ITEM = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string", description: "Lithuanian shelf name" },
    qty: { type: ["string", "null"] },
    note: { type: ["string", "null"] },
    section: { type: "string", description: "Supermarket section (English)" },
    sectionLt: { type: "string" },
    longTerm: { type: "boolean", description: "Durable thing bought when there's a chance (heater, tools)" },
    bought: { type: "boolean", description: "Crossed out on the current shopping trip" },
    addedBy: { type: ["string", "null"] },
    boughtBy: { type: ["string", "null"] },
  },
} as const;

const REFS = {
  type: "object",
  required: ["items"],
  properties: {
    items: { type: "array", items: { type: "string" }, description: "Item names in any language (\"milk\", \"pieno\") or ids from listItems" },
    who: { type: "string", description: "Family member to show instead of the assistant's name (optional)" },
  },
} as const;

const json = (schema: unknown) => ({ content: { "application/json": { schema } } });
const ok = (description: string, schema: unknown) => ({ "200": { description, ...json(schema) }, "401": { description: "Missing, wrong or revoked API key" } });

export function openApiSpec(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Pirkiniai — family grocery list",
      version: "1.0.0",
      description:
        "The family's shared grocery list (Lithuanian names; English and other languages understood). Groceries are bought on every supermarket trip; long-term items wait until there is a chance. Add things with free text exactly as the user said it — the server matches the family catalog, quantities and word forms and files new things into supermarket sections. Items not bought stay on the list for the next trip.",
    },
    servers: [{ url: `${origin}/api/grocery/v1` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "Assistant API key from Pirkiniai → ⚙️ → Asistentai (also accepted as X-API-Key or ?key=)" },
      },
    },
    paths: {
      "/items": {
        get: {
          operationId: "listItems",
          summary: "Show the shopping list in supermarket aisle order",
          parameters: [{ name: "include_bought", in: "query", required: false, schema: { type: "boolean", default: true }, description: "Include items already crossed out on the current trip" }],
          responses: ok("The list", {
            type: "object",
            properties: { toBuy: { type: "integer" }, trip: { type: ["object", "null"], properties: { startedAt: { type: "string" }, startedBy: { type: ["string", "null"] } } }, items: { type: "array", items: ITEM } },
          }),
        },
        post: {
          operationId: "addItems",
          summary: "Add things to buy (free text or explicit items)",
          description: "Pass the user's words unchanged in `text` (e.g. \"pieno, du kepalus duonos ir portable heater\", or a dish: \"ingredients for pancakes\"). Use `items` only for a list you built yourself.",
          requestBody: {
            required: true,
            ...json({
              type: "object",
              properties: {
                text: { type: "string" },
                items: {
                  type: "array",
                  items: { type: "object", required: ["name"], properties: { name: { type: "string" }, qty: { type: "string" }, note: { type: "string" }, long_term: { type: "boolean" } } },
                },
                who: { type: "string" },
              },
            }),
          },
          responses: ok("What happened", {
            type: "object",
            properties: {
              added: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, qty: { type: ["string", "null"] }, newProduct: { type: "boolean" } } } },
              alreadyOnList: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, qty: { type: ["string", "null"] } } } },
              removed: { type: "integer", description: "Items taken off because the user said they're not needed" },
              parsedBy: { type: "string", enum: ["local", "ai", "none"] },
            },
          }),
        },
      },
      "/items/bought": {
        post: {
          operationId: "markBought",
          summary: "Cross items out as bought (or back to buy with bought=false)",
          requestBody: { required: true, ...json({ ...REFS, properties: { ...REFS.properties, bought: { type: "boolean", default: true } } }) },
          responses: ok("Done", { type: "object", properties: { done: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } } }, notOnList: { type: "array", items: { type: "string" } } } }),
        },
      },
      "/items/remove": {
        post: {
          operationId: "removeItems",
          summary: "Take items off the list (not needed any more)",
          requestBody: { required: true, ...json(REFS) },
          responses: ok("Done", { type: "object", properties: { removed: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } } }, notOnList: { type: "array", items: { type: "string" } } } }),
        },
      },
      "/trip/finish": {
        post: {
          operationId: "finishShopping",
          summary: "Finish the shopping trip: crossed-out items become history, the rest stays on the list",
          description: "Only when the user says they are done shopping.",
          requestBody: { required: false, ...json({ type: "object", properties: { who: { type: "string" } } }) },
          responses: ok("Summary", { type: "object", properties: { bought: { type: "integer" }, stayOnList: { type: "integer" }, longTerm: { type: "integer" } } }),
        },
      },
      "/suggestions": {
        get: {
          operationId: "suggestItems",
          summary: "What the family is probably due to buy (not yet on the list)",
          parameters: [{ name: "use_ai", in: "query", required: false, schema: { type: "boolean", default: false }, description: "Ask DeepSeek to refine the list" }],
          responses: ok("Suggestions", {
            type: "object",
            properties: {
              source: { type: "string", enum: ["history", "ai"] },
              items: { type: "array", items: { type: "object", properties: { productId: { type: "string" }, name: { type: "string" }, reason: { type: "string" } } } },
              tips: { type: "array", items: { type: "string" } },
            },
          }),
        },
      },
      "/catalog": {
        get: {
          operationId: "searchCatalog",
          summary: "Find known products (names, aliases, section)",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
          responses: ok("Matches", {
            type: "object",
            properties: { products: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, nameEn: { type: ["string", "null"] }, aliases: { type: "array", items: { type: "string" } }, section: { type: "string" }, longTerm: { type: "boolean" } } } } },
          }),
        },
      },
    },
  };
}
