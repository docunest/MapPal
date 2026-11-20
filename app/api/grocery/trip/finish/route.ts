import { api } from "@/lib/grocery/http";
import { finishTrip } from "@/lib/grocery/store";

export const POST = api(async ({ member }) => finishTrip(member));
