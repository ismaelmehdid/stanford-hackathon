import path from "node:path";
import { readJson } from "@/lib/analysis/cache";
import { isPresent } from "@/lib/analysis/instagram";
import { getRun, listRuns } from "@/lib/analysis/runs";
import { BrandAnalysisSchema, type BrandAnalysis } from "@/lib/analysis/schema";

export type GenerationSource = {
  id: string;
  label: string;
  brand: string;
  createdAt: string | null;
  briefs: {
    index: number;
    format: string;
    hook: string;
    hairstyleVariations: string[];
  }[];
};

// Committed sample analyses in samples/, keyed by the name after "sample:".
const SAMPLES: Record<string, string> = {
  headandshoulders: "headandshoulders.analysis.json",
};

type LoadedSource = {
  analysis: BrandAnalysis;
  label: string;
  createdAt: string | null;
};

// Only analyses with at least one replication brief can be turned into scripts.
function usable(value: unknown): BrandAnalysis | null {
  const parsed = BrandAnalysisSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.conclusions?.replicationBriefs.length ? parsed.data : null;
}

const formatTimestamp = (iso: string) =>
  `${iso.slice(0, 16).replace("T", " ")} UTC`;

async function readSource(sourceId: string): Promise<LoadedSource | null> {
  const separator = sourceId.indexOf(":");
  if (separator < 0) return null;
  const kind = sourceId.slice(0, separator);
  const name = sourceId.slice(separator + 1);

  if (kind === "sample") {
    if (!Object.hasOwn(SAMPLES, name)) return null;
    const analysis = usable(
      // A literal "samples" segment keeps Next's file tracing scoped to that folder.
      await readJson(path.join(process.cwd(), "samples", SAMPLES[name])),
    );
    if (!analysis) return null;
    return {
      analysis,
      label: `Sample: @${analysis.brand.username}`,
      createdAt: null,
    };
  }

  if (kind === "run") {
    // getRun rejects invalid (traversal) ids and only loads completed analyses.
    const stored = await getRun(name);
    if (!stored || stored.run.status !== "completed") return null;
    const analysis = usable(stored.analysis);
    if (!analysis) return null;
    return {
      analysis,
      label: `@${analysis.brand.username} · run ${formatTimestamp(stored.run.createdAt)}`,
      createdAt: stored.run.createdAt,
    };
  }

  return null;
}

function toSource(
  id: string,
  { analysis, label, createdAt }: LoadedSource,
): GenerationSource {
  return {
    id,
    label,
    brand: analysis.brand.username,
    createdAt,
    briefs: (analysis.conclusions?.replicationBriefs ?? []).map(
      (brief, index) => ({
        index,
        format: brief.format,
        hook: brief.hook,
        hairstyleVariations: brief.hairstyleVariations,
      }),
    ),
  };
}

// Completed runs newest first, then the committed samples. Unreadable sources are skipped.
export async function listSources(): Promise<GenerationSource[]> {
  const runIds = (await listRuns())
    .filter((run) => run.status === "completed")
    .map((run) => `run:${run.id}`);
  const sampleIds = Object.keys(SAMPLES).map((name) => `sample:${name}`);
  const sources = await Promise.all(
    [...runIds, ...sampleIds].map(async (id) => {
      const loaded = await readSource(id).catch((error: unknown) => {
        console.error(`Generation source ${id} could not be read`, error);
        return null;
      });
      return loaded ? toSource(id, loaded) : null;
    }),
  );
  return sources.filter(isPresent);
}

export async function loadAnalysis(sourceId: string): Promise<BrandAnalysis> {
  const loaded = await readSource(sourceId);
  if (!loaded) throw new Error("Unknown source.");
  return loaded.analysis;
}
