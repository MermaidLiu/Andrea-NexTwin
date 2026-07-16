/**
 * Three.js scene manager for WAIC venue 3D map
 * Separated from page logic – handles rendering, POI markers, route lines
 */
const { worldToScreen, isPointInRadius } = require('./coordinate');

let THREE = null;

// WAIC brand colors (hex)
const C = {
  bg: 0x0B1535,
  blue: 0x2359BE,
  purple: 0xA234D5,
  blueLight: 0x4A7FD4,
  purpleLight: 0xC56AE8,
  ground: 0x101E45,
  grid: 0x1A4089
};

/**
 * Initialize THREE from threejs-miniprogram adapter
 * Must be called after canvas is ready
 */
function initTHREE(canvas) {
  let createScopedThreejs;
  try {
    ({ createScopedThreejs } = require('threejs-miniprogram'));
  } catch (e1) {
    try {
      ({ createScopedThreejs } = require('../miniprogram_npm/threejs-miniprogram/index'));
    } catch (e2) {
      throw new Error(
        'threejs-miniprogram not found. Please run Tools > Build npm in WeChat DevTools.'
      );
    }
  }
  THREE = createScopedThreejs(canvas);
  return THREE;
}

class VenueScene {
  /**
   * @param {Object} canvas - WeChat offscreen or standard canvas node
   * @param {number} width
   * @param {number} height
   */
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.poiMeshes = [];
    this.poiData = [];
    this.routeLine = null;
    this.animationId = null;
    this.highlightedTrackId = null;
    this.onRenderCallback = null;
    this.mapRevealed = false;
    this.zoneMeshes = [];
    this.revealProgress = 0;

    THREE = initTHREE(canvas);

