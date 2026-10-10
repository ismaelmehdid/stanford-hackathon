import {
  createGeneration,
  listGenerations,
  startGeneration,
} from "@/lib/generation/generations";
import { isSameSiteJson } from "@/lib/same-site";

export async function GET() {
  return Response.json({ generations: await listGenerations() });
}

export async function POST(request: Request) {
  if (!isSameSiteJson(request)) {
    return Response.json(
      { error: "Send a same-origin application/json request." },
      { status: 403 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    sourceId?: unknown;
    briefIndexes?: unknown;
    settings?: unknown;
  } | null;
  if (typeof body?.sourceId !== "string") {
    return Response.json({ error: "sourceId is required." }, { status: 400 });
  }
  const { briefIndexes, settings } = body;
  // Omitted means every brief; anything else must be a list of brief numbers, so typos never silently drop a brief.
  if (
    briefIndexes != null &&
    !(Array.isArray(briefIndexes) && briefIndexes.every(Number.isInteger))
  ) {
    return Response.json(
      { error: "briefIndexes must be a list of brief numbers." },
      { status: 400 },
    );
  }
  try {
    const generation = await createGeneration({
      sourceId: body.sourceId,
      briefIndexes: (briefIndexes as number[] | undefined) ?? null,
      settings:
        typeof settings === "object" && settings !== null ? settings : {},
    });
    startGeneration(generation);
    return Response.json({ generation }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not start generation.",
      },
      { status: 400 },
    );
  }
}
