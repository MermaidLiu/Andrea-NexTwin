/**
 * 3D vector to 2D screen coordinate projection utilities
 * Uses standard perspective projection math matching Three.js camera
 */

/**
 * Project a 3D world position to normalized device coordinates (-1 to 1)
 * @param {Object} vector3 - { x, y, z }
 * @param {Object} camera - Three.js PerspectiveCamera
 * @returns {{ x: number, y: number, z: number } | null}
 */
function projectToNDC(vector3, camera) {
  if (!camera || !vector3) return null;

  // Clone position into a vector Three.js can project
  const vec = camera.position.clone();
  // Use THREE.Vector3 if available on camera's parent context
  const THREE = camera.__THREE__;
  if (!THREE) return null;

  const worldPos = new THREE.Vector3(vector3.x, vector3.y, vector3.z);
  worldPos.project(camera);

  return { x: worldPos.x, y: worldPos.y, z: worldPos.z };
}

/**
 * Convert NDC to pixel coordinates on canvas
 * @param {Object} ndc - normalized device coords { x, y }
 * @param {number} width - canvas width in px
 * @param {number} height - canvas height in px
 * @returns {{ x: number, y: number }}
 */
function ndcToScreen(ndc, width, height) {
  return {
    x: ((ndc.x + 1) / 2) * width,
    y: ((1 - ndc.y) / 2) * height
  };
}

/**
 * Full pipeline: 3D world position → screen pixel coordinates
 */
function worldToScreen(vector3, camera, width, height) {
  const ndc = projectToNDC(vector3, camera);
  if (!ndc || ndc.z > 1) return null; // behind camera
  return ndcToScreen(ndc, width, height);
}

/**
 * Hit-test: check if a screen touch point is within radius of a projected POI
 * @param {Object} touch - { x, y } in canvas pixels
 * @param {Object} screenPos - projected POI { x, y }
 * @param {number} radius - hit radius in pixels
 */
function isPointInRadius(touch, screenPos, radius) {
  if (!screenPos) return false;
  const dx = touch.x - screenPos.x;
  const dy = touch.y - screenPos.y;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
}

/**
 * Spherical coordinates for orbit camera rotation
 */
function cartesianToSpherical(x, y, z) {
  const radius = Math.sqrt(x * x + y * y + z * z);
  const theta = Math.atan2(x, z); // horizontal angle
  const phi = Math.acos(Math.max(-1, Math.min(1, y / radius))); // vertical angle
  return { radius, theta, phi };
}

function sphericalToCartesian(radius, theta, phi) {
  return {
    x: radius * Math.sin(phi) * Math.sin(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.cos(theta)
  };
}

/**
 * Clamp spherical angles to prevent camera flipping or over-rotation
 */
function clampSpherical(theta, phi, bounds) {
  const minPhi = bounds.minPhi !== undefined ? bounds.minPhi : 0.3;
  const maxPhi = bounds.maxPhi !== undefined ? bounds.maxPhi : Math.PI / 2 - 0.1;
  const minTheta = bounds.minTheta !== undefined ? bounds.minTheta : -Math.PI;
  const maxTheta = bounds.maxTheta !== undefined ? bounds.maxTheta : Math.PI;

  return {
    theta: Math.max(minTheta, Math.min(maxTheta, theta)),
    phi: Math.max(minPhi, Math.min(maxPhi, phi))
  };
}

/**
 * Clamp zoom/distance within min/max bounds
 */
function clampDistance(distance, minDist, maxDist) {
  return Math.max(minDist, Math.min(maxDist, distance));
}

/**
 * Linear interpolation for smooth camera animations
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Ease-out cubic for drawer/camera transitions
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

module.exports = {
  projectToNDC,
  ndcToScreen,
  worldToScreen,
  isPointInRadius,
  cartesianToSpherical,
  sphericalToCartesian,
  clampSpherical,
  clampDistance,
  lerp,
  easeOutCubic
};
