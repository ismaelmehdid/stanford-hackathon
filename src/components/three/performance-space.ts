import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/addons/renderers/CSS2DRenderer.js";
import { createStage } from "./stage";

export type SpacePoint = {
  id: string;
  creator: string;
  tier: "amplify" | "observe" | "stop";
  rank: number | null;
  brandScore: number;
  influencerScore: number;
  views: number;
};

const EXTENT = 6;
const numberFormat = new Intl.NumberFormat("en-US", { notation: "compact" });

const formatMultiple = (exponent: number) =>
  exponent >= 0 ? `${2 ** exponent}×` : `1/${2 ** -exponent}×`;

// Maps log2 scores onto the floor, fitted to the data but always showing 1×.
function fitAxis(values: number[]) {
  const low = Math.min(-1, ...values) - 0.6;
  const high = Math.max(1, ...values) + 0.6;
  const toWorld = (value: number) =>
    ((value - low) / (high - low)) * 2 * EXTENT - EXTENT;
  const step = Math.max(1, Math.ceil((high - low) / 6));
  const ticks: number[] = [];
  for (
    let exponent = Math.ceil(low / step) * step;
    exponent <= high;
    exponent += step
  )
    ticks.push(exponent);
  return { toWorld, origin: toWorld(0), ticks };
}

function label(text: string, className: string) {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  return new CSS2DObject(element);
}

