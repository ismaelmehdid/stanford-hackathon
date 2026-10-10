import { Suspense } from "react";
import { RunView, RunViewSkeleton } from "./run-view";

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
    <main className="flex w-full flex-1 flex-col">
      <Suspense fallback={<RunViewSkeleton />}>
        <RunViewLoader params={params} />
      </Suspense>
    </main>
  );
}
