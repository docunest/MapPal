// Azure text-to-speech (Lithuanian neural voices). Key and region come from Vercel env
// (READING_AZURE_SPEECH_KEY, READING_AZURE_SPEECH_REGION, default swedencentral). Without a key,
// generation is unavailable and everything else keeps working (offline voice, recordings).

export const AZURE_VOICES: Record<string, string> = {
  "azure-ona": "lt-LT-OnaNeural",
  "azure-ona-hd": "lt-LT-Ona:DragonLatestNeural",
  "azure-leonas": "lt-LT-LeonasNeural",
};

export class AzureUnavailable extends Error {}

export function azureConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.READING_AZURE_SPEECH_KEY?.trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** SSML body for one clip. Stress marks in `accented` are read by the Lithuanian voices. */
export function clipSsml(kind: string, accented: string, syllables: string, ipa?: string): { inner: string; rate: string } {
  if (kind === "syllables") return { inner: syllables.split("-").map(esc).join('<break time="450ms"/>'), rate: "-25%" };
  if (kind === "name") return { inner: `<say-as interpret-as="characters">${esc(accented)}</say-as>`, rate: "-20%" };
  if (kind === "sound" && ipa) return { inner: `<phoneme alphabet="ipa" ph="${esc(ipa)}">${esc(accented)}</phoneme>`, rate: "-20%" };
  return { inner: esc(accented), rate: kind === "word" ? "-15%" : "-20%" };
}

export async function synthesize(voice: string, inner: string, rate: string, env: Record<string, string | undefined> = process.env): Promise<Buffer> {
  const key = env.READING_AZURE_SPEECH_KEY?.trim();
  const name = AZURE_VOICES[voice];
  if (!key || !name) throw new AzureUnavailable("Azure voice key is not set on the server");
  const region = env.READING_AZURE_SPEECH_REGION?.trim() || "swedencentral";
  const ssml = `<speak version="1.0" xml:lang="lt-LT"><voice name="${name}"><prosody rate="${rate}">${inner}</prosody></voice></speak>`;
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "mappal-reading" },
    body: ssml,
  });
  if (!r.ok) throw new AzureUnavailable(`Azure answered ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Letter sounds as IPA, for the "sound" clip of single letters (names use say-as). */
export const LETTER_IPA: Record<string, string> = {
  a: "a", "ą": "aː", b: "b", c: "ts", "č": "tʃ", d: "d", e: "ɛ", "ę": "ɛː", "ė": "eː", f: "fː", g: "ɡ", h: "ɣ",
  i: "ɪ", "į": "iː", y: "iː", j: "jː", k: "k", l: "lː", m: "mː", n: "nː", o: "oː", p: "p", r: "rː", s: "sː",
  "š": "ʃː", t: "t", u: "ʊ", "ų": "uː", "ū": "uː", v: "vː", z: "zː", "ž": "ʒː",
};
