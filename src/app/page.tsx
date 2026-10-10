import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">
        Stanford Hackathon
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Edit <code className="font-mono">src/app/page.tsx</code> to get started.
      </p>
      <div className="flex gap-6">
        <Link href="/analyze" className="font-medium underline">
          Influencer video analysis
        </Link>
        <Link href="/generate" className="font-medium underline">
          Video generation
        </Link>
      </div>
    </main>
  );
}
