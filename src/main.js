import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { ARTISTS, loadLibrary } from './data.js';
import { createShelf, shelfTopY } from './scene/shelf.js';
import { createTurntable } from './scene/turntable.js';
import { createRecords, applyCover } from './scene/records.js';
import { createReflection } from './scene/reflection.js';
import { createAudio } from './audio.js';
import { createInteraction } from './interaction.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Renderer ----------
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// The page's CSS gradient shows through as the background.
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 20);
const target = new THREE.Vector3(0, 0.2, 0);

// Pull the camera back on tall, narrow screens so the object still fits.

function frameCamera() {
  const aspect = window.innerWidth / window.innerHeight;

  // Smaller record station with more space around it
  const distance = aspect < 1
    ? 3.0 / Math.max(aspect, 0.75)
    : 3.5;

  const direction = new THREE.Vector3(0.62, 0.52, 1).normalize();

  camera.position.copy(target).addScaledVector(direction, distance);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

frameCamera();

// ---------- Controls ----------
const controls = new OrbitControls(camera, canvas);
controls.target.copy(target);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 1.2;
controls.maxDistance = 5.5;
controls.minPolarAngle = 0.75;
controls.maxPolarAngle = Math.PI / 2 - 0.06; // never under the floor
controls.minAzimuthAngle = -1.1;
controls.maxAzimuthAngle = 1.1;
controls.rotateSpeed = 0.6;
controls.update();

// ---------- Lighting ----------
const loaderEl = document.getElementById('loader');
const loaderPct = document.getElementById('loader-pct');

// One step for the studio lighting, then one per record cover.
const progress = { done: 0, total: 1 + ARTISTS.length };
function stepDone() {
  progress.done += 1;
  loaderPct.textContent = `${Math.round((progress.done / progress.total) * 100)}%`;
  if (progress.done >= progress.total) loaderEl.classList.add('done');
}

const pmrem = new THREE.PMREMGenerator(renderer);
new HDRLoader().load(
  `${import.meta.env.BASE_URL}hdr/studio_small_08_1k.hdr`,
  (hdr) => {
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    stepDone();
  },
  undefined,
  () => {
    // If the studio lighting file can't be loaded, fall back to a built-in room.
    console.warn('Studio HDR could not be loaded; using the built-in room lighting instead.');
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    stepDone();
  },
);

const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(1.2, 2.4, 1.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 6;
key.shadow.camera.left = -1;
key.shadow.camera.right = 1;
key.shadow.camera.top = 1;
key.shadow.camera.bottom = -1;
key.shadow.bias = -0.0004;
key.shadow.radius = 6;
scene.add(key);

// ---------- The station ----------
const station = new THREE.Group();
station.name = 'station';
scene.add(station);

const shelf = createShelf();
station.add(shelf);

const turntable = createTurntable();
turntable.position.y = shelfTopY;
station.add(turntable);

const records = createRecords(ARTISTS);
station.add(records);

// ---------- Albums from iTunes ----------
const creditEl = document.getElementById('credit-apple');
const noticeEl = document.getElementById('notice');
const textureLoader = new THREE.TextureLoader().setCrossOrigin('anonymous');
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
let library = [];

function loadCover(record, entry) {
  return new Promise((resolve) => {
    if (!entry.artworkUrl) return resolve(false);
    textureLoader.load(
      entry.artworkUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = maxAnisotropy;
        applyCover(record, texture, entry);
        resolve(true);
      },
      undefined,
      () => {
        console.warn(`${entry.artist}: the cover could not be loaded.`);
        resolve(false);
      },
    );
  });
}

loadLibrary().then(async (entries) => {
  library = entries;
  window.__station.library = library;

  const covers = await Promise.all(
    entries.map((entry, i) => {
      const record = records.children[i];
      record.userData.entry = entry;
      return loadCover(record, entry).finally(stepDone);
    }),
  );

  // Only credit Apple for what is really on screen.
  creditEl.hidden = !covers.some(Boolean) && !entries.some((e) => e.previewUrl);

  const silent = entries.filter((e) => !e.previewUrl).map((e) => e.artist);
  if (silent.length) {
    noticeEl.textContent =
      silent.length === entries.length
        ? 'Preview unavailable: iTunes could not be reached, so the records show plain covers.'
        : `Preview unavailable for ${silent.join(', ')}.`;
    noticeEl.hidden = false;
  }
});

// A faint shadow on the floor, under the liquid reflection.
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 6),
  new THREE.ShadowMaterial({ opacity: 0.16 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const reflection = createReflection(renderer, camera, canvas);
scene.add(reflection.object);

// ---------- Idle sway ----------
// The station turns slowly from side to side until the user touches it.
let idle = !reducedMotion;
let swayAmount = idle ? 1 : 0;
let swayClock = 0;
let idleTimer;

function onInteract() {
  idle = false;
  clearTimeout(idleTimer);
  if (!reducedMotion) {
    idleTimer = setTimeout(() => {
      idle = true;
    }, 6000);
  }
}
controls.addEventListener('start', onInteract);
canvas.addEventListener('wheel', onInteract, { passive: true });

// ---------- Browsing and playing ----------
const audio = createAudio();
const interaction = createInteraction({
  canvas,
  camera,
  controls,
  station,
  shelf,
  turntable,
  records,
  audio,
  captionEl: document.getElementById('caption'),
  labelEl: document.getElementById('label'),
  reducedMotion,
  onInteract,
});

// ---------- Loop ----------
const timer = new THREE.Timer();

function tick() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);

  swayAmount += ((idle ? 1 : 0) - swayAmount) * Math.min(dt * 2, 1);
  swayClock += dt * swayAmount;
  station.rotation.y = Math.sin(swayClock * 0.35) * 0.32;

  const bass = interaction.update(dt);
  reflection.update(dt, { bass, still: reducedMotion });
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);

window.addEventListener('resize', () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  frameCamera();
  controls.update();
  reflection.resize();
});

// Exposed for debugging in the browser console.
window.__station = { scene, camera, controls, station, turntable, records, reflection, audio };
