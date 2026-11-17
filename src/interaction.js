import * as THREE from 'three';
import gsap from 'gsap';

import { SLEEVE, createDisc } from './scene/records.js';

const SPIN = (100 / 3 / 60) * Math.PI * 2; // 33⅓ rpm in radians per second
const PULL_OUT = 0.42; // how far a sleeve comes out of the shelf
const ARM_LIFT = -0.035;

export function createInteraction({
  canvas,
  camera,
  controls,
  station,
  shelf,
  turntable,
  records,
  audio,
  captionEl,
  labelEl,
  reducedMotion,
  onInteract,
}) {
  const list = records.children;
  const fanShift = Math.max(0.04, 0.17 - Math.max(list.length - 10, 0) * 0.008);
  const fanLean = list.length > 18 ? -0.06 : -0.1;
  const { platter, tonearm, recordSeatY, armStart, armEnd, armDown } = turntable.userData;
  const d = (seconds) => (reducedMotion ? 0 : seconds);

  let focus = list.length - 1; // the record whose cover is showing
  let hovered = null;
  let overShelf = false;
  let current = null; // { record, disc, state }
  let moving = null; // a record being animated in or out
  let busy = false;
  let armBusy = false;
  let spin = 0;
  let spinTarget = 0;
  let labelRecord = null;
  let labelTimer;

  const setCaption = (text) => {
    captionEl.textContent = text;
  };
  const title = (entry) => `${entry.artist} — ${entry.track}`;

  // ---------- Where each sleeve rests ----------
  function settle(record, delay = 0) {
    const { home, homeLean, index } = record.userData;
    const flipped = index > focus;
    const isHovered = record === hovered;
    const isOut = record === current?.record;
    const options = { duration: d(0.4), delay, ease: 'power2.out', overwrite: 'auto' };
    gsap.to(record.position, {
      x: home.x + (flipped ? fanShift : 0),
      y: home.y + (isHovered ? 0.02 : 0),
      z: home.z + (isOut ? 0.07 : 0) + (isHovered ? 0.035 : 0),
      ...options,
    });
    gsap.to(record.rotation, { z: flipped ? fanLean : homeLean, ...options });
  }

  function settleAll() {
    for (const record of list) {
      if (record === moving) continue;
      settle(record, d(Math.abs(record.userData.index - focus) * 0.03));
    }
  }

  function setFocus(index, announce = false) {
    const next = Math.min(Math.max(index, 0), list.length - 1);
    if (next === focus) return;
    focus = next;
    onInteract();
    settleAll();
    if (announce) flashLabel(list[focus]);
  }

  // ---------- Label ----------
  function showLabel(record) {
    labelRecord = record;
    if (!record) {
      labelEl.hidden = true;
      return;
    }
    const { artist, album } = record.userData.entry;
    labelEl.textContent = album ? `${artist} · ${album}` : artist;
    labelEl.hidden = false;
    placeLabel();
  }

  function flashLabel(record) {
    clearTimeout(labelTimer);
    showLabel(record);
    labelTimer = setTimeout(() => showLabel(hovered), 2500);
  }

  const labelPoint = new THREE.Vector3();
  function placeLabel() {
    if (!labelRecord) return;
    labelPoint.set(0, SLEEVE.size + 0.03, 0);
    labelRecord.localToWorld(labelPoint).project(camera);
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + ((labelPoint.x + 1) / 2) * rect.width;
    const y = rect.top + ((1 - labelPoint.y) / 2) * rect.height;
    labelEl.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  // ---------- Tonearm ----------
  function cueArm() {
    armBusy = true;
    return gsap
      .timeline({ onComplete: () => (armBusy = false) })
      .to(tonearm.rotation, { x: ARM_LIFT, duration: d(0.2), ease: 'power1.out' })
      .to(tonearm.rotation, { y: armStart, duration: d(0.65), ease: 'power2.inOut' })
      .to(tonearm.rotation, { x: armDown, duration: d(0.25), ease: 'power1.in' });
  }

  function returnArm() {
    if (Math.abs(tonearm.rotation.y) < 1e-4) return Promise.resolve();
    armBusy = true;
    return gsap
      .timeline({ onComplete: () => (armBusy = false) })
      .to(tonearm.rotation, { x: ARM_LIFT, duration: d(0.2), ease: 'power1.out' })
      .to(tonearm.rotation, { y: 0, duration: d(0.55), ease: 'power2.inOut' })
      .to(tonearm.rotation, { x: 0, duration: d(0.2), ease: 'power1.in' });
  }

  // ---------- Putting a record on, taking it off ----------
  const seat = new THREE.Vector3();
  function seatInStation() {
    // The centre of the platter, in the station's coordinates.
    seat.set(0, recordSeatY + 0.0015, 0);
    platter.localToWorld(seat);
    return station.worldToLocal(seat).clone();
  }

  // Moves the disc along an arc, turning it between upright (in the sleeve)
  // and flat (on the platter).
  function flyDisc(timeline, disc, from, to, uprightAtStart) {
    const control = from.clone().lerp(to, 0.5);
    control.y = Math.max(from.y, to.y) + 0.2;
    const proxy = { t: 0 };
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    timeline.to(proxy, {
      t: 1,
      duration: d(0.55),
      ease: 'power2.inOut',
      onUpdate() {
        a.lerpVectors(from, control, proxy.t);
        b.lerpVectors(control, to, proxy.t);
        disc.position.lerpVectors(a, b, proxy.t);
        const upright = uprightAtStart ? 1 - proxy.t : proxy.t;
        disc.rotation.set(0, 0, (Math.PI / 2) * upright);
      },
    });
  }

  function pulledOut(record) {
    const { home } = record.userData;
    return new THREE.Vector3(home.x, home.y + 0.012, home.z + PULL_OUT);
  }

  async function putOn(record) {
    const out = pulledOut(record);
    const discStart = out.clone().setY(out.y + SLEEVE.size / 2);
    const disc = (record.userData.disc ??= createDisc(record));

    focus = record.userData.index;
    moving = record;
    hovered = null;
    showLabel(null);
    settleAll();

    const timeline = gsap.timeline();
    // 1. The sleeve comes out of the shelf.
    timeline
      .to(record.position, { ...out, duration: d(0.35), ease: 'power2.out', overwrite: true }, 0)
      .to(record.rotation, { z: 0, duration: d(0.35), ease: 'power2.out', overwrite: true }, 0)
      .add(() => {
        station.add(disc);
        disc.position.copy(discStart);
        disc.rotation.set(0, 0, Math.PI / 2);
        disc.visible = true;
      });
    // 2. The sleeve slides off and back, leaving the disc in the air.
    timeline.to(record.position, {
      y: record.userData.home.y,
      z: record.userData.home.z + 0.07,
      duration: d(0.3),
      ease: 'power2.inOut',
    });
    // 3. The disc flies over and lands on the platter.
    flyDisc(timeline, disc, discStart, seatInStation(), true);
    await timeline;

    platter.add(disc);
    disc.position.set(0, recordSeatY + 0.0015, 0);
    disc.rotation.set(0, 0, 0);

    moving = null;
    current = { record, disc, state: 'idle' };
    settleAll();
  }

  async function takeOff() {
    const { record, disc } = current;
    audio.stop();
    spinTarget = 0;
    await returnArm();

    const out = pulledOut(record);
    const discEnd = out.clone().setY(out.y + SLEEVE.size / 2);
    moving = record;

    station.attach(disc);
    disc.rotation.set(0, 0, 0);

    const timeline = gsap.timeline();
    timeline
      .to(record.position, { ...out, duration: d(0.3), ease: 'power2.out', overwrite: true }, 0)
      .to(record.rotation, { z: 0, duration: d(0.3), ease: 'power2.out', overwrite: true }, 0);
    flyDisc(timeline, disc, disc.position.clone(), discEnd, false);
    await timeline;

    disc.visible = false;
    station.remove(disc);
    moving = null;
    current = null;
    settleAll();
  }

  async function startPlayback() {
    const { entry } = current.record.userData;
    if (!entry.previewUrl) {
      current.state = 'silent';
      setCaption(`${entry.artist} — Preview unavailable`);
      return;
    }
    setCaption(title(entry));
    audio.load(entry.previewUrl);
    spinTarget = SPIN;
    await cueArm();
    await play(entry);
  }

  async function play(entry) {
    try {
      await audio.play();
      current.state = 'playing';
      spinTarget = SPIN;
      setCaption(title(entry));
    } catch (error) {
      spinTarget = 0;
      if (error.name === 'NotAllowedError') {
        // The browser wants a fresh click before it lets sound start.
        current.state = 'paused';
        setCaption(`${title(entry)} (click the record to play)`);
      } else {
        console.warn(`${entry.artist}: ${error.message}`);
        current.state = 'silent';
        setCaption(`${entry.artist} — Preview unavailable`);
        await returnArm();
      }
    }
  }

  async function select(record) {
    if (busy) return;
    if (record === current?.record) return toggle();
    busy = true;
    onInteract();
    audio.unlock();
    try {
      if (current) await takeOff();
      await putOn(record);
      await startPlayback();
    } finally {
      busy = false;
    }
  }

  async function toggle() {
    if (busy || !current) return;
    const { entry } = current.record.userData;
    audio.unlock();
    if (current.state === 'playing') {
      audio.pause();
      current.state = 'paused';
      spinTarget = 0;
      setCaption(`${title(entry)} (paused)`);
    } else if (current.state === 'paused') {
      await play(entry);
    } else if (current.state === 'ended') {
      busy = true;
      try {
        audio.restart();
        spinTarget = SPIN;
        await cueArm();
        await play(entry);
      } finally {
        busy = false;
      }
    }
  }

  audio.el.addEventListener('ended', () => {
    if (!current) return;
    current.state = 'ended';
    spinTarget = 0;
    setCaption(`${title(current.record.userData.entry)} (preview ended)`);
    returnArm();
  });

  // ---------- Pointer ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickable = [shelf, turntable, records];

  // What is under the pointer: a record, the platter, or the furniture.
  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const [hit] = raycaster.intersectObjects(pickable, true);
    if (!hit) return null;
    for (let node = hit.object; node; node = node.parent) {
      if (node.parent === records) return { type: 'record', record: node };
      if (node === platter) return { type: 'platter' };
      if (node === shelf) return { type: 'shelf' };
      if (node === turntable) return { type: 'deck' };
    }
    return null;
  }

  function setHovered(record) {
    if (record === hovered || record === moving) return;
    const previous = hovered;
    hovered = record;
    if (previous && previous !== moving) settle(previous);
    if (record) settle(record);
    clearTimeout(labelTimer);
    showLabel(record);
  }

  let down = null;
  let swipe = null;

  canvas.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY };
    if (event.pointerType === 'touch') {
      const hit = pick(event);
      if (hit?.type === 'record' || hit?.type === 'shelf') {
        // A sideways swipe on the shelf flips through the records.
        swipe = { x: event.clientX };
        controls.enabled = false;
      }
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (swipe) {
      const dx = event.clientX - swipe.x;
      if (Math.abs(dx) >= 36) {
        setFocus(focus + Math.sign(dx), true);
        swipe.x = event.clientX;
      }
      return;
    }
    if (event.pointerType === 'touch') return;
    const hit = pick(event);
    overShelf = hit?.type === 'record' || hit?.type === 'shelf';
    setHovered(hit?.type === 'record' ? hit.record : null);
    const clickable = hit?.type === 'record' || (hit?.type === 'platter' && current);
    canvas.style.cursor = clickable ? 'pointer' : '';
  });

  canvas.addEventListener('pointerup', (event) => {
    if (swipe) {
      swipe = null;
      controls.enabled = true;
    }
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (moved > 8) return; // that was a drag to turn the view
    const hit = pick(event);
    if (hit?.type === 'record') select(hit.record);
    else if (hit?.type === 'platter') toggle();
  });

  canvas.addEventListener('pointercancel', () => {
    down = null;
    swipe = null;
    controls.enabled = true;
  });

  canvas.addEventListener('pointerleave', () => {
    overShelf = false;
    setHovered(null);
    canvas.style.cursor = '';
  });

  // Over the shelf the wheel flips through the records; elsewhere it zooms.
  let wheelSum = 0;
  window.addEventListener(
    'wheel',
    (event) => {
      if (event.target !== canvas || !overShelf) return;
      event.preventDefault();
      event.stopPropagation();
      wheelSum += event.deltaY;
      while (Math.abs(wheelSum) >= 50) {
        setFocus(focus - Math.sign(wheelSum), true);
        wheelSum -= Math.sign(wheelSum) * 50;
      }
    },
    { capture: true, passive: false },
  );

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      setFocus(focus - 1, true);
    } else if (event.key === 'ArrowRight') {
      setFocus(focus + 1, true);
    } else if (event.key === 'Enter') {
      select(list[focus]);
    } else if (event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  });

  return {
    // Called every frame. Returns the bass level for the reflection.
    update(dt) {
      spin += (spinTarget - spin) * Math.min(dt * 2.5, 1);
      if (!reducedMotion) platter.rotation.y -= spin * dt;

      // The needle tracks inwards as the preview plays.
      if (current && !armBusy && (current.state === 'playing' || current.state === 'paused')) {
        tonearm.rotation.y = armStart + (armEnd - armStart) * audio.progress;
      }

      placeLabel();
      return audio.bass();
    },
  };
}
