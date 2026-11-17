uniform sampler2D tDiffuse; // the mirrored scene, rendered by the Reflector
uniform float uTime;
uniform vec2 uMouse; // where the pointer meets the floor, in metres
uniform float uMouseStrength; // 0..1
uniform float uBass; // 0..1, from the audio analyser
uniform vec3 uLiquid; // the colour of the liquid itself
uniform vec3 uSheen; // the bright room showing in the liquid's gaps

varying vec4 vMirrorUv;
varying vec2 vFloor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + 17.1;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 p = vFloor;
  float t = uTime;
  float swell = 1.0 + uBass * 1.5;

  // Slow, oily wobble: stretched so the reflection smears into wavy streaks.
  vec2 wobble = vec2(
    fbm(p * vec2(7.0, 2.6) + vec2(0.0, t * 0.22)),
    fbm(p * vec2(2.6, 6.0) + vec2(t * 0.17, 4.0))
  ) - 0.5;
  vec2 offset = wobble * 0.085 * swell;

  // Rings spreading out from the pointer.
  vec2 fromMouse = p - uMouse;
  float d = length(fromMouse);
  float ring = sin(d * 42.0 - t * 5.5) * exp(-d * 5.0);
  offset += normalize(fromMouse + 1e-5) * ring * 0.03 * uMouseStrength;

  vec2 uv = vMirrorUv.xy / vMirrorUv.w + offset;
  vec4 mirrored = texture2D(tDiffuse, uv);

  // The puddle: an irregular blob with a crisp, slowly shifting edge.
  vec2 q = p + wobble * 0.12 + normalize(fromMouse + 1e-5) * ring * 0.012 * uMouseStrength;
  // It sits a little towards the viewer, where the reflection falls.
  vec2 centre = normalize(cameraPosition.xz + 1e-5) * 0.3;
  float radius = length(q - centre);
  float edge = 0.36 + 0.42 * fbm(q * 2.6 + vec2(t * 0.03, 9.0)) + uBass * 0.03;
  float puddle = smoothstep(edge, edge - 0.012, radius);

  // Gaps in the dark liquid where the bright room shows instead.
  float gap = smoothstep(0.6, 0.64, fbm(q * 3.4 + vec2(31.0, t * 0.05)));

  vec3 colour = mix(uLiquid, mirrored.rgb, mirrored.a * 0.92);
  colour = mix(colour, uSheen, gap * (1.0 - mirrored.a * 0.85));

  gl_FragColor = vec4(colour, puddle);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
