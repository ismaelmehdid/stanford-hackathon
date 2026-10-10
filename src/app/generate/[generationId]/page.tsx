import { Suspense } from "react";
import { GenerationView, GenerationViewSkeleton } from "./generation-view";

async function GenerationViewLoader({
  params,
}: {
  params: Promise<{ generationId: string }>;
}) {
  const { generationId } = await params;
  return <GenerationView generationId={generationId} />;
}

export default function GenerationPage({
  params,
}: PageProps<"/generate/[generationId]">) {
  return (
    <main className="flex w-full flex-1 flex-col">
      <Suspense fallback={<GenerationViewSkeleton />}>
        <GenerationViewLoader params={params} />
      </Suspense>
    </main>
  );
}
