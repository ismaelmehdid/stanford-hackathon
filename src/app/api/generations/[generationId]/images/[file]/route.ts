import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  generationDir,
  isValidGenerationId,
  isValidImageFile,
} from "@/lib/generation/generations";

const notFound = () => new Response("Not found", { status: 404 });

// Serves one storyboard frame. Both names are validated, so the path cannot leave the generation dir.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/generations/[generationId]/images/[file]">,
) {
  const { generationId, file } = await ctx.params;
  if (!isValidGenerationId(generationId) || !isValidImageFile(file))
    return notFound();
  const dir = generationDir(generationId);
  const filePath = path.join(dir, file);
  if (path.dirname(filePath) !== dir) return notFound();
  // A missing file or a directory with a frame name reads as an error, so both become 404.
  const bytes = await readFile(filePath).catch(() => null);
  if (!bytes) return notFound();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      // Frames are written once (temp file, then rename), but a generation's images stay private to its viewer.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
