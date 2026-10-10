import * as THREE from "three";

export type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  reducedMotion: boolean;
  /** Starts the render loop. Frames only run while the canvas is on screen and the tab is visible. */
  start(onFrame: (elapsedSeconds: number, deltaSeconds: number) => void): void;
  /** Draws one frame without starting the loop. */
  render(): void;
  /** Called after every resize with the container's CSS size. */
  onResize(listener: (width: number, height: number) => void): void;
  dispose(): void;
};

// Shared setup for every scene: a transparent canvas that fills `container`.
export function createStage(
  container: HTMLElement,
  camera: THREE.PerspectiveCamera,
): Stage {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const resizeListeners: ((width: number, height: number) => void)[] = [];
  const timer = new THREE.Timer();
  let frame: ((elapsed: number, delta: number) => void) | null = null;
  let rafId = 0;
  let onScreen = true;
  // Summed from clamped deltas, so animations resume where they paused.
  let elapsed = 0;

  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    resizeListeners.forEach((listener) => listener(width, height));
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  const tick = (timestamp: number) => {
    rafId = requestAnimationFrame(tick);
    timer.update(timestamp);
    const delta = Math.min(timer.getDelta(), 0.1);
    elapsed += delta;
    frame?.(elapsed, delta);
    renderer.render(scene, camera);
  };
  const play = () => {
    if (rafId || !frame || !onScreen || document.hidden) return;
    rafId = requestAnimationFrame(tick);
  };
  const pause = () => {
    cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const intersectionObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) play();
    else pause();
  });
  intersectionObserver.observe(container);
  const onVisibility = () => (document.hidden ? pause() : play());
  document.addEventListener("visibilitychange", onVisibility);

  return {
    renderer,
    scene,
    camera,
    reducedMotion,
    start(onFrame) {
      frame = onFrame;
      play();
    },
    render() {
      renderer.render(scene, camera);
    },
    onResize(listener) {
      resizeListeners.push(listener);
      listener(container.clientWidth, container.clientHeight);
    },
    dispose() {
      pause();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      timer.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : [];
        materials.forEach((material) => {
          Object.values(material).forEach((value) => {
            if (value instanceof THREE.Texture) value.dispose();
          });
          material.dispose();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
