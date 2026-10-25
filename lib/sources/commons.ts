// Wikimedia Commons: real photos of the place — its own photo category when
// Wikidata knows it, otherwise geotagged photos taken right there.
import {
  claimValues,
  commonsCategoryPhotos,
  commonsPhotosNear,
  wikidataEntities,
  type CommonsPhoto,
  type WikidataEntity,
} from "../wikimedia";
import type { Source } from "./types";

export const commonsSource: Source = {
  meta: {
    id: "commons",
    label: "Wikimedia Commons",
    type: "photos",
    cost: "free",
    ai: false,
    homepage: "https://commons.wikimedia.org",
    description: "Free photos: the place's own photo collection, or photos geotagged right there.",
    priority: 40,
  },
  configured: () => true,
  async details(place) {
    if (place.mode !== "sight") return [];
    let photos: CommonsPhoto[] = [];
    let url: string | undefined;
    if (place.wikidata) {
      const entities = await wikidataEntities([place.wikidata], "claims").catch(() => ({}) as Record<string, WikidataEntity>);
      const cat = claimValues(entities[place.wikidata], "P373")[0];
      if (typeof cat === "string") {
        photos = await commonsCategoryPhotos(cat, 16).catch(() => []);
        url = `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(cat)}`;
      }
    }
    if (photos.length < 4) {
      const near = await commonsPhotosNear(place, 250, 16).catch(() => []);
      photos = [...photos, ...near.filter((p) => !photos.some((x) => x.file === p.file))];
    }
    if (!photos.length) return [];
    return [
      {
        id: "commons:photos",
        source: "commons",
        title: "Photos",
        url,
        section: { kind: "photos", photos: photos.slice(0, 16).map((p) => ({ thumb: p.thumb, page: p.page })) },
      },
    ];
  },
};
