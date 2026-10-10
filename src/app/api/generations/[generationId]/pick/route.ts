import { isValidGenerationId, pickTake } from "@/lib/generation/generations";
import { isSameSiteJson } from "@/lib/same-site";

const notFound = () =>
  Response.json({ error: "Generation not found." }, { status: 404 });

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/generations/[generationId]/pick">,
) {
  if (!isSameSiteJson(request)) {
    return Response.json(
      { error: "Send a same-origin application/json request." },
      { status: 403 },
    );
  }
  const { generationId } = await ctx.params;
  if (!isValidGenerationId(generationId)) return notFound();
  const body = (await request.json().catch(() => null)) as {
    scriptId?: unknown;
    takeIndex?: unknown;
  } | null;
  if (typeof body?.scriptId !== "string" || !Number.isInteger(body.takeIndex)) {
    return Response.json(
      { error: "scriptId and a whole-number takeIndex are required." },
      { status: 400 },
    );
  }
  try {
    const generation = await pickTake(
      generationId,
      body.scriptId,
      body.takeIndex as number,
    );
    return generation ? Response.json({ generation }) : notFound();
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not save pick.",
      },
      { status: 400 },
    );
  }
}
