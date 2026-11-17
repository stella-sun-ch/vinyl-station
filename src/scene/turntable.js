import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const DECK = {
  width: 0.46,
  depth: 0.36,
  bodyHeight: 0.055,
  feetHeight: 0.022,
  platterRadius: 0.158,
  platterX: -0.05,
};

function cylinder(radius, height, material, segments = 48) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// The group's origin is the bottom of the feet, centred on the deck.
// A .glb model could replace this as long as it exposes the same userData.
export function createTurntable() {
  const group = new THREE.Group();
  group.name = 'turntable';

  const black = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, metalness: 0.2, roughness: 0.45 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0, roughness: 0.9 });
  const darkMetal = new THREE.MeshPhysicalMaterial({ color: 0x2b2b2e, metalness: 1, roughness: 0.32 });
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xe6e6e8, metalness: 1, roughness: 0.12 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x6d6e72, metalness: 0.4, roughness: 0.6 });

  const top = DECK.feetHeight + DECK.bodyHeight;

  // Body
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(DECK.width, DECK.bodyHeight, DECK.depth, 5, 0.012),
    black,
  );
  body.position.y = DECK.feetHeight + DECK.bodyHeight / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Feet
  const fx = DECK.width / 2 - 0.05;
  const fz = DECK.depth / 2 - 0.05;
  for (const [x, z] of [[-fx, -fz], [fx, -fz], [-fx, fz], [fx, fz]]) {
    const foot = cylinder(0.03, DECK.feetHeight, grey, 32);
    foot.position.set(x, DECK.feetHeight / 2, z);
    group.add(foot);
  }

  // Platter: everything in this group spins with the record.
  const platter = new THREE.Group();
  platter.name = 'platter';
  platter.position.set(DECK.platterX, top, 0);
  group.add(platter);

  const disc = cylinder(DECK.platterRadius, 0.018, darkMetal, 96);
  disc.position.y = 0.009;
  platter.add(disc);

  const mat = cylinder(DECK.platterRadius - 0.01, 0.002, rubber, 96);
  mat.position.y = 0.019;
  platter.add(mat);

  const spindle = cylinder(0.0035, 0.022, chrome, 16);
  spindle.position.y = 0.029;
  platter.add(spindle);

  // Tonearm
  const pivotX = 0.175;
  const pivotZ = -0.105;

  const armBase = cylinder(0.034, 0.012, darkMetal);
  armBase.position.set(pivotX, top + 0.006, pivotZ);
  group.add(armBase);

  const armPost = cylinder(0.012, 0.05, chrome, 24);
  armPost.position.set(pivotX, top + 0.03, pivotZ);
  group.add(armPost);

  // Rotating this group around y swings the arm over the record.
  const tonearm = new THREE.Group();
  tonearm.name = 'tonearm';
  tonearm.position.set(pivotX, top + 0.052, pivotZ);
  tonearm.rotation.order = 'YXZ'; // swing first, then tilt the needle down
  group.add(tonearm);

  const tube = cylinder(0.004, 0.25, chrome, 16);
  tube.rotation.x = Math.PI / 2;
  tube.position.z = 0.075;
  tonearm.add(tube);

  const weight = cylinder(0.017, 0.036, chrome, 32);
  weight.rotation.x = Math.PI / 2;
  weight.position.z = -0.058;
  tonearm.add(weight);

  const gimbal = cylinder(0.016, 0.014, darkMetal, 32);
  tonearm.add(gimbal);

  const headshell = box(0.018, 0.004, 0.044, black);
  headshell.position.set(0, -0.002, 0.212);
  tonearm.add(headshell);

  const cartridge = box(0.014, 0.012, 0.02, grey);
  cartridge.position.set(0, -0.01, 0.216);
  tonearm.add(cartridge);

  // Arm rest
  const rest = cylinder(0.006, 0.042, darkMetal, 16);
  rest.position.set(pivotX - 0.003, top + 0.021, 0.055);
  group.add(rest);

  // Pitch slider
  const slot = box(0.012, 0.002, 0.11, rubber);
  slot.position.set(0.207, top + 0.001, 0.105);
  group.add(slot);

  const pitchKnob = box(0.022, 0.012, 0.012, grey);
  pitchKnob.position.set(0.207, top + 0.007, 0.105);
  pitchKnob.name = 'pitch-knob';
  group.add(pitchKnob);

  // Start button
  const startButton = box(0.05, 0.006, 0.034, grey);
  startButton.position.set(-0.195, top + 0.003, 0.152);
  startButton.name = 'start-button';
  group.add(startButton);

  // Strobe light
  const strobePost = cylinder(0.009, 0.014, darkMetal, 24);
  strobePost.position.set(-0.203, top + 0.007, 0.104);
  group.add(strobePost);

  const strobe = cylinder(0.006, 0.003, new THREE.MeshStandardMaterial({
    color: 0xff2a1f,
    emissive: 0xff2a1f,
    emissiveIntensity: 1.6,
  }), 24);
  strobe.position.set(-0.203, top + 0.0155, 0.104);
  group.add(strobe);

  // The swing angle that puts the needle a given distance from the spindle.
  const armLength = 0.216;
  const toCentreX = DECK.platterX - pivotX;
  const toCentreZ = 0 - pivotZ;
  const reach = Math.hypot(toCentreX, toCentreZ);
  const armAngle = (radius) =>
    Math.atan2(toCentreX, toCentreZ) +
    Math.acos((reach ** 2 + armLength ** 2 - radius ** 2) / (2 * reach * armLength));

  group.userData = {
    platter,
    tonearm,
    startButton,
    armStart: armAngle(0.135), // outer groove
    armEnd: armAngle(0.065), // just outside the label
    armDown: 0.056, // tilt that rests the needle on the record
    // Where a record sits, in the platter's own coordinates.
    recordSeatY: 0.0205,
  };
  return group;
}
