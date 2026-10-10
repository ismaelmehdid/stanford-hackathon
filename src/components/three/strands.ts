import * as THREE from "three";
import { createStage } from "./stage";

export type StrandsOptions = {
  /** 0–1. Scales the number of strands and dust particles. */
  density?: number;
  /** Overall brightness, 0–1. */
  intensity?: number;
};

// Every strand is a polyline whose shape is computed on the GPU: a flowing, fanning
// lock of hair that curls around its path and sways over time.
const strandVertexShader = /* glsl */ `
  uniform float uTime;
  attribute vec4 aSeed;
  varying float vAlpha;

  void main() {
    float t = position.x;
    float time = uTime;

    float x = mix(-9.0, 9.0, t);
    float wave = sin(t * 3.1 - time * 0.45) * 1.05 + sin(t * 1.4 + time * 0.27) * 0.55;
    float fan = mix(0.1, 2.5, pow(t, 1.35));
    float y = wave * smoothstep(0.0, 0.55, t) + (aSeed.x - 0.5) * 2.0 * fan;
    float z = (aSeed.y - 0.5) * 1.8 * fan;

    float curlRadius = (0.04 + 0.32 * t * t) * (0.35 + aSeed.z);
    float angle = t * (7.0 + 9.0 * aSeed.z) - time * (0.5 + aSeed.w * 0.8) + aSeed.w * 6.2831;
    y += cos(angle) * curlRadius;
    z += sin(angle) * curlRadius;
    y += sin(t * 6.0 - time * 1.1 + aSeed.x * 3.0) * 0.16 * t;

    vec4 viewPosition = modelViewMatrix * vec4(x, y, z, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float ends = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.78, 1.0, t));
    float depth = smoothstep(-15.0, -6.0, viewPosition.z);
    vAlpha = ends * (0.1 + 0.9 * aSeed.w * aSeed.w) * mix(0.3, 1.0, depth);
  }
`;

const strandFragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vec3(1.0), vAlpha * uOpacity);
  }
`;

const dustVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute vec4 aSeed;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.1 + aSeed.x * 6.28) * 0.4;
    p.y += mod(uTime * (0.05 + aSeed.y * 0.1) + aSeed.z * 8.0, 8.0) - 4.0;
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = (1.0 + aSeed.w * 2.5) * uPixelRatio * (8.0 / -viewPosition.z);
    vAlpha = (0.25 + 0.75 * aSeed.w) * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed.y) + aSeed.x * 10.0));
  }
`;

const dustFragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.0, d) * vAlpha * uOpacity);
  }
`;

function strandGeometry(strands: number, pointsPerStrand: number) {
  const positions = new Float32Array(strands * pointsPerStrand * 3);
  const seeds = new Float32Array(strands * pointsPerStrand * 4);
  const indices: number[] = [];
  for (let strand = 0; strand < strands; strand++) {
    // Gaussian-ish spread keeps the lock dense in the middle and wispy at the edges.
    const seed = [
      (Math.random() + Math.random() + Math.random()) / 3,
      (Math.random() + Math.random()) / 2,
      Math.random(),
      Math.random(),
    ];
    for (let point = 0; point < pointsPerStrand; point++) {
      const vertex = strand * pointsPerStrand + point;
      positions[vertex * 3] = point / (pointsPerStrand - 1);
      seeds.set(seed, vertex * 4);
      if (point > 0) indices.push(vertex - 1, vertex);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  geometry.setIndex(indices);
  return geometry;
}

function dustGeometry(count: number) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let index = 0; index < count; index++) {
    positions.set(
      [
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 10,
      ],
      index * 3,
    );
    seeds.set(
      [Math.random(), Math.random(), Math.random(), Math.random()],
      index * 4,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  return geometry;
}

export function mountStrands(
  container: HTMLElement,
  { density = 1, intensity = 1 }: StrandsOptions = {},
) {
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 11);
  const stage = createStage(container, camera);
  const small = container.clientWidth < 640;
  const strandCount = Math.round((small ? 380 : 900) * density);

  const strandUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: (small ? 0.5 : 0.36) * intensity },
  };
  const strands = new THREE.LineSegments(
    strandGeometry(strandCount, small ? 64 : 96),
    new THREE.ShaderMaterial({
      uniforms: strandUniforms,
      vertexShader: strandVertexShader,
      fragmentShader: strandFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  strands.frustumCulled = false;

  const dustUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: stage.renderer.getPixelRatio() },
    uOpacity: { value: 0.7 * intensity },
  };
  const dust = new THREE.Points(
    dustGeometry(Math.round(260 * density)),
    new THREE.ShaderMaterial({
      uniforms: dustUniforms,
      vertexShader: dustVertexShader,
      fragmentShader: dustFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  dust.frustumCulled = false;

  const lock = new THREE.Group();
  lock.rotation.set(0.15, -0.25, 0.22);
  lock.add(strands);
  stage.scene.add(lock, dust);

  // Narrow screens see less width, so pull the camera back to keep the curve in view.
  stage.onResize((width, height) => {
    camera.position.z = width / height < 1 ? 17 : 11;
  });

  if (stage.reducedMotion) {
    strandUniforms.uTime.value = 4;
    dustUniforms.uTime.value = 4;
    stage.onResize(() => stage.render());
  } else {
    stage.start((elapsed) => {
      strandUniforms.uTime.value = elapsed;
      dustUniforms.uTime.value = elapsed;
    });
  }

  return () => stage.dispose();
}
