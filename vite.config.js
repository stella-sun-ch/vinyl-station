import { defineConfig } from 'vite';

// Relative paths, so the built site works from any folder, including
// https://<user>.github.io/vinyl-station/ on GitHub Pages.
export default defineConfig({
  base: './',
});
