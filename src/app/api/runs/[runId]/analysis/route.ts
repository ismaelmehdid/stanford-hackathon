import { getRun } from "@/lib/analysis/runs";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/runs/[runId]/analysis">,
) {
  const { runId } = await ctx.params;
  const result = await getRun(runId);
  if (!result?.analysis)
    return Response.json({ error: "Analysis not available." }, { status: 404 });
  return new Response(JSON.stringify(result.analysis, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${runId}.analysis.json"`,
    },
  });
}
