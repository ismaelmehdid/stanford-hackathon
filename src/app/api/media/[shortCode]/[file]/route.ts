import { readFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "@/lib/analysis/cache";
import { isValidFrameRequest } from "@/lib/analysis/media";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/media/[shortCode]/[file]">,
) {
  const { shortCode, file } = await ctx.params;
  if (!isValidFrameRequest(shortCode, file))
    return new Response("Not found", { status: 404 });
  try {
    const image = await readFile(
      path.join(paths.media(shortCode), "frames", file),
    );
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
