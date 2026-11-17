# Stella's favorite tunes

A one-page 3D listening station. Flip through the records on the shelf, put one on the turntable and hear a 30-second preview.

**Live:** https://stella-sun-ch.github.io/vinyl-station/

Built with [Three.js](https://threejs.org/), [GSAP](https://gsap.com/) and [Vite](https://vite.dev/). The shelf and turntable are built in code, so there are no 3D model files.

## Run it

Needs Node 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Controls

| Action | Mouse or keyboard | Touch |
|---|---|---|
| Turn the view | Drag | Drag |
| Flip through the records | Scroll over the shelf, or left and right arrows | Swipe sideways on the shelf |
| Play a record | Click it, or Enter | Tap it |
| Pause and resume | Click the platter, or Space | Tap the platter |

## Where things are

- `src/main.js`: renderer, camera, lighting and the render loop
- `src/scene/`: the shelf, turntable, records and the liquid floor reflection
- `src/shaders/`: the reflection shader
- `src/interaction.js`: hover, browsing, and moving records on and off the platter
- `src/audio.js`: preview playback and the bass reading that pulses the reflection
- `src/data.js`: the artist list and the iTunes lookup

To change the records, edit the `ARTISTS` list in `src/data.js`.

## Credits

- Previews and artwork come from Apple's iTunes Search API at load time. Nothing from Apple is stored in this repository.
- Design inspired by Gaspard.
- Studio lighting: "Studio Small 08" from [Poly Haven](https://polyhaven.com/) (CC0).
