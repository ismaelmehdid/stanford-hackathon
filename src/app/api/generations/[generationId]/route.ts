import { getGeneration } from "@/lib/generation/generations";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/generations/[generationId]">,
) {
  const { generationId } = await ctx.params;
  const generation = await getGeneration(generationId);
  return generation
    ? Response.json({ generation })
    : Response.json({ error: "Generation not found." }, { status: 404 });
}
