import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

import vertexShader from '../shaders/reflection.vert.glsl?raw';
import fragmentShader from '../shaders/reflection.frag.glsl?raw';

// The mirror is rendered at half the screen resolution; the liquid distortion
// hides the difference and it halves the cost.
function targetSize(renderer) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  return [Math.max(Math.round(size.x / 2), 2), Math.max(Math.round(size.y / 2), 2)];
}

export function createReflection(renderer, camera, domElement) {
  const [width, height] = targetSize(renderer);

  const mirror = new Reflector(new THREE.PlaneGeometry(5, 5), {
    textureWidth: width,
    textureHeight: height,
    clipBias: 0.001,
    shader: {
      name: 'LiquidReflection',
      uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(10, 10) },
        uMouseStrength: { value: 0 },
        uBass: { value: 0 },
        uLiquid: { value: new THREE.Color(0x030304) },
        uSheen: { value: new THREE.Color(0xf4f4f4) },
      },
      vertexShader,
      fragmentShader,
    },
  });
  mirror.name = 'reflection';
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = 0.001;
  mirror.material.transparent = true;
  mirror.material.depthWrite = false;
  mirror.renderOrder = 1;

  const uniforms = mirror.material.uniforms;

  // Follow the pointer to where it meets the floor.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const mouseTarget = new THREE.Vector2(10, 10);
  let energy = 0;
  let seen = false;

  domElement.addEventListener('pointermove', (event) => {
    const rect = domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(floorPlane, hit)) {
      mouseTarget.set(hit.x, hit.z);
      if (!seen) {
        uniforms.uMouse.value.copy(mouseTarget);
        seen = true;
      }
      energy = 1;
    }
  });
  domElement.addEventListener('pointerleave', () => {
    energy = 0;
  });

  return {
    object: mirror,

    // `still` freezes the liquid for people who prefer reduced motion.
    update(dt, { bass = 0, still = false } = {}) {
      if (still) return;
      uniforms.uTime.value += dt;
      uniforms.uBass.value += (bass - uniforms.uBass.value) * Math.min(dt * 8, 1);
      uniforms.uMouse.value.lerp(mouseTarget, Math.min(dt * 6, 1));
      // Movement gives a strong ripple that settles to a gentle one.
      energy = Math.max(energy - dt * 0.8, seen ? 0.35 : 0);
      const strength = uniforms.uMouseStrength;
      strength.value += (energy - strength.value) * Math.min(dt * 5, 1);
    },

    resize() {
      const [w, h] = targetSize(renderer);
      mirror.getRenderTarget().setSize(w, h);
    },
  };
}
