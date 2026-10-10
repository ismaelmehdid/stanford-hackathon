"use client";

import { useEffect, useRef, useState } from "react";
import type { StrandsOptions } from "./strands";

// Decorative backdrop. three.js loads after the page, and the page works without WebGL.
export function StrandsCanvas({
  className = "",
  density,
  intensity,
}: StrandsOptions & { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    import("./strands")
      .then(({ mountStrands }) => {
        if (cancelled) return;
        dispose = mountStrands(container, { density, intensity });
        setReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [density, intensity]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none transition-opacity duration-[2000ms] ease-out print:hidden ${ready ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}
