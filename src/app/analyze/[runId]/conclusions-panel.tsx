import { Eyebrow, SectionHeader, TierMark } from "@/components/ui";
import type { AnalyzedVideo, Conclusions } from "@/lib/analysis/schema";
import { humanize, splitTimestamp } from "./format";

type Pattern = Conclusions["amplifyPatterns"][number];
type VideoLookup = Map<string, AnalyzedVideo>;

// AI-written lists can repeat an item, so keys combine index and text.

/** Links to the cards of the videos a finding is based on. */
function VideoChips({ ids, videos }: { ids: string[]; videos: VideoLookup }) {
  if (ids.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ids.map((id, index) => {
        const video = videos.get(id);
        return (
          <li key={`${index}-${id}`}>
            <a
              href={`#video-${id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-muted transition hover:border-foreground hover:text-foreground"
            >
              {video && <TierMark tier={video.tier} className="size-2" />}
              {video ? `@${video.creator}` : id}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function PatternList({
  title,
  mark,
  patterns,
  videos,
}: {
  title: string;
  mark: "+" | "−" | "~";
  patterns: Pattern[];
  videos: VideoLookup;
}) {
  if (patterns.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`grid size-7 place-items-center rounded-full font-mono text-sm ${mark === "+" ? "bg-foreground text-background" : "border border-line-strong"}`}
        >
          {mark}
        </span>
        <h3 className="text-lg font-medium">{title}</h3>
      </div>
      <ol className="flex flex-col">
        {patterns.map((pattern, index) => (
          <li
            key={`${index}-${pattern.pattern}`}
            className="grid grid-cols-[2.5rem_1fr] gap-x-2 border-t border-line py-6"
          >
            <span className="font-mono text-xs text-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="flex min-w-0 flex-col gap-3">
              <p className="font-display text-2xl leading-tight">
                {pattern.pattern}
              </p>
              <p className="text-sm leading-relaxed text-muted">
                {pattern.evidence}
              </p>
              <VideoChips ids={pattern.videoIds} videos={videos} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function FindingsSection({
  conclusions,
  videos,
}: {
  conclusions: Conclusions;
  videos: VideoLookup;
}) {
  return (
    <section id="findings" className="flex scroll-mt-20 flex-col gap-10">
      <SectionHeader
        index="02"
        title="Findings"
        description="Patterns that separate the videos that beat both pages from the ones that fell behind."
      />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
        <PatternList
          title="What makes videos work"
          mark="+"
          patterns={conclusions.amplifyPatterns}
          videos={videos}
        />
        <PatternList
          title="What holds videos back"
          mark="−"
          patterns={conclusions.stopPatterns}
          videos={videos}
        />
      </div>
      {conclusions.observeNotes.length > 0 && (
        <div className="rounded-3xl border border-line p-5 sm:p-8">
          <PatternList
            title="Mixed results"
            mark="~"
            patterns={conclusions.observeNotes}
            videos={videos}
          />
        </div>
      )}
    </section>
  );
}

export function TriggersSection({
  triggers,
}: {
  triggers: Conclusions["emotionalTriggers"];
}) {
  const columns = [
    {
      title: "Behind the winners",
      items: triggers.amplify,
      inverted: true,
    },
    { title: "Behind the weak videos", items: triggers.stop, inverted: false },
  ];
  return (
    <section id="triggers" className="flex scroll-mt-20 flex-col gap-10">
      <SectionHeader
        index="03"
        title="Emotional triggers"
        description="What viewers felt, read from the videos and their comments."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {columns.map(({ title, items, inverted }) => (
          <div
            key={title}
            className={`flex flex-col gap-5 rounded-3xl p-6 sm:p-8 ${inverted ? "bg-foreground text-background" : "border border-line-strong"}`}
          >
            <Eyebrow className={inverted ? "text-background/60" : ""}>
              {title}
            </Eyebrow>
            {items.length === 0 ? (
              <p className="opacity-60">None found.</p>
            ) : (
              <ul className="flex flex-col">
                {items.map((item, index) => (
                  <li
                    key={`${index}-${item}`}
                    className={`flex gap-4 border-t py-3.5 text-[15px] leading-snug ${inverted ? "border-background/15" : "border-line"}`}
                  >
                    <span className="font-mono text-xs opacity-50">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function BriefsSection({
  briefs,
  videos,
}: {
  briefs: Conclusions["replicationBriefs"];
  videos: VideoLookup;
}) {
  if (briefs.length === 0) return null;
  return (
    <section id="briefs" className="flex scroll-mt-20 flex-col gap-10">
      <SectionHeader
        index="04"
        title="Replication briefs"
        description="Scripts-in-waiting for video generation, each modeled on what already worked."
      />
      <div className="flex flex-col gap-6">
        {briefs.map((brief, index) => (
          <article
            key={`${index}-${brief.hook}`}
            className="grid grid-cols-1 overflow-hidden rounded-3xl border border-line bg-panel lg:grid-cols-[1.25fr_1fr]"
          >
            <div className="flex flex-col gap-8 p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs text-muted">
                  Brief {String(index + 1).padStart(2, "0")}
                </span>
                <span className="rounded-full bg-foreground px-3 py-1 text-xs text-background">
                  {humanize(brief.format)}
                </span>
                {brief.basedOnTier === "observe" && (
                  <span className="rounded-full border border-line-strong px-3 py-1 text-xs">
                    No Amplify videos yet · based on Observe
                  </span>
                )}
              </div>
              <div>
                <Eyebrow>Hook</Eyebrow>
                <p className="mt-3 font-display text-3xl leading-[1.15] sm:text-4xl">
                  {brief.hook}
                </p>
              </div>
              <div>
                <Eyebrow>Structure</Eyebrow>
                <ol className="relative mt-4 flex flex-col gap-5 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-line-strong">
                  {brief.structureBeats.map((beat, beatIndex) => {
                    const { time, text } = splitTimestamp(beat);
                    return (
                      <li
                        key={`${beatIndex}-${beat}`}
                        className="relative grid grid-cols-[1fr] gap-1 pl-8"
                      >
                        <span className="absolute top-1.5 left-0 size-[11px] rounded-full border border-foreground bg-background" />
                        {time && (
                          <span className="font-mono text-[11px] text-muted">
                            {time}
                          </span>
                        )}
                        <span className="text-sm leading-relaxed">{text}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
            <div className="flex flex-col gap-8 border-t border-line bg-panel-raised p-6 sm:p-8 lg:border-t-0 lg:border-l">
              <div>
                <Eyebrow>Product role</Eyebrow>
                <p className="mt-3 text-sm leading-relaxed">
                  {brief.productRole}
                </p>
              </div>
              <div>
                <Eyebrow>Emotional triggers</Eyebrow>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {brief.emotionalTriggers.map((trigger, triggerIndex) => (
                    <li
                      key={`${triggerIndex}-${trigger}`}
                      className="rounded-full border border-line-strong px-3 py-1 text-xs"
                    >
                      {trigger}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <Eyebrow>Hairstyle variations</Eyebrow>
                <ol className="mt-3 flex flex-col">
                  {brief.hairstyleVariations.map((style, styleIndex) => (
                    <li
                      key={`${styleIndex}-${style}`}
                      className="flex gap-3 border-t border-line py-2.5 text-sm"
                    >
                      <span className="font-mono text-xs text-muted">
                        {String.fromCharCode(65 + styleIndex)}
                      </span>
                      {style}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="mt-auto">
                <Eyebrow>Based on</Eyebrow>
                <div className="mt-3">
                  <VideoChips ids={brief.sourceVideoIds} videos={videos} />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
