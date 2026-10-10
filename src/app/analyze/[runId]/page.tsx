import { Suspense } from "react";
import { RunView } from "./run-view";

async function RunViewLoader({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <RunView runId={runId} />;
}

export default function RunPage({ params }: PageProps<"/analyze/[runId]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading run…</p>}>
        <RunViewLoader params={params} />
      </Suspense>
    </main>
  );
}
