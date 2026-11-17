import * as THREE from 'three';
import { shelfFloorY, shelfInnerLeftX } from './shelf.js';

export const SLEEVE = {
  size: 0.315, // a 12-inch sleeve
  thickness: 0.007,
  spacing: 0.021,
  lean: 0.06, // radians, leaning against the left wall
};

// Black or white text, whichever reads better on the given colour.
function inkFor(hex) {
  const c = new THREE.Color(hex);
  const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return luminance > 0.45 ? '#111113' : '#f5f5f5';
}

// A plain coloured cover with the artist's name. It is the placeholder for
// now, and later the fallback when the artwork can't be loaded.
function placeholderCover({ artist, colour }) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = inkFor(colour);
  ctx.font = '600 44px Geist, Inter, system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(artist, 40, size - 44);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createRecord(entry, index) {
  const cover = placeholderCover(entry);
  const side = new THREE.MeshStandardMaterial({ color: entry.colour, roughness: 0.7 });
  const front = new THREE.MeshStandardMaterial({ map: cover, roughness: 0.55 });
  const back = new THREE.MeshStandardMaterial({ color: entry.colour, roughness: 0.6 });

  // Box faces are ordered +x, -x, +y, -y, +z, -z. The cover faces +x (towards
  // the open side of the shelf) and the spine faces +z (the front).
  const sleeve = new THREE.Mesh(
    new THREE.BoxGeometry(SLEEVE.thickness, SLEEVE.size, SLEEVE.size),
    [front, back, side, side, side, side],
  );
  sleeve.position.y = SLEEVE.size / 2;
  sleeve.castShadow = true;
  sleeve.receiveShadow = true;
  sleeve.name = 'sleeve';

  // The group's origin is the bottom edge, so the record leans from its base.
  const record = new THREE.Group();
  record.name = `record-${entry.id}`;
  record.add(sleeve);
  record.position.set(shelfInnerLeftX + 0.03 + index * SLEEVE.spacing, shelfFloorY, 0);
  // Slight, repeatable variation so the row doesn't look machine-made.
  const jitter = ((index * 37) % 7) / 7 - 0.5;
  record.rotation.z = SLEEVE.lean + jitter * 0.012;
  record.position.z = jitter * 0.006;

  record.userData = { entry, index, sleeve, materials: { front, back, side }, home: record.position.clone(), homeLean: record.rotation.z };
  return record;
}

export function createRecords(entries) {
  const group = new THREE.Group();
  group.name = 'records';
  entries.forEach((entry, i) => group.add(createRecord(entry, i)));
  return group;
}

// The average colour of an image, used for the spine and back of the sleeve.
function averageColour(image) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  } catch {
    return null;
  }
}

// Swaps the placeholder for the real album cover.
export function applyCover(record, texture, entry) {
  const { front, back, side } = record.userData.materials;
  front.map?.dispose();
  front.map = texture;
  front.needsUpdate = true;
  const colour = averageColour(texture.image);
  if (colour) {
    side.color.copy(colour);
    back.color.copy(colour);
  }
  record.userData.entry = entry;
  record.userData.disc?.userData.labelMaterial.setValues({ map: texture });
}

export const DISC_RADIUS = 0.15;

// Fine concentric grooves, shared by every disc.
let grooves = null;
function grooveTexture() {
  if (grooves) return grooves;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(0, 0, size, size);
  for (let r = 92; r < 250; r += 2) {
    const shade = 20 + ((r * 53) % 23);
    ctx.strokeStyle = `rgb(${shade}, ${shade}, ${shade + 2})`;
    ctx.lineWidth = r % 34 === 0 ? 2.5 : 1;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  grooves = new THREE.CanvasTexture(canvas);
  grooves.colorSpace = THREE.SRGBColorSpace;
  grooves.anisotropy = 8;
  return grooves;
}

// The vinyl that lives inside a sleeve, with the cover as its centre label.
// Its origin is its centre and it lies flat (axis along y).
export function createDisc(record) {
  const disc = new THREE.Group();
  disc.name = 'disc';

  const face = new THREE.MeshPhysicalMaterial({
    map: grooveTexture(),
    roughness: 0.32,
    metalness: 0.1,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
  });
  const edge = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.4 });
  const vinyl = new THREE.Mesh(
    new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS, 0.003, 96),
    [edge, face, face],
  );
  vinyl.castShadow = true;
  disc.add(vinyl);

  const labelMaterial = new THREE.MeshStandardMaterial({
    map: record.userData.materials.front.map,
    roughness: 0.7,
  });
  const labelGeometry = new THREE.CircleGeometry(0.048, 64);
  const top = new THREE.Mesh(labelGeometry, labelMaterial);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.0017;
  const bottom = new THREE.Mesh(labelGeometry, labelMaterial);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -0.0017;
  disc.add(top, bottom);

  disc.userData.labelMaterial = labelMaterial;
  disc.visible = false;
  return disc;
}
