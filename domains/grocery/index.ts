// Grocery list (Pirkiniai) — the ONLY public surface of this domain
// (docunest hard rules §3). Route files in app/grocery and app/api/grocery
// import from here and nothing deeper.
export { api, body, BadRequest, type Ctx as ApiCtx } from "./infrastructure/http";
export { isFamilyToken, memberFrom, requireToken, Unauthorized } from "./infrastructure/auth";
export { AiUnavailable } from "./infrastructure/deepseek";
export { mcpHandler } from "./application/mcp";

export { getState } from "./application/getState";
export { getCatalog } from "./application/getCatalog";
export { addItems, type AddRequest } from "./application/addItems";
export { updateEntry } from "./application/updateEntry";
export { finishTrip } from "./application/finishTrip";
export { parseText } from "./application/parseText";
export { suggestFromHistory } from "./application/suggestFromHistory";
export { suggestWithAi } from "./application/suggestWithAi";
export { classifyNew } from "./application/classifyNew";
export { listMembers, rememberMember } from "./application/members";
export { setAisleOrder } from "./application/setAisleOrder";
export { editProduct } from "./application/editProduct";
export { health } from "./application/health";
export { issueAgentToken, listAgentTokens, revokeAgentToken } from "./application/agentTokens";

export type { EntryPatch, ProductPatch } from "./domain/types";
export { App as GroceryApp } from "./ui/App";
