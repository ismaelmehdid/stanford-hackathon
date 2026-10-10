import type { Conclusions } from "@/lib/analysis/schema";

type Pattern = Conclusions["amplifyPatterns"][number];

// AI-written lists can repeat an item, so keys combine index and text.

function PatternList({
  title,
  patterns,
}: {
  title: string;
  patterns: Pattern[];
}) {
  if (patterns.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="font-semibold">{title}</h3>
      <ul className="flex flex-col gap-2 text-sm">
        {patterns.map((pattern, index) => (
          <li key={`${index}-${pattern.pattern}`}>
            <p className="font-medium">{pattern.pattern}</p>
            <p className="text-zinc-600 dark:text-zinc-400">
              {pattern.evidence}
            </p>
            <p className="text-xs text-zinc-500">
              Videos: {pattern.videoIds.join(", ")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConclusionsPanel({
  conclusions,
}: {
  conclusions: Conclusions;
}) {
  return (
    <section className="flex flex-col gap-6 rounded-xl bg-zinc-50 p-4 wrap-break-word sm:p-6 dark:bg-zinc-900">
      <h2 className="text-2xl font-semibold">Conclusions</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PatternList
          title="What makes videos work"
          patterns={conclusions.amplifyPatterns}
        />
        <PatternList
          title="What holds videos back"
          patterns={conclusions.stopPatterns}
        />
      </div>
      <PatternList title="Mixed results" patterns={conclusions.observeNotes} />
      <p className="text-sm">
        <span className="font-medium">Emotions behind winners:</span>{" "}
        {conclusions.emotionalTriggers.amplify.join(", ") || "—"} ·{" "}
        <span className="font-medium">behind weak videos:</span>{" "}
        {conclusions.emotionalTriggers.stop.join(", ") || "—"}
      </p>
      {conclusions.replicationBriefs.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">
            Replication briefs for video generation
          </h3>
          {conclusions.replicationBriefs.map((brief, index) => (
            <div
              key={`${index}-${brief.hook}`}
              className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800"
            >
              <p className="font-medium">
                {brief.format.replace(/_/g, " ")} — {brief.hook}
              </p>
              <ol className="mt-2 list-decimal pl-5 text-zinc-600 dark:text-zinc-400">
                {brief.structureBeats.map((beat, beatIndex) => (
                  <li key={`${beatIndex}-${beat}`}>{beat}</li>
                ))}
              </ol>
              <p className="mt-2">
                <span className="font-medium">Triggers:</span>{" "}
                {brief.emotionalTriggers.join(", ")} ·{" "}
                <span className="font-medium">Product:</span>{" "}
                {brief.productRole}
              </p>
              <p>
                <span className="font-medium">Hairstyle variations:</span>{" "}
                {brief.hairstyleVariations.join(" · ")}
              </p>
              <p className="text-xs text-zinc-500">
                Based on: {brief.sourceVideoIds.join(", ")}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
