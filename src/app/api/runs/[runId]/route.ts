import { getRun } from "@/lib/analysis/runs";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/runs/[runId]">,
) {
  const { runId } = await ctx.params;
  const result = await getRun(runId);
  return result
    ? Response.json(result)
    : Response.json({ error: "Run not found." }, { status: 404 });
}
