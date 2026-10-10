import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  generationDir,
  isValidGenerationId,
  isValidVideoFile,
} from "@/lib/generation/generations";

type ByteRange = { start: number; end: number };

const notFound = () => new Response("Not found", { status: 404 });

// Reads one "bytes=" range (RFC 9110 section 14.1.2), clamped to the file. Returns null to serve the
// whole file (no header, another unit, or several ranges) and "unsatisfiable" for a range outside it.
function parseRange(
  header: string | null,
  size: number,
): ByteRange | null | "unsatisfiable" {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2])) return null;
  const [, first, last] = match;
  if (!first) {
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  if (start >= size || (last && Number(last) < start)) return "unsatisfiable";
  return { start, end: last ? Math.min(Number(last), size - 1) : size - 1 };
}

// Serves a rendered take. Browsers need byte ranges to seek in a <video>.
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/generations/[generationId]/videos/[file]">,
) {
  const { generationId, file } = await ctx.params;
  if (!isValidGenerationId(generationId) || !isValidVideoFile(file))
    return notFound();
  const filePath = path.join(generationDir(generationId), file);
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) return notFound();

  const headers = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    // Take files are written once (temp file, then rename) and never change.
    "Cache-Control": "public, max-age=86400",
  };
  const range = parseRange(request.headers.get("range"), info.size);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${info.size}` },
    });
  }
  const { start, end } = range ?? { start: 0, end: info.size - 1 };
  const body =
    end < start
      ? null
      : (Readable.toWeb(
          createReadStream(filePath, { start, end }),
        ) as ReadableStream<Uint8Array>);
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      "Content-Length": String(end - start + 1),
      ...(range && { "Content-Range": `bytes ${start}-${end}/${info.size}` }),
    },
  });
}
