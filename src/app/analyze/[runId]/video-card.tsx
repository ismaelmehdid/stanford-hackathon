import Image from "next/image";
import { EMOTIONS, type AnalyzedVideo } from "@/lib/analysis/schema";

const numberFormat = new Intl.NumberFormat("en-US", { notation: "compact" });
const EMOTION_COLORS = [
  "bg-rose-400",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-amber-400",
  "bg-violet-500",
  "bg-pink-500",
  "bg-lime-500",
  "bg-orange-500",
  "bg-red-700",
  "bg-zinc-400",
];

const score = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(2)}×`;

export function VideoCard({ video }: { video: AnalyzedVideo }) {
  const analysis = video.videoAnalysis;
  const comments = video.commentAnalysis;
  const step = Math.max(1, Math.ceil(video.frames.length / 6));
  const frames = video.frames
    .filter((_, index) => index % step === 0)
    .slice(0, 6);

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-zinc-200 p-4 wrap-break-word dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold hover:underline"
        >
          #{video.rank} @{video.creator}
        </a>
        <span className="text-xs text-zinc-500">
          {video.source} · {video.postedAt.slice(0, 10)}
        </span>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {numberFormat.format(video.metrics.views)} views ·{" "}
        {video.metrics.likes === null
          ? "hidden"
          : numberFormat.format(video.metrics.likes)}{" "}
        likes · {numberFormat.format(video.metrics.comments)} comments · brand{" "}
        {score(video.brandScore)} · creator {score(video.influencerScore)}
      </p>
      {frames.length > 0 && (
        <div className="flex gap-1 overflow-x-auto">
          {frames.map((frame) => (
            <Image
              key={frame.file}
              src={`/api/media/${video.shortCode}/${frame.file}`}
              alt={`Frame at ${frame.timestampSeconds}s`}
              width={72}
              height={128}
              unoptimized
              className="h-32 w-auto shrink-0 rounded object-cover"
            />
          ))}
        </div>
      )}
      {video.status === "failed" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Analysis failed: {video.error}
        </p>
      )}
      {video.status === "analyzed" && video.error && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {video.error}
        </p>
      )}
      {analysis && (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            <span className="rounded bg-zinc-100 px-2 py-0.5 font-medium dark:bg-zinc-800">
              {analysis.videoType.replace(/_/g, " ")}
            </span>{" "}
            {analysis.hairstyle.styleAchieved}
          </p>
          <p>
            <span className="font-medium">Hook:</span>{" "}
            {analysis.hook.description}{" "}
            <span className="text-zinc-500">{analysis.hook.whyItWorks}</span>
          </p>
          <details>
            <summary className="cursor-pointer font-medium">
              Description
            </summary>
            <p className="mt-1 whitespace-pre-line text-zinc-600 dark:text-zinc-400">
              {analysis.description}
            </p>
            {video.transcript && (
              <p className="mt-2 text-zinc-500 italic">“{video.transcript}”</p>
            )}
          </details>
        </div>
      )}
      {comments && (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            {EMOTIONS.map((emotion, index) => (
              <div
                key={emotion}
                title={`${emotion.replace(/_/g, " ")} ${Math.round(comments.emotions[emotion] * 100)}%`}
                className={EMOTION_COLORS[index]}
                style={{ width: `${comments.emotions[emotion] * 100}%` }}
              />
            ))}
          </div>
          <p className="text-zinc-500">
            Mostly {comments.dominantEmotion.replace(/_/g, " ")} · purchase
            intent {comments.purchaseIntent}
          </p>
          {comments.quotes.map((quote, index) => (
            <p
              // Quotes are AI-selected comments and may repeat.
              key={`${index}-${quote}`}
              className="border-l-2 border-zinc-300 pl-2 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            >
              {quote}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}
