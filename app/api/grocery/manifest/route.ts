import { isFamilyToken } from "@/domains/grocery";

// Home Screen app on the iPhone: Safari and the installed app don't share
// storage, so the installed app must start from a URL that carries the token.
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const start = isFamilyToken(t) ? `/grocery#t=${encodeURIComponent(t)}` : "/grocery";
  return Response.json(
    {
      id: "/grocery",
      name: "Pirkiniai",
      short_name: "Pirkiniai",
      description: "Family grocery list",
      start_url: start,
      scope: "/grocery",
      display: "standalone",
      background_color: "#f6f5f1",
      theme_color: "#2f6f4f",
      icons: [
        { src: "/grocery/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/grocery/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } },
  );
}
