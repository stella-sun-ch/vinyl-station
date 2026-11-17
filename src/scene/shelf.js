import * as THREE from 'three';

// Shelf dimensions in metres. Everything else is placed relative to these.
export const SHELF = {
  width: 0.64, // outer box, centre line to centre line
  height: 0.37,
  depth: 0.36,
  legHeight: 0.13, // how far the folded foot lifts the box off the floor
  legGap: 0.02, // half the distance between the two leg sheets
  thickness: 0.012,
  radius: 0.045,
};

// Handy derived positions for placing things on or in the shelf.
export const shelfTopY = SHELF.legHeight + SHELF.height + SHELF.thickness / 2;
export const shelfFloorY = SHELF.legHeight + SHELF.thickness / 2;
export const shelfInnerLeftX = -SHELF.width / 2 + SHELF.thickness / 2;

// Turns a list of corner points into a smooth line with a quarter-circle at
// each inner corner (all corners here are right angles).
function roundCorners(points, radii, segments = 12) {
  const out = [points[0].clone()];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dirIn = p.clone().sub(points[i - 1]).normalize();
    const dirOut = points[i + 1].clone().sub(p).normalize();
    const r = radii[i];
    const centre = p.clone().addScaledVector(dirIn, -r).addScaledVector(dirOut, r);
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * (Math.PI / 2);
      out.push(
        centre
          .clone()
          .addScaledVector(dirOut, -r * Math.cos(a))
          .addScaledVector(dirIn, r * Math.sin(a)),
      );
    }
  }
  out.push(points[points.length - 1].clone());
  return out;
}

// Gives the centre line a thickness, returning a closed outline.
function thicken(line, thickness) {
  const left = [];
  const right = [];
  for (let i = 0; i < line.length; i++) {
    const prev = line[Math.max(i - 1, 0)];
    const next = line[Math.min(i + 1, line.length - 1)];
    const t = next.clone().sub(prev).normalize();
    const n = new THREE.Vector2(-t.y, t.x);
    left.push(line[i].clone().addScaledVector(n, thickness / 2));
    right.push(line[i].clone().addScaledVector(n, -thickness / 2));
  }
  return [...left, ...right.reverse()];
}

export function createShelf() {
  const { width: w, height: h, depth, legHeight: y0, legGap: g, thickness, radius } = SHELF;
  const v = (x, y) => new THREE.Vector2(x, y);

  // One continuous folded sheet, seen from the front: up the left leg, round
  // the box anticlockwise... (left, up, across the top, down, back), then
  // down the right leg.
  const corners = [
    v(-g, 0),
    v(-g, y0),
    v(-w / 2, y0),
    v(-w / 2, y0 + h),
    v(w / 2, y0 + h),
    v(w / 2, y0),
    v(g, y0),
    v(g, 0),
  ];
  const legRadius = 0.028;
  const radii = [0, legRadius, radius, radius, radius, radius, legRadius, 0];

  const outline = thicken(roundCorners(corners, radii), thickness);
  const shape = new THREE.Shape(outline);

  const bevel = 0.0015;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -(depth - bevel * 2) / 2);
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xd9dadc,
    metalness: 1,
    roughness: 0.25,
    envMapIntensity: 1.15,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'shelf';

  // A group, so a .glb model could be dropped in here later instead.
  const group = new THREE.Group();
  group.name = 'shelf-group';
  group.add(mesh);
  return group;
}
