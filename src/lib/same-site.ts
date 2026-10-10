// Routes that spend Apify or OpenAI credit must only accept requests from this app. Refuse cross-site requests; requiring
// a JSON content type also forces a CORS preflight that other sites cannot pass.
export function isSameSiteJson(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
