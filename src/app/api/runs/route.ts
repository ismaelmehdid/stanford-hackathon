import { createRun, listRuns, startRun } from "@/lib/analysis/runs";

export async function GET() {
  return Response.json({ runs: await listRuns() });
}

// Starting a run spends Apify and OpenAI credit. Refuse cross-site requests; requiring
// a JSON content type also forces a CORS preflight that other sites cannot pass.
function isSameSiteJson(request: Request) {
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

export async function POST(request: Request) {
  if (!isSameSiteJson(request)) {
    return Response.json(
      { error: "Send a same-origin application/json request." },
      { status: 403 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    brandUrl?: unknown;
    settings?: unknown;
    caps?: unknown;
  } | null;
  if (typeof body?.brandUrl !== "string") {
    return Response.json({ error: "brandUrl is required." }, { status: 400 });
  }
  // The spec names this field "caps"; accept both.
  const requested = body.settings ?? body.caps;
  const settings =
    typeof requested === "object" && requested !== null ? requested : {};
  try {
    const { run, created } = await createRun(body.brandUrl, settings);
    if (created) startRun(run);
    return Response.json({ run }, { status: created ? 201 : 200 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not start run.",
      },
      { status: 400 },
    );
  }
}
