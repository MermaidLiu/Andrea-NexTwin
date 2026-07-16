/**
 * Touch gesture handler for 3D orbit camera
 * Single-finger drag = rotation, two-finger pinch = zoom
 */
const { clampSpherical, clampDistance } = require('./coordinate');

const ROTATION_SENSITIVITY = 0.005;
const PINCH_SENSITIVITY = 0.01;

class GestureController {
  /**
   * @param {Object} options
   * @param {number} options.minDistance - minimum camera distance (zoom in limit)
   * @param {number} options.maxDistance - maximum camera distance (zoom out limit)
   * @param {Object} options.rotationBounds - { minPhi, maxPhi, minTheta, maxTheta }
   */
  constructor(options = {}) {
    this.minDistance = options.minDistance || 5;
    this.maxDistance = options.maxDistance || 25;
    this.rotationBounds = options.rotationBounds || {
      minPhi: 0.2,
      maxPhi: Math.PI / 2.2,
      minTheta: -Math.PI * 0.8,
      maxTheta: Math.PI * 0.8
    };

    this.theta = 0;
    this.phi = Math.PI / 4;
    this.distance = 15;

    this._touchState = null;
    this._lastPinchDist = 0;
  }

  /**
   * Initialize camera spherical coords from a position vector
   */
  setFromPosition(x, y, z) {
    this.distance = Math.sqrt(x * x + y * y + z * z);
    this.theta = Math.atan2(x, z);
    this.phi = Math.acos(Math.max(-1, Math.min(1, y / this.distance)));
  }

  getCameraPosition() {
    const clamped = clampSpherical(this.theta, this.phi, this.rotationBounds);
    this.theta = clamped.theta;
    this.phi = clamped.phi;
    this.distance = clampDistance(this.distance, this.minDistance, this.maxDistance);

    return {
      x: this.distance * Math.sin(this.phi) * Math.sin(this.theta),
      y: this.distance * Math.cos(this.phi),
      z: this.distance * Math.sin(this.phi) * Math.cos(this.theta)
    };
  }

  /**
   * Process wx touch event
   * @returns {'rotate'|'zoom'|'none'} gesture type performed
   */
  handleTouch(event) {
    const touches = event.touches;
    const type = event.type;

    if (type === 'touchstart') {
      this._touchState = {
        startX: touches[0].x,
        startY: touches[0].y,
        startTheta: this.theta,
        startPhi: this.phi,
        startDistance: this.distance
      };

      if (touches.length >= 2) {
        this._lastPinchDist = this._getPinchDistance(touches);
      }
      return 'none';
    }

    if (type === 'touchmove') {
      if (touches.length >= 2) {
        return this._handlePinch(touches);
      }
      if (touches.length === 1 && this._touchState) {
        return this._handleRotate(touches[0]);
      }
    }

    if (type === 'touchend' || type === 'touchcancel') {
      this._touchState = null;
      this._lastPinchDist = 0;
    }

    return 'none';
  }

  _handleRotate(touch) {
    const dx = touch.x - this._touchState.startX;
    const dy = touch.y - this._touchState.startY;

    this.theta = this._touchState.startTheta + dx * ROTATION_SENSITIVITY;
    this.phi = this._touchState.startPhi + dy * ROTATION_SENSITIVITY;

    const clamped = clampSpherical(this.theta, this.phi, this.rotationBounds);
    this.theta = clamped.theta;
    this.phi = clamped.phi;

    return 'rotate';
  }

  _handlePinch(touches) {
    const dist = this._getPinchDistance(touches);

    if (this._lastPinchDist > 0) {
      const delta = this._lastPinchDist - dist;
      this.distance = clampDistance(
        this.distance + delta * PINCH_SENSITIVITY,
        this.minDistance,
        this.maxDistance
      );
    }

    this._lastPinchDist = dist;
    return 'zoom';
  }

  _getPinchDistance(touches) {
    const dx = touches[0].x - touches[1].x;
    const dy = touches[0].y - touches[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Animate camera to look at a target POI
   */
  animateToTarget(targetPos, durationMs, onUpdate, onComplete) {
    const targetTheta = Math.atan2(
      targetPos.x,
      targetPos.z
    );
    const startTheta = this.theta;
    const startPhi = this.phi;
    const startDist = this.distance;
    const targetDist = clampDistance(10, this.minDistance, this.maxDistance);
    const startTime = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);

      this.theta = startTheta + (targetTheta - startTheta) * eased;
      this.phi = startPhi + (Math.PI / 4 - startPhi) * eased;
      this.distance = startDist + (targetDist - startDist) * eased;

      onUpdate(this.getCameraPosition());

      if (t < 1) {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(tick);
        } else {
          setTimeout(tick, 16);
        }
      } else if (onComplete) {
        onComplete();
      }
    };

    tick();
  }
}

module.exports = {
  GestureController
};
