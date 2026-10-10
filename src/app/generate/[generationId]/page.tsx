import { Suspense } from "react";
import { GenerationView } from "./generation-view";

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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading generation…</p>}>
        <GenerationViewLoader params={params} />
      </Suspense>
    </main>
  );
}
