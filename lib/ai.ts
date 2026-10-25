// Optional Claude features: kid-friendly explanations, follow-up questions,
// and "what is this?" from a photo. Everything else in the app works without
// them; these turn on when ANTHROPIC_API_KEY is set on the deployment.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { DeepDive } from "./live/deepdive";
import { wikipediaArticle } from "./wikimedia";

export const AI_MODEL = "claude-opus-5-5";

export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export type AskMode = "kid" | "adult";

export function systemPrompt(mode: AskMode, age: number, lang: string): string {
  const language = languageName(lang);
  if (mode === "kid") {
    return `You are the travel companion inside MapPal, a family's camper-van travel app. A curious child of about ${age} is riding along and just spotted something out of the window (or on the map). Answer them directly, in ${language}.

Use the reference material provided (from Wikipedia, Wikidata and OpenStreetMap) as your main source; it may be in another language, so translate as you go. If it doesn't cover what they asked, you may search the web. If you still don't know, say so plainly — never invent dates, numbers or names.

Make it vivid and concrete for a ${age}-year-old: what it is, why it's here, what happens (or happened) there, how it works or how the thing made there is made, and one or two surprising facts. Compare sizes to things a kid knows. Short paragraphs, roughly 150–200 words unless they ask for more. No headings or bullet lists — this may be read aloud in the car.`;
  }
  return `You are the travel companion inside MapPal, a family's camper-van travel app. An adult traveller is asking about a place nearby. Answer in ${language}.

Use the reference material provided (from Wikipedia, Wikidata and OpenStreetMap) as your main source; it may be in another language, so translate as you go. If it doesn't cover the question, you may search the web. If you still don't know, say so — never invent dates, numbers or names.

Be concise and specific: around 150–250 words, plain prose, no headings. Prefer the history, how it works, and practical details a visitor would care about (opening, access, what's worth seeing).`;
}

const MAX_ARTICLE_CHARS = 30000;

/** The reference block Claude answers from — the same material the deep-dive screen shows. */
export async function referenceMaterial(dive: DeepDive, extra: { lat?: number; lng?: number; kind?: string }): Promise<string> {
  const parts: string[] = [`# ${dive.title}`];
  if (dive.description) parts.push(dive.description);
  if (extra.kind) parts.push(`Map category: ${extra.kind}`);
  if (extra.lat !== undefined && extra.lng !== undefined) parts.push(`Coordinates: ${extra.lat.toFixed(5)}, ${extra.lng.toFixed(5)}`);
  if (dive.facts.length) parts.push(`## Facts (Wikidata)\n${dive.facts.map((f) => `- ${f.label}: ${f.value}`).join("\n")}`);

  const articleText = (a: NonNullable<DeepDive["article"]>) =>
    [a.lead, ...a.sections.map((s) => `### ${s.heading}\n${s.text}`)].join("\n\n").slice(0, MAX_ARTICLE_CHARS);

  if (dive.article) parts.push(`## Wikipedia (${dive.article.lang}): ${dive.article.title}\n${articleText(dive.article)}`);
  // The local-language article is often the detailed one for local sights.
  const other = dive.otherArticles[0];
  if (other) {
    const a = await wikipediaArticle(other.lang, other.title).catch(() => null);
    if (a) parts.push(`## Wikipedia (${a.lang}): ${a.title}\n${articleText(a)}`);
  }
  if (!dive.article && dive.concept) parts.push(`## About ${dive.concept.title} in general (Wikipedia)\n${dive.concept.lead}`);
  return parts.join("\n\n");
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Stream an answer as plain text. Web search is available for questions the
 * reference material doesn't cover; cited sources are appended at the end.
 */
export function streamAnswer(system: string, reference: string, turns: ChatTurn[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));
      const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
      const sources = new Map<string, string>();
      try {
        // Server-side web search can pause a long turn; resume a couple of times.
        for (let continuation = 0; continuation < 3; continuation++) {
          const stream = anthropic().beta.messages.stream({
            model: AI_MODEL,
            max_tokens: 16000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            // A chat answer for the back seat: snappy matters more than depth.
            output_config: { effort: "low" },
            system: [
              { type: "text", text: system },
              // Same place → same reference block, so follow-up questions hit the cache.
              { type: "text", text: `Reference material:\n\n${reference}`, cache_control: { type: "ephemeral" } },
            ],
            tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
            messages,
          });
          stream.on("text", send);
          const message = await stream.finalMessage();

          for (const block of message.content) {
            if (block.type !== "text") continue;
            for (const c of block.citations ?? []) {
              if (c.type === "web_search_result_location") sources.set(c.url, c.title ?? c.url);
            }
          }
          if (message.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: message.content });
            continue;
          }
          if (message.stop_reason === "refusal") send("\n\n(Sorry — I can't help with that one.)");
          break;
        }
        if (sources.size) {
          send(`\n\nSources:\n${[...sources].slice(0, 5).map(([url, title]) => `• ${title} — ${url}`).join("\n")}`);
        }
      } catch (err) {
        send(`\n\n⚠️ ${describeAiError(err)}`);
      } finally {
        controller.close();
      }
    },
  });
}

export function describeAiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Claude API key on the server is invalid.";
  if (err instanceof Anthropic.RateLimitError) return "Claude is busy right now — try again in a minute.";
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ""}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

// --- Photo lens -------------------------------------------------------------

export interface PhotoCandidate {
  name: string;
  kindLabel: string;
  distance: number;
  compass: string;
  direction?: string;
}

const IdentifySchema = z.object({
  match: z.number().int().describe("1-based index into the candidate list of the thing in the photo, or 0 if none of them"),
  what: z.string().describe("Short name of what the photo shows, e.g. 'Blast furnace no. 1'"),
  explanation: z.string().describe("The kid-friendly (or adult) explanation, 80–150 words"),
  confidence: z.enum(["high", "medium", "low"]),
});

export type IdentifyResult = z.infer<typeof IdentifySchema>;

export async function identifyPhoto(opts: {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  lat: number;
  lng: number;
  heading?: number;
  candidates: PhotoCandidate[];
  mode: AskMode;
  age: number;
  lang: string;
}): Promise<IdentifyResult> {
  const list = opts.candidates
    .map((c, i) => `${i + 1}. ${c.name} — ${c.kindLabel}, ${c.distance} m ${c.compass}${c.direction ? ` (${c.direction})` : ""}`)
    .join("\n");
  const where = `Taken at ${opts.lat.toFixed(5)}, ${opts.lng.toFixed(5)}${opts.heading !== undefined ? `, facing/driving ${Math.round(opts.heading)}°` : ""}.`;

  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(IdentifySchema) },
    system: systemPrompt(opts.mode, opts.age, opts.lang),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: opts.mediaType, data: opts.imageBase64 } },
          {
            type: "text",
            text: `We just took this photo from the car. ${where}

Things the map says are nearby (with distance and direction from us):
${list || "(none found)"}

Which of these is in the photo? If none fits, set match to 0 and say what it most likely is from the photo itself — be honest about uncertainty. Then explain it.`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("Couldn't identify that photo.");
  }
  return response.parsed_output;
}