    this._initScene();
    this._initCamera();
    this._initLights();
    this._initGround();
    this._initVenueClusters();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.bg);
    this.scene.fog = new THREE.Fog(C.bg, 25, 55);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(wx.getSystemInfoSync().pixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      50,
      this.width / this.height,
      0.1,
      100
    );
    this.camera.position.set(0, 12, 15);
    this.camera.lookAt(0, 0, 0);
    // Store THREE ref for coordinate utils
    this.camera.__THREE__ = THREE;
  }

  _initLights() {
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    const pointLight = new THREE.PointLight(C.blue, 0.6, 35);
    pointLight.position.set(-5, 8, 5);
    this.scene.add(pointLight);

    const pointLight2 = new THREE.PointLight(C.purple, 0.5, 35);
    pointLight2.position.set(5, 8, -5);
    this.scene.add(pointLight2);
  }

  _initGround() {
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: C.ground,
      roughness: 0.95,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(40, 24, C.grid, C.grid);
    grid.position.y = 0.01;
    grid.material.opacity = 0.35;
    grid.material.transparent = true;
    this.scene.add(grid);
  }

  /**
   * Subtle location zone rings – no chunky 3D blocks
   */
  _initVenueClusters() {
    const { VENUES } = require('../data/venues');

    const zoneConfigs = [
      { locationId: 'loc_west_bund', pos: { x: -3.5, z: 1.5 }, color: C.blue },
      { locationId: 'loc_zhangjiang', pos: { x: 4, z: -2 }, color: C.purple },
      { locationId: 'loc_expo', pos: { x: 0, z: -4 }, color: C.blueLight }
    ];

    zoneConfigs.forEach(cfg => {
      const ringGeo = new THREE.RingGeometry(1.2, 1.8, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cfg.pos.x, 0.03, cfg.pos.z);
      ring.userData = { type: 'zone-ring', locationId: cfg.locationId };
      this.scene.add(ring);
      this.zoneMeshes.push(ring);

      const discGeo = new THREE.CircleGeometry(1.1, 48);
      const discMat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(cfg.pos.x, 0.02, cfg.pos.z);
      disc.userData = { type: 'zone-disc' };
      this.scene.add(disc);
      this.zoneMeshes.push(disc);
    });

    VENUES.forEach(venue => {
      this._createPOIPin(venue);
    });

    // Hide POIs until user enters the map
    this.poiMeshes.forEach(mesh => {
      mesh.visible = false;
      mesh.scale.set(0.01, 0.01, 0.01);
    });
  }

  /**
   * Reveal map zones and POI markers with fade-in animation
   */
  setMapRevealed(revealed) {
    this.mapRevealed = revealed;
    if (revealed) {
      this.revealProgress = 0;
      this.poiMeshes.forEach(mesh => {
        mesh.visible = true;
      });
    }
  }

  _updateRevealAnimation() {
    if (!this.mapRevealed || this.revealProgress >= 1) return;

    this.revealProgress = Math.min(1, this.revealProgress + 0.02);

    this.zoneMeshes.forEach(mesh => {
      if (mesh.material) {
        const targetOpacity = mesh.userData.type === 'zone-ring' ? 0.55 : 0.12;
        mesh.material.opacity = targetOpacity * this.revealProgress;
      }
    });

    this.poiMeshes.forEach((mesh, i) => {
      const t = Math.max(0, Math.min(1, (this.revealProgress - i * 0.08) / 0.5));
      mesh.scale.set(t, t, t);
      mesh.visible = t > 0.05;
    });
  }

  /**
   * Create a pin marker mesh at venue 3D position
   */
  _createPOIPin(venue) {
    const pinGroup = new THREE.Group();

    // Pin stem
    const stemGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: C.blue, emissiveIntensity: 0.3 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.4;
    pinGroup.add(stem);

    // Pin head (sphere)
    const headGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: C.blue,
      emissive: C.blue,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.7
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.9;
    pinGroup.add(head);

    // Glow ring at base
    const ringGeo = new THREE.RingGeometry(0.3, 0.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: C.blueLight,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    pinGroup.add(ring);

    pinGroup.position.set(venue.position3d.x, 0, venue.position3d.z);
    pinGroup.userData = {
      venueId: venue.id,
      locationId: venue.locationId,
      type: 'poi',
      visible: true,
      opacity: 1
    };

    this.scene.add(pinGroup);
    this.poiMeshes.push(pinGroup);
    this.poiData.push(venue);
  }

  /**
   * Update camera position from gesture controller output
   */
  setCameraPosition(pos) {
    this.camera.position.set(pos.x, pos.y, pos.z);
    this.camera.lookAt(0, 0.5, 0);
  }

  /**
   * Filter POIs by track – fade non-matching, highlight matching
   */
  setTrackFilter(trackId) {
    this.highlightedTrackId = trackId;
    const { getSessionsByTrack } = require('../data/sessions');

    let activeVenueIds = null;
    if (trackId) {
      const sessions = getSessionsByTrack(trackId);
      activeVenueIds = new Set(sessions.map(s => s.venueId));
    }

    this.poiMeshes.forEach(mesh => {
      const venueId = mesh.userData.venueId;
      const isActive = !trackId || (activeVenueIds && activeVenueIds.has(venueId));

      mesh.userData.visible = isActive;
      mesh.visible = isActive;

      mesh.children.forEach(child => {
        if (child.material) {
          if (isActive && trackId) {
            // Highlight active POIs with track color
            const { getTrackById } = require('../data/tracks');
            const track = getTrackById(trackId);
            const color = track ? parseInt(track.color.replace('#', '0x')) : C.blue;
            child.material.emissive = new THREE.Color(color);
            child.material.emissiveIntensity = 0.8;
            child.material.opacity = 1;
          } else if (isActive) {
            child.material.emissive = new THREE.Color(C.blue);
            child.material.emissiveIntensity = 0.5;
            child.material.opacity = 1;
          }
        }
      });

      // Scale animation for highlighted pins
      const targetScale = isActive && trackId ? 1.3 : (isActive ? 1 : 0.01);
      mesh.scale.set(targetScale, targetScale, targetScale);
    });
  }

  /**
   * Render route overlay line between two venues
   */
  setRouteLine(points) {
    if (this.routeLine) {
      this.scene.remove(this.routeLine);
      this.routeLine.geometry.dispose();
      this.routeLine.material.dispose();
      this.routeLine = null;
    }

    if (!points || points.length < 2) return;

    const vertices = [];
    points.forEach(p => vertices.push(p.x, p.y, p.z));

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({
      color: C.purple,
      linewidth: 2,
      transparent: true,
      opacity: 0.9
    });

    this.routeLine = new THREE.Line(geometry, material);
    this.scene.add(this.routeLine);

    // Animated pulse dots along route
    points.forEach((p, i) => {
      if (i === 0 || i === points.length - 1) return;
      const dotGeo = new THREE.SphereGeometry(0.12, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color: C.purpleLight });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(p.x, p.y, p.z);
      this.routeLine.add(dot);
    });
  }

  clearRouteLine() {
    this.setRouteLine(null);
  }

  /**
   * Project visible POI positions to 2D screen pixels for HTML label overlay
   */
  getPOIScreenPositions() {
    const result = [];
    this.poiMeshes.forEach((mesh, i) => {
      if (!mesh.visible) return;
      const screenPos = worldToScreen(
        { x: mesh.position.x, y: 1.1, z: mesh.position.z },
        this.camera,
        this.width,
        this.height
      );
      if (screenPos) {
        result.push({
          venueId: this.poiData[i].id,
          x: screenPos.x,
          y: screenPos.y
        });
      }
    });
    return result;
  }

  /**
   * Project location zone centers for area name labels
   */
  getZoneScreenPositions() {
    const { LOCATION_3D_CENTERS } = require('../data/venues');
    const result = [];
    Object.keys(LOCATION_3D_CENTERS).forEach(locationId => {
      const center = LOCATION_3D_CENTERS[locationId];
      const screenPos = worldToScreen(
        { x: center.x, y: center.y, z: center.z },
        this.camera,
        this.width,
        this.height
      );
      if (screenPos) {
        result.push({ locationId, x: screenPos.x, y: screenPos.y });
      }
    });
    return result;
  }

  /**
   * Hit-test touch against POI markers
   * @returns {Object|null} venue data if hit
   */
  hitTestPOI(touchX, touchY) {
    const HIT_RADIUS = 40;

    for (let i = this.poiMeshes.length - 1; i >= 0; i--) {
      const mesh = this.poiMeshes[i];
      if (!mesh.userData.visible) continue;

      const venue = this.poiData[i];
      const screenPos = worldToScreen(
        { x: mesh.position.x, y: 0.9, z: mesh.position.z },
        this.camera,
        this.width,
        this.height
      );

      if (isPointInRadius({ x: touchX, y: touchY }, screenPos, HIT_RADIUS)) {
        return venue;
      }
    }
    return null;
  }

  /**
   * Start render loop
   */
  startRenderLoop() {
    const animate = () => {
      this.animationId = this.canvas.requestAnimationFrame(animate);

      this._updateRevealAnimation();

      // Subtle POI bobbing animation
      const time = Date.now() * 0.001;
      this.poiMeshes.forEach((mesh, i) => {
        if (mesh.visible) {
          mesh.position.y = Math.sin(time * 2 + i) * 0.05;
        }
      });

      this.renderer.render(this.scene, this.camera);

      if (this.onRenderCallback) {
        this.onRenderCallback();
      }
    };
    animate();
  }

  stopRenderLoop() {
    if (this.animationId !== null) {
      this.canvas.cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    this.stopRenderLoop();
    this.poiMeshes.forEach(mesh => {
      mesh.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    });
    if (this.routeLine) {
      this.routeLine.geometry.dispose();
      this.routeLine.material.dispose();
    }
    this.renderer.dispose();
  }
}

module.exports = {
  VenueScene,
  initTHREE
};
