import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const OBJECT_COLORS = {
  robot: 0x06b6d4,
  furniture: 0x475569,
  zone: 0x8b5cf6,
  part: 0xef4444,
  victim: 0xf97316,
  obstacle: 0x64748b,
  equipment: 0xf59e0b,
};

const STATE_COLORS = {
  normal: null,
  fault: 0xef4444,
  trapped: 0xf97316,
  rescued: 0x10b981,
  cleared: 0x64748b,
  replaced: 0x10b981,
  printing: 0xf59e0b,
  printed: 0x10b981,
};

export class NexTwinScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.meshes = {};
    this.robotMesh = null;
    this.sceneVisible = false;

    this._init();
  }

  _init() {
    const container = this.canvas.parentElement;
    const w = container.clientWidth;
    const h = container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060a12);
    this.scene.fog = new THREE.Fog(0x060a12, 20, 45);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    this.camera.position.set(8, 7, 10);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.target.set(0, 0, 0);

    // Lights
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 12, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    this.scene.add(dir);

    const rim = new THREE.DirectionalLight(0x06b6d4, 0.3);
    rim.position.set(-5, 5, -5);
    this.scene.add(rim);

    this._buildEnvironment();
    this._buildPlaceholderScene();

    window.addEventListener('resize', () => this._onResize());
    this._animate();
  }

  _buildEnvironment() {
    // Floor grid
    const grid = new THREE.GridHelper(20, 20, 0x1e293b, 0x111827);
    grid.position.y = 0.01;
    this.scene.add(grid);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  _buildPlaceholderScene() {
    this.placeholderGroup = new THREE.Group();
    this.placeholderGroup.visible = false;

    const label = this._makeLabel('等待任务输入...');
    label.position.set(0, 2, 0);
    this.placeholderGroup.add(label);
    this.scene.add(this.placeholderGroup);
  }

  _makeBox(w, h, d, color, y = h / 2) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _makeLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(6,182,212,0.9)';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 256, 40);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 0.5, 1);
    return sprite;
  }

  _makeRobot() {
    const group = new THREE.Group();

    // Body
    const body = this._makeBox(0.5, 0.8, 0.35, OBJECT_COLORS.robot);
    group.add(body);

    // Head
    const head = this._makeBox(0.35, 0.35, 0.3, 0x0891b2, 0.8 + 0.175);
    head.position.set(0, 0, 0);
    group.add(head);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
    [-0.08, 0.08].forEach((x) => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(x, 1.05, 0.16);
      group.add(eye);
    });

    // Arms
    [-0.35, 0.35].forEach((x) => {
      const arm = this._makeBox(0.12, 0.6, 0.12, 0x0891b2, 0.5);
      arm.position.set(x, 0, 0);
      group.add(arm);
    });

    // Base ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.55, 32),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);

    return group;
  }

  buildScene(objects, sceneLabel) {
    // Clear old scene objects
    Object.values(this.meshes).forEach((m) => this.scene.remove(m));
    this.meshes = {};
    if (this.robotMesh) {
      this.scene.remove(this.robotMesh);
      this.robotMesh = null;
    }
    this.placeholderGroup.visible = false;
    this.sceneVisible = true;

    objects.forEach((obj) => {
      const [x, y, z] = obj.position;
      let mesh;

      switch (obj.type) {
        case 'robot':
          mesh = this._makeRobot();
          this.robotMesh = mesh;
          break;
        case 'furniture':
          mesh = obj.id === 'workbench'
            ? this._makeBox(1.8, 0.9, 1.0, OBJECT_COLORS.furniture)
            : this._makeBox(1.2, 2.0, 0.4, 0x334155);
          break;
        case 'zone': {
          const zone = new THREE.Mesh(
            new THREE.CircleGeometry(1.2, 32),
            new THREE.MeshStandardMaterial({
              color: OBJECT_COLORS.zone,
              transparent: true,
              opacity: 0.25,
              roughness: 0.8,
            })
          );
          zone.rotation.x = -Math.PI / 2;
          zone.position.y = 0.02;
          mesh = new THREE.Group();
          mesh.add(zone);
          const pole = this._makeBox(0.05, 1.5, 0.05, OBJECT_COLORS.zone, 0.75);
          mesh.add(pole);
          break;
        }
        case 'part':
          mesh = this._makeBox(0.3, 0.3, 0.3, OBJECT_COLORS.part, 0.15);
          break;
        case 'victim':
          mesh = this._makeBox(0.3, 0.25, 0.2, OBJECT_COLORS.victim || 0xf97316, 0.125);
          break;
        case 'obstacle':
          mesh = this._makeBox(0.8, 0.5, 0.6, OBJECT_COLORS.obstacle);
          break;
        case 'equipment':
          mesh = this._makeBox(0.8, 1.2, 0.8, OBJECT_COLORS.equipment);
          // Print bed
          const bed = this._makeBox(0.6, 0.05, 0.6, 0x374151, 0.025);
          bed.position.set(0, 0, 0.3);
          mesh.add(bed);
          break;
        default:
          mesh = this._makeBox(0.5, 0.5, 0.5, 0x64748b);
      }

      mesh.position.set(x, y, z);
      mesh.userData = { id: obj.id, state: obj.state };
      this.scene.add(mesh);
      this.meshes[obj.id] = mesh;
    });

    // Scene label
    if (this.labelSprite) this.scene.remove(this.labelSprite);
    this.labelSprite = this._makeLabel(sceneLabel || '数字孪生工位');
    this.labelSprite.position.set(0, 3.5, 0);
    this.scene.add(this.labelSprite);
  }

  updateRobotPosition(pos) {
    if (!this.robotMesh) return;
    this.robotMesh.position.set(pos[0], pos[1], pos[2]);

    // Pulse ring
    const ring = this.robotMesh.children.find((c) => c.geometry?.type === 'RingGeometry');
    if (ring) {
      ring.material.opacity = 0.3 + Math.sin(Date.now() * 0.005) * 0.15;
    }
  }

  updateObjectState(objId, state) {
    const mesh = this.meshes[objId];
    if (!mesh) return;

    const color = STATE_COLORS[state];
    if (!color) return;

    mesh.traverse((child) => {
      if (child.isMesh && child.material?.color) {
        child.material = child.material.clone();
        child.material.color.setHex(color);
        if (state === 'fault') {
          child.material.emissive = new THREE.Color(0xef4444);
          child.material.emissiveIntensity = 0.4;
        }
      }
    });
  }

  setPrinterActive(active, progress = 0) {
    const printer = this.meshes['printer_3d'];
    if (!printer) return;

    printer.traverse((child) => {
      if (child.isMesh && child.material?.emissive !== undefined) {
        child.material = child.material.clone();
        child.material.emissive = new THREE.Color(active ? 0xf59e0b : 0x000000);
        child.material.emissiveIntensity = active ? 0.3 + progress * 0.4 : 0;
      }
    });
  }

  showPlaceholder() {
    this.sceneVisible = false;
    this.placeholderGroup.visible = true;
    Object.values(this.meshes).forEach((m) => this.scene.remove(m));
    this.meshes = {};
  }

  _onResize() {
    const container = this.canvas.parentElement;
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
