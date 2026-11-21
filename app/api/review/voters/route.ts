import { newVoter, voters } from "@/lib/review";
import { handle } from "../http";

// Name handles (docunest hard rules §5): GET the list, POST {name} to add one.
export const GET = () => handle(async () => ({ voters: await voters() }));
export const POST = (req: Request) => handle(async () => ({ name: await newVoter((await req.json().catch(() => ({}))).name) }));
