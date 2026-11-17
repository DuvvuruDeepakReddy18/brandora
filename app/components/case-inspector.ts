import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// A small optical inspection robot. Its probe tracks the same scan as the artwork.
export function createInspector(host: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  camera.position.set(0, 0.5, 6.7);
  camera.lookAt(0, 0, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9d8d78, 3));
  const light = new THREE.DirectionalLight(0xffffff, 4);
  light.position.set(-3, 5, 5);
  scene.add(light);
  const shell = new THREE.MeshPhysicalMaterial({
    color: 0xeae6da,
    metalness: 0.36,
    roughness: 0.25,
    clearcoat: 1,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x848987,
    metalness: 1,
    roughness: 0.24,
  });
  const black = new THREE.MeshStandardMaterial({
    color: 0x172c2b,
    metalness: 0.75,
    roughness: 0.28,
  });
  const copper = new THREE.MeshStandardMaterial({
    color: 0xd5633d,
    metalness: 0.65,
    roughness: 0.3,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x244e52,
    metalness: 0.65,
    roughness: 0.08,
    clearcoat: 1,
  });
  const lamp = new THREE.MeshStandardMaterial({
    color: 0xb5f2e0,
    emissive: 0x6cd7bd,
    emissiveIntensity: 2,
  });
  const bot = new THREE.Group();
  scene.add(bot);
  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    parent: THREE.Object3D = bot,
  ) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  add(new RoundedBoxGeometry(1.55, 1.15, 0.92, 5, 0.25), shell, 0, 0.12, 0);
  add(new RoundedBoxGeometry(1.38, 0.95, 0.12, 4, 0.22), black, 0, 0.12, 0.49);
  add(
    new THREE.CylinderGeometry(0.55, 0.55, 0.12, 64),
    metal,
    0,
    0.12,
    0.6,
  ).rotation.x = Math.PI / 2;
  add(
    new THREE.CylinderGeometry(0.46, 0.46, 0.15, 64),
    black,
    0,
    0.12,
    0.68,
  ).rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(0.36, 40, 28), glass, 0, 0.12, 0.76).scale.z =
    0.5;
  const iris = add(
    new THREE.TorusGeometry(0.235, 0.018, 8, 48),
    lamp,
    0,
    0.12,
    0.94,
  );
  add(new THREE.SphereGeometry(0.1, 20, 12), black, 0, 0.12, 0.95).scale.z =
    0.4;
  add(new THREE.TorusGeometry(0.49, 0.027, 8, 64), copper, 0, 0.12, 0.72);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    add(
      new THREE.BoxGeometry(0.025, 0.065, 0.025),
      metal,
      Math.sin(a) * 0.49,
      0.12 + Math.cos(a) * 0.49,
      0.744,
    ).rotation.z = -a;
  }
  for (const x of [-0.66, 0.66]) {
    add(new THREE.SphereGeometry(0.045, 10, 8), metal, x, 0.48, 0.53);
    add(new THREE.SphereGeometry(0.045, 10, 8), metal, x, -0.25, 0.53);
    const ear = add(
      new THREE.CylinderGeometry(0.19, 0.19, 0.12, 24),
      metal,
      x * 1.2,
      0.13,
      0,
    );
    ear.rotation.z = Math.PI / 2;
  }
  add(new RoundedBoxGeometry(0.6, 0.12, 0.55, 3, 0.05), metal, 0, -0.53, 0);
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 12), metal, 0.46, 0.79, 0);
  add(new THREE.SphereGeometry(0.075, 16, 12), lamp, 0.46, 0.94, 0);
  for (let i = 0; i < 5; i++)
    add(
      new THREE.BoxGeometry(0.035, 0.12, 0.02),
      black,
      -0.24 + i * 0.12,
      0.67,
      0.27,
    );
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.78, -0.25, 0);
    bot.add(arm);
    arms.push(arm);
    add(new THREE.SphereGeometry(0.14, 18, 12), metal, 0, 0, 0, arm);
    add(
      new THREE.CylinderGeometry(0.065, 0.09, 0.64, 16),
      shell,
      s * 0.16,
      -0.28,
      0,
      arm,
    ).rotation.z = s * 0.5;
    add(new THREE.SphereGeometry(0.1, 16, 12), copper, s * 0.3, -0.56, 0, arm);
    add(
      new THREE.CylinderGeometry(0.04, 0.065, 0.52, 12),
      metal,
      s * 0.32,
      -0.77,
      0.14,
      arm,
    ).rotation.x = -0.45;
    add(
      new RoundedBoxGeometry(0.24, 0.13, 0.22, 3, 0.04),
      black,
      s * 0.34,
      -1,
      0.25,
      arm,
    );
    for (const t of [-1, 1])
      add(
        new THREE.BoxGeometry(0.035, 0.16, 0.04),
        shell,
        s * 0.34 + t * 0.085,
        -1.1,
        0.27,
        arm,
      );
  }
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.4, -0.58, -0.04);
    bot.add(leg);
    legs.push(leg);
    add(
      new THREE.CylinderGeometry(0.07, 0.06, 0.35, 14),
      metal,
      0,
      -0.15,
      0,
      leg,
    );
    add(
      new RoundedBoxGeometry(0.36, 0.17, 0.48, 3, 0.07),
      shell,
      0,
      -0.38,
      0.12,
      leg,
    );
    add(
      new RoundedBoxGeometry(0.36, 0.035, 0.46, 3, 0.01),
      black,
      0,
      -0.48,
      0.12,
      leg,
    );
  }
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  let disposed = false;
  return {
    update(time: number, progress: number, scan: number, still: boolean) {
      if (disposed) return;
      const walk = progress < 0.85 ? Math.sin(time * 3.4) : 0;
      bot.position.y = still
        ? 0
        : Math.sin(time * 1.7) * 0.045 + Math.abs(walk) * 0.04;
      bot.rotation.set(
        -0.06 + scan * 0.16,
        -0.38 + Math.sin(time * 0.4) * (still ? 0 : 0.07),
        walk * 0.025,
      );
      arms[0].rotation.z = -0.25 - scan * 0.55;
      arms[0].rotation.x = scan * 0.55;
      arms[1].rotation.z = 0.1 + walk * 0.1;
      legs[0].rotation.x = walk * 0.18;
      legs[1].rotation.x = -walk * 0.18;
      iris.rotation.z = still ? 0 : time * 0.6;
      renderer.render(scene, camera);
    },
    dispose() {
      disposed = true;
      ro.disconnect();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      [shell, metal, black, copper, glass, lamp].forEach((m) => m.dispose());
      env.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
