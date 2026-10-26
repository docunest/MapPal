// Links as phones actually share them (Google Maps app share sheet, Waze,
// Apple Maps) for real Iberian places → the destination the car drives to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageHints, parseMapUrl, splitSharedText, isShortLink, unwrapConsent } from "../lib/dock/parse";
import { isDockToken, tokenFrom, DEFAULT_DOCK_TOKEN } from "../lib/dock/auth";

const near = (a: { lat: number; lng: number } | undefined, lat: number, lng: number) =>
  assert.ok(a && Math.abs(a.lat - lat) < 1e-4 && Math.abs(a.lng - lng) < 1e-4, `got ${JSON.stringify(a)}, want ${lat},${lng}`);

test("Google place link: the place pin (!3d!4d) wins over the map view (@)", () => {
  const p = parseMapUrl(
    "https://www.google.com/maps/place/Camping+Playa+Joyel/@43.4810417,-3.5210542,15z/data=!4m9!3m8!1s0xd4935f8a3c5d1b1:0x9ad4c6d12f0c8d01!5m2!4m1!1i2!8m2!3d43.4867207!4d-3.5161204!16s%2Fg%2F1tdw9c3k",
  );
  assert.equal(p.title, "Camping Playa Joyel");
  near(p.point, 43.4867207, -3.5161204);
});

test("Google place link with accents and no pin falls back to the view centre", () => {
  const p = parseMapUrl("https://www.google.es/maps/place/Praia+da+Marinha,+Lagoa/@37.0901,-8.4127,17z");
  assert.equal(p.title, "Praia da Marinha, Lagoa");
  near(p.point, 37.0901, -8.4127);
});

test("Google ?q=Name&ftid (what many maps.app.goo.gl links expand to) → a name to search", () => {
  const p = parseMapUrl(
    "https://maps.google.com/?q=Playa+de+las+Catedrales,+Ribadeo,+Lugo&ftid=0xd2e8c2d9d1b3bb5:0x4d7f1a0f1c4a7d3e&entry=gps&g_st=ic",
  );
  assert.equal(p.point, undefined);
  assert.equal(p.query, "Playa de las Catedrales, Ribadeo, Lugo");
  assert.equal(p.title, "Playa de las Catedrales");
});

test("Google dropped pin / coordinate search / directions", () => {
  near(parseMapUrl("https://maps.google.com/?q=38.7223,-9.1393").point, 38.7223, -9.1393);
  near(parseMapUrl("https://www.google.com/maps/search/41.40363,+2.17436?entry=tts").point, 41.40363, 2.17436);
  near(parseMapUrl("https://www.google.com/maps/place/42%C2%B0N/@42.880,-8.545,17z/data=!3m1!4b1!4m4!3m3!8m2!3d42.8805!4d-8.5457").point, 42.8805, -8.5457);
  near(parseMapUrl("https://www.google.com/maps/dir/?api=1&destination=37.3891,-5.9845").point, 37.3891, -5.9845);
  const dir = parseMapUrl("https://www.google.com/maps/dir/Lisboa/Sintra,+Portugal/@38.75,-9.3,11z");
  assert.equal(dir.title, "Sintra, Portugal");
  assert.equal(dir.query, "Sintra, Portugal");
});

test("EU consent redirect is unwrapped", () => {
  const inner = "https://www.google.com/maps/place/Ronda/@36.74,-5.16,14z";
  const wrapped = `https://consent.google.com/ml?continue=${encodeURIComponent(inner)}&gl=ES&hl=es`;
  assert.equal(unwrapConsent(wrapped), inner);
  assert.equal(parseMapUrl(wrapped).title, "Ronda");
});

test("Waze, Apple Maps, geo: and OSM links", () => {
  near(parseMapUrl("https://waze.com/ul?ll=40.41678,-3.70379&navigate=yes&zoom=17").point, 40.41678, -3.70379);
  const wz = parseMapUrl("https://www.waze.com/live-map/directions?to=ll.39.4699%2C-0.3763&to_name=Mercado+Central+Val%C3%A8ncia");
  near(wz.point, 39.4699, -0.3763);
  assert.equal(wz.title, "Mercado Central València");
  const ap = parseMapUrl("https://maps.apple.com/?ll=41.1496,-8.6109&q=Ribeira%20do%20Porto");
  near(ap.point, 41.1496, -8.6109);
  assert.equal(ap.title, "Ribeira do Porto");
  const geo = parseMapUrl("geo:0,0?q=43.3623,-8.4115(Torre de Hércules)");
  near(geo.point, 43.3623, -8.4115);
  assert.equal(geo.title, "Torre de Hércules");
  near(parseMapUrl("https://www.openstreetmap.org/#map=17/37.17631/-3.58811").point, 37.17631, -3.58811);
  near(parseMapUrl("41.6488, -0.8891").point, 41.6488, -0.8891);
});

test("share-sheet text: link pulled out, the line before it is the title hint", () => {
  assert.deepEqual(splitSharedText("Camping Playa Joyel\nhttps://maps.app.goo.gl/AbCdEf12345"), {
    url: "https://maps.app.goo.gl/AbCdEf12345",
    hint: "Camping Playa Joyel",
  });
  assert.deepEqual(splitSharedText("Use Waze to drive to Mercado de Abastos: https://waze.com/ul/hez3x4"), {
    url: "https://waze.com/ul/hez3x4",
    hint: "Mercado de Abastos",
  });
  assert.equal(splitSharedText("https://maps.app.goo.gl/xyz").hint, undefined);
  assert.ok(isShortLink("https://maps.app.goo.gl/AbCdEf12345?g_st=ic"));
  assert.ok(isShortLink("https://goo.gl/maps/AbC"));
  assert.ok(!isShortLink("https://www.google.com/maps/place/x"));
});

test("page hints: preview-image centre and og:title of a Google place page", () => {
  const html = `<meta content="https://maps.google.com/maps/api/staticmap?center=43.5536%2C-7.1553&amp;zoom=15&amp;size=900x900" property="og:image"><meta content="Playa de las Catedrales · Ribadeo, Lugo" property="og:title">`;
  const h = pageHints(html);
  near(h.point, 43.5536, -7.1553);
  assert.equal(h.title, "Playa de las Catedrales");
});

test("dock token: header, bearer or ?token=, env overrides the committed default", () => {
  const r = (h: Record<string, string>, q = "") => new Request(`https://x.app/api/dock/inbox${q}`, { headers: h });
  assert.equal(tokenFrom(r({ authorization: "Bearer abc" })), "abc");
  assert.equal(tokenFrom(r({ "x-dock-token": "abc" })), "abc");
  assert.equal(tokenFrom(r({}, "?token=abc")), "abc");
  assert.ok(isDockToken(DEFAULT_DOCK_TOKEN, {}));
  assert.ok(!isDockToken(DEFAULT_DOCK_TOKEN, { DOCK_INBOX_TOKEN: "other" }));
  assert.ok(isDockToken("other", { DOCK_INBOX_TOKEN: "other" }));
  assert.ok(!isDockToken(undefined, {}));
  assert.ok(!isDockToken("wrong", {}));
});
