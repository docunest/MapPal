import { api, finishTrip } from "@/domains/grocery";

export const POST = api(async ({ member }) => finishTrip(member));
