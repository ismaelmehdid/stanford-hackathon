import { soraPricePerSecondUsd } from "@/lib/generation/config";
import { listSources } from "@/lib/generation/sources";

// The browser cannot read SORA_MODEL, so the start form prices takes with the server's value.
// null means SORA_MODEL has no known price; starting a generation then fails with that error.
function currentSoraPrice() {
  try {
    return soraPricePerSecondUsd();
  } catch {
    return null;
  }
}

export async function GET() {
  return Response.json({
    sources: await listSources(),
    soraPricePerSecondUsd: currentSoraPrice(),
  });
}
