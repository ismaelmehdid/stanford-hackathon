import { imageQuality } from "@/lib/generation/config";
import { listSources } from "@/lib/generation/sources";

// The browser cannot read PREVIEW_IMAGE_QUALITY, so the start form prices images with the server's value.
// null means PREVIEW_IMAGE_QUALITY is not supported; starting a generation then fails with that error.
function currentImageQuality() {
  try {
    return imageQuality();
  } catch {
    return null;
  }
}

export async function GET() {
  return Response.json({
    sources: await listSources(),
    imageQuality: currentImageQuality(),
  });
}
