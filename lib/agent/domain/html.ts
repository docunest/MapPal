// A web page as plain text plus the images and links that look like a menu
// (design doc: menu snapshot, prices). Pure, so it's tested on saved pages.
export interface PageText {
  title?: string;
  text: string;
  truncated: boolean;
  menuLinks: string[];
  images: Array<{ url: string; alt?: string; menu: boolean }>;
  ogImage?: string;
}

const MENU = /\b(menu|men[uú]|carta|ementa|card[aá]pio|platos|pratos|tapas|petiscos|pizzas?|precios|pre[cç]os)\b/i;

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&euro;/g, "€")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

function abs(href: string, base: string): string | null {
  try {
    const u = new URL(decode(href.trim()), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function pageText(html: string, baseUrl: string, maxChars = 10000): PageText {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];
  const menuLinks: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = decode(m[2].replace(/<[^>]+>/g, " ")).trim();
    const url = abs(m[1], baseUrl);
    if (url && (MENU.test(label) || MENU.test(m[1])) && !menuLinks.includes(url)) menuLinks.push(url);
    if (menuLinks.length >= 10) break;
  }
  const images: PageText["images"] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = m[0].match(/\s(?:data-src|src)=["']([^"']+)["']/i)?.[1];
    const alt = m[0].match(/\salt=["']([^"']*)["']/i)?.[1];
    const url = src && abs(src, baseUrl);
    if (!url || /\.svg(\?|$)|data:|pixel|spacer|logo/i.test(url)) continue;
    if (images.some((i) => i.url === url)) continue;
    images.push({ url, alt: alt ? decode(alt).slice(0, 80) : undefined, menu: MENU.test(`${alt ?? ""} ${url}`) });
    if (images.length >= 12) break;
  }
  const text = decode(
    html
      .replace(/<(script|style|noscript|svg|head|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\r]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return {
    title: title ? decode(title).trim().slice(0, 150) : undefined,
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
    menuLinks,
    images: images.sort((a, b) => Number(b.menu) - Number(a.menu)),
    ogImage: og ? abs(og, baseUrl) ?? undefined : undefined,
  };
}
