import Link from "next/link";
import { StrandsCanvas } from "@/components/three/strands-canvas";
import {
  buttonPrimary,
  buttonSecondary,
  Eyebrow,
  SectionHeader,
  TIER_COPY,
  TierMark,
} from "@/components/ui";

const STEPS = [
  {
    title: "Find",
    body: "Scrape the brand's Instagram page and pick out every collab and credited creator video.",
  },
  {
    title: "Score",
    body: "Compare each video's views, likes and comments with the median video on the brand's page and on the creator's own page.",
  },
  {
    title: "Explain",
    body: "AI watches the frames, reads the transcript and the comments, then writes what separates winners from the rest.",
  },
  {
    title: "Generate",
    body: "Turn the replication briefs into scripts, render storyboard previews of each, and pick the best take.",
  },
];

const TIER_RULES = {
  amplify: "Beats both pages",
  observe: "Beats one page",
  stop: "Beats neither",
} as const;

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative isolate flex min-h-[calc(100svh-3.5rem)] flex-col justify-end overflow-hidden border-b border-line">
        <StrandsCanvas className="absolute inset-0 -z-10" />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-background via-background/30 to-transparent" />
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pt-32 pb-14 sm:px-6 sm:pb-20">
          <Eyebrow className="animate-rise">
            Influencer video analysis · Hair care
          </Eyebrow>
          <h1 className="max-w-5xl animate-rise font-display text-6xl leading-[0.92] tracking-tight [animation-delay:100ms] sm:text-8xl lg:text-[9.5rem]">
            See which videos <em>move</em> people.
          </h1>
          <div className="flex animate-rise flex-col gap-8 [animation-delay:200ms] lg:flex-row lg:items-end lg:justify-between">
            <p className="max-w-xl text-lg text-muted">
              Paste a brand&apos;s Instagram page. Get every influencer video
              tiered, the reasons the best ones work, and storyboard previews of
              new videos built from them.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/analyze" className={`${buttonPrimary} px-7 py-3.5`}>
                Start an analysis →
              </Link>
              <Link
                href="/generate"
                className={`${buttonSecondary} px-7 py-3.5`}
              >
                Generate videos
              </Link>
              <a href="#how" className={`${buttonSecondary} px-7 py-3.5`}>
                How it works
              </a>
            </div>
          </div>
        </div>
      </section>

      <section
        id="how"
        className="mx-auto flex w-full max-w-7xl scroll-mt-14 flex-col gap-12 px-4 py-24 sm:px-6 sm:py-32"
      >
        <SectionHeader
          index="01"
          title="How it works"
          description="One run takes 5–15 minutes and is cached, so re-running a brand is fast."
        />
        <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-16 bg-background p-6 sm:p-8"
            >
              <span className="font-mono text-xs text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-3">
                <h3 className="font-display text-5xl">{step.title}</h3>
                <p className="text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 pb-24 sm:px-6 sm:pb-32">
        <SectionHeader
          index="02"
          title="Three tiers"
          description="A video beats a page when its views, likes and comments are above that page's usual video."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(["amplify", "observe", "stop"] as const).map((tier) => (
            <div
              key={tier}
              className={`flex flex-col gap-12 rounded-3xl p-6 sm:p-8 ${tier === "amplify" ? "bg-foreground text-background" : "border border-line-strong"}`}
            >
              <TierMark
                tier={tier}
                inverted={tier === "amplify"}
                className="size-10 rounded-full"
              />
              <div className="flex flex-col gap-2">
                <p className="font-mono text-[11px] tracking-[0.2em] uppercase opacity-60">
                  {TIER_RULES[tier]}
                </p>
                <h3 className="font-display text-5xl">
                  {TIER_COPY[tier].title}
                </h3>
                <p className="opacity-60">{TIER_COPY[tier].description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-6 px-4 py-12 sm:flex-row sm:items-center sm:px-6">
          <p className="font-display text-3xl">Ready when you are.</p>
          <Link href="/analyze" className={buttonPrimary}>
            Start an analysis →
          </Link>
        </div>
      </footer>
    </main>
  );
}
