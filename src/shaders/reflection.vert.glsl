uniform mat4 textureMatrix;

varying vec4 vMirrorUv;
varying vec2 vFloor;

void main() {
  vMirrorUv = textureMatrix * vec4(position, 1.0);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vFloor = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