function hatchTexture(width: number, depth: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.strokeStyle = "rgba(255,255,255,0.5)";
  context.lineWidth = 2;
  for (let offset = -64; offset <= 64; offset += 16) {
    context.beginPath();
    context.moveTo(offset, 64);
    context.lineTo(offset + 64, 0);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(width / 1.5, depth / 1.5);
  return texture;
}

const LABEL_CLASS =
  "pointer-events-none font-mono text-[10px] tracking-[0.2em] uppercase text-white/45";

// A 3D chart of every scored video: x = score against the brand page, z = score against
// the creator's page (both log scale), height = views. The 1× lines split the tiers.
export function mountPerformanceSpace(
  container: HTMLElement,
  {
    points,
    onSelect,
  }: { points: SpacePoint[]; onSelect: (point: SpacePoint) => void },
) {
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  camera.position.set(15, 11, 17.5);
  const stage = createStage(container, camera);
  const { scene, renderer } = stage;
  // Fades the far side of the floor; distances follow the camera (set on resize).
  const fog = new THREE.Fog(0x000000, 26, 52);
  scene.fog = fog;

  const labels = new CSS2DRenderer();
  labels.domElement.style.position = "absolute";
  labels.domElement.style.inset = "0";
  labels.domElement.style.pointerEvents = "none";
  container.appendChild(labels.domElement);
  stage.onResize((width, height) => labels.setSize(width, height));

  // Lights: a cool key from above and a soft fill, so white boxes read as solid shapes.
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(6, 14, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(-10, 4, -6);
  scene.add(rim);

  const brandAxis = fitAxis(points.map((point) => Math.log2(point.brandScore)));
  const creatorAxis = fitAxis(
    points.map((point) => Math.log2(point.influencerScore)),
  );
  const originX = brandAxis.origin;
  const originZ = creatorAxis.origin;

  // Floor: grid, tier zones split by the two 1× lines, and their labels.
  scene.add(new THREE.GridHelper(EXTENT * 2, 24, 0x2a2a2a, 0x161616));

  const zones: {
    title: string;
    className: string;
    x: [number, number];
    z: [number, number];
    fill: "solid" | "hatch" | null;
  }[] = [
    {
      title: "Amplify",
      className: "text-white/85",
      x: [originX, EXTENT],
      z: [originZ, EXTENT],
      fill: "solid",
    },
    {
      title: "Observe",
      className: "text-white/45",
      x: [originX, EXTENT],
      z: [-EXTENT, originZ],
      fill: "hatch",
    },
    {
      title: "Observe",
      className: "text-white/45",
      x: [-EXTENT, originX],
      z: [originZ, EXTENT],
      fill: "hatch",
    },
    {
      title: "Stop",
      className: "text-white/35",
      x: [-EXTENT, originX],
      z: [-EXTENT, originZ],
      fill: null,
    },
  ];
  for (const zone of zones) {
    const width = zone.x[1] - zone.x[0];
    const depth = zone.z[1] - zone.z[0];
    if (width < 0.01 || depth < 0.01) continue;
    const centerX = (zone.x[0] + zone.x[1]) / 2;
    const centerZ = (zone.z[0] + zone.z[1]) / 2;
    if (zone.fill) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshBasicMaterial(
          zone.fill === "solid"
            ? { color: 0xffffff, transparent: true, opacity: 0.07 }
            : {
                map: hatchTexture(width, depth),
                transparent: true,
                opacity: 0.12,
              },
        ),
      );
      mesh.material.depthWrite = false;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(centerX, 0.001, centerZ);
      scene.add(mesh);
    }
    // Halfway between the zone's center and its outer corner, away from most pillars.
    const zoneLabel = label(
      zone.title,
      `pointer-events-none font-display text-2xl italic ${zone.className}`,
    );
    zoneLabel.position.set(
      (centerX + Math.sign(centerX - originX) * EXTENT) / 2,
      0.05,
      (centerZ + Math.sign(centerZ - originZ) * EXTENT) / 2,
    );
    scene.add(zoneLabel);
  }

  const axisMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
  });
  const axisLine = (from: THREE.Vector3, to: THREE.Vector3) =>
    scene.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from, to]),
        axisMaterial,
      ),
    );
  axisLine(
    new THREE.Vector3(-EXTENT, 0.01, originZ),
    new THREE.Vector3(EXTENT, 0.01, originZ),
  );
  axisLine(
    new THREE.Vector3(originX, 0.01, -EXTENT),
    new THREE.Vector3(originX, 0.01, EXTENT),
  );

  for (const exponent of brandAxis.ticks) {
    const tick = label(formatMultiple(exponent), LABEL_CLASS);
    tick.position.set(brandAxis.toWorld(exponent), 0, EXTENT + 0.6);
    scene.add(tick);
  }
  for (const exponent of creatorAxis.ticks) {
    const tick = label(formatMultiple(exponent), LABEL_CLASS);
    tick.position.set(EXTENT + 0.7, 0, creatorAxis.toWorld(exponent));
    scene.add(tick);
  }
  const axisTitle =
    "pointer-events-none font-mono text-[10px] tracking-[0.2em] uppercase text-white whitespace-nowrap";
  // Axis titles sit between two middle ticks, one row further out.
  const betweenTicks = ({ ticks, toWorld }: ReturnType<typeof fitAxis>) => {
    const middle = Math.max(0, Math.floor((ticks.length - 2) / 2));
    return (
      (toWorld(ticks[middle]) +
        toWorld(ticks[middle + 1] ?? ticks[middle] + 1)) /
      2
    );
  };
  const brandTitle = label("vs brand page →", axisTitle);
  brandTitle.position.set(betweenTicks(brandAxis), 0, EXTENT + 1.7);
  const creatorTitle = label("vs creator page →", axisTitle);
  creatorTitle.position.set(EXTENT + 2.4, 0, betweenTicks(creatorAxis));
  scene.add(brandTitle, creatorTitle);

  // Pillars, one per video.
  const logViews = points.map((point) => Math.log10(point.views + 1));
  const minViews = Math.min(...logViews);
  const viewRange = Math.max(...logViews) - minViews || 1;
  const pillarGeometry = new THREE.BoxGeometry(0.34, 1, 0.34);
  pillarGeometry.translate(0, 0.5, 0);
  const pillarEdges = new THREE.EdgesGeometry(pillarGeometry);
  const ringGeometry = new THREE.RingGeometry(0.32, 0.38, 40);

  type Pillar = {
    point: SpacePoint;
    group: THREE.Group;
    body: THREE.Mesh;
    edges: THREE.LineSegments;
    height: number;
    delay: number;
  };
  const pillars: Pillar[] = points.map((point, index) => {
    const height =
      0.6 + ((Math.log10(point.views + 1) - minViews) / viewRange) * 4.2;
    const group = new THREE.Group();
    group.position.set(
      brandAxis.toWorld(Math.log2(point.brandScore)),
      0,
      creatorAxis.toWorld(Math.log2(point.influencerScore)),
    );

    const body = new THREE.Mesh(
      pillarGeometry,
      new THREE.MeshStandardMaterial({
        color:
          point.tier === "amplify"
            ? 0xffffff
            : point.tier === "observe"
              ? 0x3a3a3a
              : 0x121212,
        roughness: 0.35,
        metalness: 0.05,
        // Pushes faces back so the edge lines on top don't flicker.
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        emissive: point.tier === "amplify" ? 0x2a2a2a : 0x000000,
      }),
    );
    const edges = new THREE.LineSegments(
      pillarEdges,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: point.tier === "stop" ? 0.35 : 0.8,
      }),
    );
    const scaled = new THREE.Group();
    scaled.add(body, edges);
    scaled.scale.y = stage.reducedMotion ? height : 0.001;
    group.add(scaled);

    const ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.003;
    group.add(ring);

    // Amplify videos keep their rank visible (short, so neighbors don't collide).
    // Every pillar shows its details on hover.
    if (point.tier === "amplify" && point.rank !== null) {
      const tag = label(
        String(point.rank).padStart(2, "0"),
        "pointer-events-none rounded-full bg-white px-1.5 py-0.5 font-mono text-[10px] leading-none text-black",
      );
      tag.position.y = height + 0.45;
      group.add(tag);
    }

    scene.add(group);
    body.userData.index = index;
    return {
      point,
      group: scaled,
      body,
      edges,
      height,
      delay: 0.25 + index * 0.06,
    };
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.38;
  controls.autoRotate = !stage.reducedMotion;
  controls.autoRotateSpeed = 0.5;
  controls.addEventListener("start", () => (controls.autoRotate = false));
  // Let vertical swipes scroll the page on touch screens; horizontal drags rotate.
  renderer.domElement.style.touchAction = "pan-y";

  // Narrow charts see less of the floor, so the camera backs off and looks down
  // more steeply, which also fills the taller canvas.
  const view = new THREE.Spherical().setFromVector3(
    camera.position.clone().sub(controls.target),
  );
  const { radius: baseDistance, phi: basePolar } = view;
  const offset = new THREE.Vector3();
  stage.onResize((width, height) => {
    const aspect = width / height;
    view.setFromVector3(offset.subVectors(camera.position, controls.target));
    view.radius = baseDistance * Math.max(1, 1.35 / aspect);
    view.phi = aspect < 1 ? 0.85 : basePolar;
    offset.setFromSpherical(view);
    camera.position.copy(controls.target).add(offset);
    fog.near = offset.length() + 2;
    fog.far = offset.length() + 26;
  });

  // One tooltip, next to the pointer and kept inside the chart.
  const tooltip = document.createElement("div");
  tooltip.className =
    "pointer-events-none absolute top-0 left-0 hidden min-w-44 rounded-lg border border-white/25 bg-black/90 px-3 py-2 font-mono text-[11px] leading-relaxed text-white/70 backdrop-blur";
  container.appendChild(tooltip);
  const fillTooltip = (point: SpacePoint) => {
    const title = document.createElement("div");
    title.className = "mb-0.5 font-sans text-sm text-white";
    title.textContent = `@${point.creator}`;
    const subtitle = document.createElement("div");
    subtitle.className = "mb-1.5 text-[10px] tracking-[0.2em] uppercase";
    subtitle.textContent = `${point.tier}${point.rank ? ` · #${point.rank}` : ""}`;
    const rows = (
      [
        ["vs brand", `${point.brandScore.toFixed(2)}×`],
        ["vs creator", `${point.influencerScore.toFixed(2)}×`],
        ["views", numberFormat.format(point.views)],
      ] as const
    ).map(([name, value]) => {
      const row = document.createElement("div");
      row.className = "flex justify-between gap-4";
      const nameElement = document.createElement("span");
      nameElement.textContent = name;
      const valueElement = document.createElement("span");
      valueElement.className = "text-white";
      valueElement.textContent = value;
      row.append(nameElement, valueElement);
      return row;
    });
    tooltip.replaceChildren(title, subtitle, ...rows);
  };
  const moveTooltip = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const left = Math.min(x + 16, rect.width - tooltip.offsetWidth - 8);
    const top =
      y - tooltip.offsetHeight - 16 < 8
        ? y + 20
        : y - tooltip.offsetHeight - 16;
    tooltip.style.transform = `translate(${Math.max(8, left)}px, ${top}px)`;
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: Pillar | null = null;
  const setHovered = (next: Pillar | null) => {
    if (next === hovered) return;
    if (hovered)
      (hovered.edges.material as THREE.LineBasicMaterial).opacity =
        hovered.point.tier === "stop" ? 0.35 : 0.8;
    hovered = next;
    if (hovered) {
      (hovered.edges.material as THREE.LineBasicMaterial).opacity = 1;
      fillTooltip(hovered.point);
    }
    tooltip.classList.toggle("hidden", !hovered);
    renderer.domElement.style.cursor = hovered ? "pointer" : "grab";
  };
  const pick = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const [hit] = raycaster.intersectObjects(
      pillars.map((pillar) => pillar.body),
    );
    return hit ? pillars[hit.object.userData.index as number] : null;
  };
  let downAt = { x: 0, y: 0 };
  const onPointerMove = (event: PointerEvent) => {
    setHovered(pick(event));
    if (hovered) moveTooltip(event);
  };
  const onPointerDown = (event: PointerEvent) =>
    (downAt = { x: event.clientX, y: event.clientY });
  const onPointerUp = (event: PointerEvent) => {
    // A click, not the end of a drag.
    if (Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 5)
      return;
    const target = pick(event);
    if (target) onSelect(target.point);
  };
  const onPointerLeave = () => setHovered(null);
  renderer.domElement.style.cursor = "grab";
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);

  const easeOut = (value: number) => 1 - Math.pow(1 - value, 3);
  stage.start((elapsed) => {
    for (const pillar of pillars) {
      if (stage.reducedMotion) break;
      const progress = Math.min(1, Math.max(0, (elapsed - pillar.delay) / 1.1));
      pillar.group.scale.y = Math.max(0.001, easeOut(progress) * pillar.height);
    }
    controls.update();
    labels.render(scene, camera);
  });

  return () => {
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
    controls.dispose();
    labels.domElement.remove();
    tooltip.remove();
    stage.dispose();
  };
}
