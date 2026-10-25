// Nominatim (OpenStreetMap geocoder): the street address of a place.
import { reverseAddress } from "../nominatim";
import type { Source } from "./types";

export const nominatimSource: Source = {
  meta: {
    id: "nominatim",
    label: "Nominatim (OpenStreetMap)",
    type: "address",
    cost: "free",
    ai: false,
    homepage: "https://nominatim.openstreetmap.org",
    attribution: "© OpenStreetMap contributors",
    description: "Street address of a place, from OpenStreetMap.",
    priority: 60,
  },
  configured: () => true,
  async details(place) {
    const address = await reverseAddress(place, place.userLang);
    return address
      ? [{ id: "nominatim:address", source: "nominatim", title: "Address", section: { kind: "address", address } }]
      : [];
  },
};
