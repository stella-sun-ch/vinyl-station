// Plays the 30-second previews and measures the bass for the reflection.
export function createAudio() {
  const el = new Audio();
  el.crossOrigin = 'anonymous'; // needed so the analyser may read the sound
  el.preload = 'auto';

  let context = null;
  let analyser = null;
  let bins = null;

  return {
    el,

    // Must be called from a click, tap or key press: browsers only allow
    // sound to start after the user has done something.
    unlock() {
      if (!context) {
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          context = new AudioContext();
          analyser = context.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.82;
          // A wider range than the default, so loud bass doesn't sit at the maximum.
          analyser.minDecibels = -60;
          analyser.maxDecibels = -5;
          context.createMediaElementSource(el).connect(analyser);
          analyser.connect(context.destination);
          bins = new Uint8Array(analyser.frequencyBinCount);
        } catch (error) {
          // Without Web Audio the preview still plays; only the pulse is lost.
          console.warn(`Web Audio is not available: ${error.message}`);
          analyser = null;
        }
      }
      if (context?.state === 'suspended') context.resume();
    },

    load(url) {
      el.src = url;
      el.load();
    },

    play() {
      return el.play();
    },

    pause() {
      el.pause();
    },

    restart() {
      el.currentTime = 0;
    },

    stop() {
      el.pause();
      el.removeAttribute('src');
      el.load();
    },

    // How far through the preview we are, 0..1.
    get progress() {
      return el.duration > 0 ? Math.min(el.currentTime / el.duration, 1) : 0;
    },

    // Loudness of the lowest frequencies, 0..1.
    bass() {
      if (!analyser || el.paused) return 0;
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = 1; i <= 6; i++) sum += bins[i];
      return sum / (6 * 255);
    },
  };
}
