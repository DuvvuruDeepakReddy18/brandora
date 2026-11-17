import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

type Decision = "pending" | "approved" | "changes";
type StudioOptions = {
  progress: () => number;
  reduced: () => boolean;
  decision: () => Decision;
  onReady: () => void;
  onError: () => void;
};
export type StudioController = { dispose: () => void };
const clamp = T.MathUtils.clamp;
const smooth = (p: number, a: number, b: number) => {
  const v = clamp((p - a) / (b - a), 0, 1);
  return v * v * (3 - 2 * v);
};
const mix = T.MathUtils.lerp;

// One persistent world. Scroll changes numeric poses, never mounts a new scene.
export async function createStudio(
  host: HTMLDivElement,
  options: StudioOptions,
): Promise<StudioController | null> {
  let renderer: T.WebGLRenderer;
  try {
    renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    options.onError();
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setClearColor(0xf4f2eb, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  host.appendChild(renderer.domElement);
  const scene = new T.Scene(),
    world = new T.Group();
  scene.add(world);
  const camera = new T.PerspectiveCamera(33, 1, 0.1, 100);
  const environment = new RoomEnvironment();
  const pmrem = new T.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environment, 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.65;
  environment.dispose();
  pmrem.dispose();
  scene.add(new T.HemisphereLight(0xfff9e9, 0xabb59d, 1.7));
  const sunlight = new T.DirectionalLight(0xffefd2, 2.4);
  sunlight.position.set(-3, 8, 6);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, {
    left: -8,
    right: 8,
    top: 8,
    bottom: -8,
    near: 0.5,
    far: 25,
  });
  sunlight.shadow.normalBias = 0.045;
  sunlight.shadow.bias = -0.00015;
  sunlight.shadow.radius = 4;
  scene.add(sunlight);
  const rim = new T.DirectionalLight(0xe2f0e5, 1.3);
  rim.position.set(5, 4, -4);
  scene.add(rim);
  const fill = new T.DirectionalLight(0xffffff, 0.7);
  fill.position.set(0, 3, 8);
  scene.add(fill);
  const resources: (T.BufferGeometry | T.Material | T.Texture)[] = [];
  function material(
    color: T.ColorRepresentation,
    metalness = 0.05,
    roughness = 0.4,
  ) {
    const m = new T.MeshStandardMaterial({ color, metalness, roughness });
    resources.push(m);
    return m;
  }
  const shell = new T.MeshPhysicalMaterial({
    color: 0xe7e5db,
    metalness: 0.1,
    roughness: 0.32,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
  });
  resources.push(shell);
  const white = material(0xf4f2e9, 0.12, 0.35),
    dark = material(0x1e302b, 0.55, 0.22),
    seam = material(0x788579, 0.6, 0.3);
  const visor = new T.MeshPhysicalMaterial({
    color: 0x122927,
    metalness: 0.48,
    roughness: 0.14,
    clearcoat: 1,
  });
  resources.push(visor);
  const teal = material(0x638575, 0.45, 0.3),
    brass = material(0xb9a47d, 0.65, 0.34);
  const light = new T.MeshStandardMaterial({
    color: 0xbcecd8,
    emissive: 0x7eddb8,
    emissiveIntensity: 0.7,
    roughness: 0.3,
  });
  resources.push(light);
  const deskMat = material(0xe2dfd1, 0.06, 0.65);
  function mesh(
    g: T.BufferGeometry,
    m: T.Material,
    parent: T.Object3D,
    pos: number[] = [0, 0, 0],
  ) {
    resources.push(g);
    const o = new T.Mesh(g, m);
    o.position.set(pos[0], pos[1], pos[2]);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function box(
    w: number,
    h: number,
    d: number,
    r: number,
    m: T.Material,
    parent: T.Object3D,
    pos?: number[],
  ) {
    return mesh(new RoundedBoxGeometry(w, h, d, 4, r), m, parent, pos);
  }
  function sphere(
    r: number,
    m: T.Material,
    parent: T.Object3D,
    pos?: number[],
  ) {
    return mesh(new T.SphereGeometry(r, 28, 20), m, parent, pos);
  }
  function cylinder(
    r1: number,
    r2: number,
    h: number,
    m: T.Material,
    parent: T.Object3D,
    pos?: number[],
  ) {
    return mesh(new T.CylinderGeometry(r1, r2, h, 48), m, parent, pos);
  }
  function segment(
    a: T.Vector3,
    b: T.Vector3,
    radius: number,
    m: T.Material,
    parent: T.Object3D,
  ) {
    const s = cylinder(radius, radius, a.distanceTo(b), m, parent);
    s.position.copy(a).lerp(b, 0.5);
    s.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    return s;
  }
  const desk = cylinder(5.5, 5.45, 0.24, deskMat, world, [0.2, -0.25, 0]);
  desk.scale.z = 0.57;
  const deskRim = cylinder(
    5.43,
    5.28,
    0.12,
    material(0xc6c6b5, 0.4, 0.48),
    world,
    [0.2, -0.4, 0],
  );
  deskRim.scale.z = 0.57;
  const ground = mesh(
    new T.PlaneGeometry(200, 200),
    new T.ShadowMaterial({ opacity: 0.12 }),
    world,
    [0, -0.52, 0],
  );
  resources.push(ground.material);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  // Architectural rails and a quiet desk lamp give the objects a shared physical space.
  segment(
    new T.Vector3(-3.9, -0.1, -1.3),
    new T.Vector3(-3.9, 5.35, -1.3),
    0.025,
    brass,
    world,
  );
  segment(
    new T.Vector3(-3.9, 5.35, -1.3),
    new T.Vector3(3.8, 5.35, -1.3),
    0.025,
    brass,
    world,
  );
  box(3.7, 0.045, 0.09, 0.02, white, world, [0.2, 5.32, -1.25]);

  type Robot = {
    root: T.Group;
    head: T.Group;
    eyes: T.Mesh[];
    left: T.Group;
    right: T.Group;
    antenna: T.Mesh;
    base: T.Vector3;
  };
  function robot(
    name: string,
    x: number,
    y: number,
    z: number,
    scale: number,
  ): Robot {
    const root = new T.Group();
    root.name = name;
    root.position.set(x, y, z);
    root.scale.setScalar(scale);
    world.add(root);
    cylinder(0.48, 0.54, 0.17, seam, root, [0, 0.04, 0]);
    const torso = sphere(0.67, shell, root, [0, 0.61, 0]);
    torso.scale.set(0.8, 1, 0.73);
    const front = box(0.55, 0.5, 0.05, 0.18, white, root, [0, 0.6, 0.45]);
    front.rotation.x = -0.1;
    box(0.2, 0.035, 0.025, 0.01, teal, root, [0, 0.69, 0.491]);
    for (let i = 0; i < 3; i++)
      box(0.025, 0.025, 0.015, 0.006, i === 0 ? light : seam, root, [
        -0.06 + i * 0.06,
        0.54,
        0.493,
      ]);
    cylinder(0.19, 0.23, 0.22, dark, root, [0, 1.2, 0]);
    const head = new T.Group();
    head.position.y = 1.68;
    root.add(head);
    box(1.3, 1.02, 0.91, 0.38, shell, head);
    box(1.14, 0.8, 0.13, 0.3, seam, head, [0, 0, 0.42]);
    box(1.08, 0.74, 0.16, 0.27, visor, head, [0, 0, 0.48]);
    const eyes = [-0.24, 0.24].map((x) =>
      box(0.075, 0.215, 0.025, 0.035, light, head, [x, 0.04, 0.573]),
    );
    const smile = new T.EllipseCurve(
      0,
      0,
      0.105,
      0.065,
      Math.PI,
      Math.PI * 2,
      false,
      0,
    );
    const smileGeo = new T.TubeGeometry(
      new T.CatmullRomCurve3(
        smile.getPoints(20).map((p) => new T.Vector3(p.x, p.y - 0.15, 0.575)),
      ),
      20,
      0.012,
      6,
      false,
    );
    mesh(smileGeo, light, head);
    for (const side of [-1, 1]) {
      const ear = cylinder(0.23, 0.23, 0.1, seam, head, [side * 0.66, 0, 0]);
      ear.rotation.z = Math.PI / 2;
      const ring = mesh(new T.TorusGeometry(0.18, 0.022, 8, 32), teal, head, [
        side * 0.72,
        0,
        0,
      ]);
      ring.rotation.y = Math.PI / 2;
      const disc = cylinder(0.14, 0.14, 0.02, white, head, [side * 0.73, 0, 0]);
      disc.rotation.z = Math.PI / 2;
    }
    const antenna = sphere(0.05, light, head, [0.32, 0.61, -0.1]);
    segment(
      new T.Vector3(0.32, 0.48, -0.1),
      new T.Vector3(0.32, 0.6, -0.1),
      0.018,
      brass,
      head,
    );
    const arms: T.Group[] = [];
    for (const side of [-1, 1]) {
      const arm = new T.Group();
      arm.position.set(side * 0.48, 0.9, 0);
      root.add(arm);
      arms.push(arm);
      sphere(0.19, seam, arm);
      const upper = box(0.24, 0.45, 0.25, 0.11, shell, arm, [
        side * 0.12,
        -0.23,
        0.02,
      ]);
      upper.rotation.z = side * 0.4;
      sphere(0.13, brass, arm, [side * 0.2, -0.42, 0.04]);
      const forearm = box(0.2, 0.44, 0.21, 0.09, shell, arm, [
        side * 0.19,
        -0.55,
        0.17,
      ]);
      forearm.rotation.x = -0.6;
      const hand = new T.Group();
      hand.position.set(side * 0.19, -0.7, 0.3);
      arm.add(hand);
      box(0.22, 0.16, 0.15, 0.06, dark, hand);
      for (const finger of [-1, 1])
        box(0.045, 0.17, 0.05, 0.02, seam, hand, [finger * 0.075, -0.08, 0.05]);
    }
    return {
      root,
      head,
      eyes,
      left: arms[0],
      right: arms[1],
      antenna,
      base: new T.Vector3(x, y, z),
    };
  }
  const sourceBot = robot("Evidence specialist", -3.2, 0.04, 1.0, 0.89);
  const visualBot = robot("Brand specialist", 3.55, 0.02, 1.05, 0.94);
  const languageBot = robot("Language specialist", -1.45, 3.88, 0.12, 0.62);
  sourceBot.root.rotation.y = 0.35;
  visualBot.root.rotation.y = -0.35;

  function canvasTexture(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    resources.push(texture);
    return { canvas, ctx, texture };
  }
  function panel(w: number, h: number, texture: T.Texture, parent: T.Object3D) {
    const group = new T.Group();
    parent.add(group);
    box(w + 0.09, h + 0.09, 0.15, 0.12, white, group);
    const mat = new T.MeshBasicMaterial({
      map: texture,
      toneMapped: false,
      transparent: true,
    });
    resources.push(mat);
    const plane = mesh(new T.PlaneGeometry(w, h), mat, group, [0, 0, 0.083]);
    plane.castShadow = false;
    plane.receiveShadow = false;
    return group;
  }
  function round(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    color: string,
  ) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }
  function text(
    ctx: CanvasRenderingContext2D,
    value: string,
    x: number,
    y: number,
    size: number,
    color = "#304a3a",
    weight = 400,
    serif = false,
  ) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${serif ? '"Newsreader", Georgia' : '"DM Sans", sans-serif'}`;
    ctx.fillText(value, x, y);
  }
  function line(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    color = "#d7ddce",
  ) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 1.5);
  }
  function pill(
    ctx: CanvasRenderingContext2D,
    value: string,
    x: number,
    y: number,
    w: number,
    color = "#e4eadc",
    ink = "#58704e",
  ) {
    round(ctx, x, y, w, 36, 18, color);
    text(ctx, value, x + 16, y + 24, 15, ink, 500);
  }
  const campaign = canvasTexture(1280, 860);
  const board = panel(5.3, 3.56, campaign.texture, world);
  board.position.set(0.35, 2.12, -0.08);
  board.rotation.y = -0.09;
  // Only the disputed number, visual treatment and status blend; the campaign never disappears.
  function paintCampaign(p: number, decision: Decision) {
    const { ctx: c } = campaign,
      fixed = smooth(p, 1.15, 2.1),
      aligned = smooth(p, 1.7, 2.5),
      reviewing = smooth(p, 3.4, 4.1);
    c.clearRect(0, 0, 1280, 860);
    round(c, 0, 0, 1280, 860, 25, "#f9f9f2");
    text(c, "FORMA", 45, 60, 24, "#52674b", 600);
    text(c, "CAMPAIGN / EVERYDAY CARE", 192, 58, 16, "#8a927f");
    pill(
      c,
      p < 1.5
        ? "Draft v1"
        : p < 3.4
          ? "Suggested edits · v2"
          : "Review version · v3",
      965,
      28,
      270,
    );
    line(c, 35, 88, 1210);
    round(c, 40, 115, 1200, 627, 14, "#e9eddf");
    // Editorial creative: original procedural bottle, paper label and a sunlit leaf.
    const grad = c.createLinearGradient(780, 150, 1230, 700);
    grad.addColorStop(0, "#b6c2a6");
    grad.addColorStop(1, "#e4e7cc");
    c.fillStyle = grad;
    c.beginPath();
    c.roundRect(785, 140, 428, 570, 10);
    c.fill();
    c.save();
    c.translate(1010, 450);
    c.rotate(-0.1 + aligned * 0.1);
    c.shadowColor = "#34482e36";
    c.shadowBlur = 40;
    c.shadowOffsetX = 24;
    c.shadowOffsetY = 24;
    round(c, -81, -130, 162, 295, 42, "#faf8e9");
    c.shadowColor = "transparent";
    round(c, -56, -184, 112, 65, 10, "#526348");
    for (let i = 0; i < 12; i++) {
      c.fillStyle = "#ffffff15";
      c.fillRect(-50 + i * 9, -177, 2, 50);
    }
    round(c, -68, -45, 136, 135, 2, "#e5e5cc");
    text(c, "forma", -48, 8, 34, "#576448", 500, true);
    text(c, "EVERYDAY", -42, 36, 11, "#8b9177");
    text(c, "HAND WASH", -42, 53, 11, "#8b9177");
    text(c, "300 ml", -21, 132, 12, "#8b9177");
    c.restore();
    c.save();
    c.translate(1170, 612);
    c.rotate(-0.7);
    c.fillStyle = "#657e5580";
    c.beginPath();
    c.ellipse(0, 0, 36, 105, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#dce7c2";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -92);
    c.lineTo(0, 95);
    c.stroke();
    c.restore();
    c.save();
    c.translate(85, 175);
    c.rotate(mix(-0.045, 0, aligned));
    text(
      c,
      "forma",
      0,
      0,
      42,
      aligned > 0.5 ? "#486442" : "#775542",
      500,
      true,
    );
    c.restore();
    text(c, "A little lighter.", 84, 306, 59, "#334b34", 400, true);
    text(c, "A lot more considered.", 84, 373, 59, "#334b34", 400, true);
    const highlight = smooth(p, 0.25, 0.85) * (1 - reviewing * 0.25);
    c.globalAlpha = highlight * (1 - fixed);
    round(c, 76, 423, 620, 68, 7, "#f3d6a0");
    c.globalAlpha = 1;
    c.globalAlpha = 1 - fixed;
    text(c, "50% less packaging.", 87, 468, 35, "#996630", 500);
    c.globalAlpha = fixed;
    text(c, "30% less packaging.*", 87, 468, 35, "#41664c", 500);
    c.globalAlpha = 1;
    c.globalAlpha = fixed;
    text(
      c,
      "*By weight, compared with our previous bottle.",
      87,
      508,
      19,
      "#7a8870",
    );
    c.globalAlpha = 1;
    text(
      c,
      "A daily ritual. A more thoughtful refill.",
      87,
      558,
      21,
      "#7e8a73",
    );
    pill(c, "Discover the collection", 84, 613, 245, "#465c3d", "#ffffff");
    const colors = [
      new T.Color("#a37457").lerp(new T.Color("#527151"), aligned),
      new T.Color("#e4b47d").lerp(new T.Color("#adbba0"), aligned),
      new T.Color("#e8d6bd").lerp(new T.Color("#ecebdd"), aligned),
    ];
    colors.forEach((color, i) => {
      round(c, 109 + i * 29, 759, 20, 20, 5, "#" + color.getHexString());
    });
    text(
      c,
      aligned > 0.7 ? "Brand palette aligned" : "Brand palette under review",
      211,
      775,
      17,
      "#7c8872",
    );
    const status =
      reviewing > 0.6
        ? decision === "approved"
          ? "Human approved · v3"
          : decision === "changes"
            ? "Changes requested · v3"
            : "Awaiting human approval"
        : fixed > 0.9
          ? "Suggested changes ready"
          : highlight > 0.6
            ? "Claim needs evidence"
            : "A new campaign to review";
    pill(
      c,
      status,
      877,
      753,
      335,
      decision === "approved" && reviewing > 0.6 ? "#dcebd9" : "#eee8d5",
      decision === "approved" && reviewing > 0.6 ? "#42663c" : "#8c7d50",
    );
    text(
      c,
      "FICTIONAL CAMPAIGN  /  ILLUSTRATIVE WORKFLOW",
      43,
      832,
      12,
      "#9aa28e",
    );
    campaign.texture.needsUpdate = true;
  }
  const sourceTexture = canvasTexture(600, 440);
  {
    const c = sourceTexture.ctx;
    round(c, 0, 0, 600, 440, 20, "#fffdf4");
    text(c, "APPROVED SOURCE", 35, 50, 17, "#869073", 500);
    text(c, "Packaging study", 35, 110, 37, "#42583a", 400, true);
    pill(c, "Version 2", 420, 27, 145);
    line(c, 35, 142, 530);
    text(c, "30% less packaging", 35, 205, 34, "#506d40", 500);
    text(c, "by weight, compared with", 35, 245, 24, "#7e8871");
    text(c, "our previous bottle.", 35, 278, 24, "#7e8871");
    pill(c, "Approved reference", 35, 338, 245, "#e3ebda");
    text(c, "↗  Claim linked", 342, 363, 19, "#667f52");
    sourceTexture.texture.needsUpdate = true;
  }
  const sourcePanel = panel(2.15, 1.58, sourceTexture.texture, world);
  sourcePanel.rotation.set(0.03, 0.12, -0.05);
  const translationTexture = canvasTexture(660, 470);
  {
    const c = translationTexture.ctx;
    round(c, 0, 0, 660, 470, 20, "#fcfcf4");
    text(c, "THE SAME PROMISE", 30, 47, 16, "#829072", 500);
    pill(c, "EN", 30, 78, 68);
    pill(c, "FR", 355, 78, 68);
    line(c, 30, 138, 595);
    text(c, "30% less", 30, 202, 33, "#445e3b", 500, true);
    text(c, "packaging.*", 30, 242, 33, "#445e3b", 500, true);
    text(c, "30 % d’emballage", 355, 202, 28, "#445e3b", 500, true);
    text(c, "en moins.*", 355, 242, 28, "#445e3b", 500, true);
    text(c, "*By weight, compared with", 30, 281, 16, "#8a967b");
    text(c, "the previous bottle.", 30, 304, 16, "#8a967b");
    text(c, "*En poids, comparé au", 355, 281, 16, "#8a967b");
    text(c, "flacon précédent.", 355, 304, 16, "#8a967b");
    line(c, 30, 330, 595);
    text(c, "Protected fact: 30%", 30, 374, 21, "#56724c", 500);
    text(
      c,
      "Translation + back-translation for review",
      30,
      413,
      16,
      "#8a967b",
    );
    translationTexture.texture.needsUpdate = true;
  }
  const languagePanel = panel(2.5, 1.78, translationTexture.texture, world);
  languagePanel.rotation.set(0, -0.2, 0.025);
  const receiptTexture = canvasTexture(880, 230);
  const receipt = panel(3.8, 0.99, receiptTexture.texture, world);
  receipt.rotation.x = -0.08;
  function paintReceipt(decision: Decision) {
    const c = receiptTexture.ctx;
    round(c, 0, 0, 880, 230, 20, "#f8faf0");
    const status =
      decision === "approved"
        ? "Approved by you"
        : decision === "changes"
          ? "Changes requested"
          : "Ready for your review";
    text(c, "HUMAN REVIEW  /  CAMPAIGN V3", 32, 43, 15, "#839275", 500);
    text(c, status, 32, 100, 35, "#436239", 500, true);
    line(c, 32, 134, 814);
    text(c, "v1  Draft", 32, 180, 17, "#8e9981");
    text(c, "→", 222, 180, 20, "#9ca990");
    text(c, "v2  Suggestions", 285, 180, 17, "#758967");
    text(c, "→", 525, 180, 20, "#9ca990");
    text(
      c,
      decision === "approved"
        ? "v3  Approved"
        : decision === "changes"
          ? "v3  Changes requested"
          : "v3  Awaiting decision",
      586,
      180,
      17,
      "#47633d",
      500,
    );
    receiptTexture.texture.needsUpdate = true;
  }
  paintReceipt("pending");
  paintCampaign(0, "pending");
  // A physical trace between the approved source and the campaign claim.
  const linkCurve = new T.CatmullRomCurve3([
    new T.Vector3(-2.45, 2.35, 1.12),
    new T.Vector3(-1.8, 2.2, 1.25),
    new T.Vector3(-1.24, 1.7, 0.75),
    new T.Vector3(-0.64, 1.75, 0.2),
  ]);
  const linkMat = new T.MeshBasicMaterial({
    color: 0x9aab71,
    transparent: true,
    opacity: 0,
  });
  resources.push(linkMat);
  const trace = mesh(
    new T.TubeGeometry(linkCurve, 55, 0.016, 7, false),
    linkMat,
    world,
  );
  trace.castShadow = false;
  const spark = sphere(0.045, light, world);
  spark.castShadow = false;
  // Physical rules swatches travel with the visual specialist.
  const swatches = new T.Group();
  world.add(swatches);
  const swatchMats = [
    material(0x527151, 0.1, 0.5),
    material(0xadbba0, 0.1, 0.5),
    material(0xecebdd, 0.1, 0.5),
  ];
  swatchMats.forEach((m, i) => {
    const card = box(0.42, 0.58, 0.045, 0.045, m, swatches, [
      (i - 1) * 0.39,
      0,
      i * 0.025,
    ]);
    card.rotation.z = (i - 1) * -0.12;
  });
  swatches.position.set(3.0, 1.45, 1.6);
  const book = box(1.15, 0.15, 0.78, 0.055, teal, world, [3.3, 0.0, -1.1]);
  book.rotation.y = 0.18;
  box(1.08, 0.07, 0.73, 0.02, white, world, [3.3, 0.11, -1.1]);

  let width = 1,
    height = 1,
    inView = true,
    disposed = false,
    lost = false,
    needsRender = true;
  const resize = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    needsRender = true;
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver(
    (entries) => {
      inView = entries[0]?.isIntersecting ?? true;
    },
    { rootMargin: "100px" },
  );
  intersection.observe(host);
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    options.onError();
  };
  renderer.domElement.addEventListener("webglcontextlost", onLost);
  let last = 0,
    time = 0,
    painted = -100,
    lastDecision: Decision = "pending",
    lastCampaignDecision: Decision = "pending",
    lastPaint = 0,
    lastProgress = -100;
  const gaze = new T.Vector3(),
    cameraTarget = new T.Vector3();
  function poseRobot(
    bot: Robot,
    index: number,
    p: number,
    t: number,
    still: boolean,
  ) {
    const work = [
      smooth(p, 0.2, 0.85) * (1 - smooth(p, 1.5, 2.3)),
      smooth(p, 1.25, 1.9) * (1 - smooth(p, 2.7, 3.3)),
      smooth(p, 2.3, 2.9) * (1 - smooth(p, 3.5, 4.1)),
    ][index];
    const handoff = smooth(p, 3.4, 4.2);
    bot.root.position.copy(bot.base);
    bot.root.position.y += still ? 0 : Math.sin(t * 1.25 + index * 1.8) * 0.025;
    if (index === 0) {
      bot.root.position.x += work * 0.16 - handoff * 0.1;
      bot.root.rotation.y = 0.35 - work * 0.17;
    }
    if (index === 1) {
      bot.root.position.x -= work * 0.18 - handoff * 0.13;
      bot.root.rotation.y = -0.35 + work * 0.13;
    }
    if (index === 2) {
      bot.root.position.x += smooth(p, 2.2, 3) * 0.45;
      bot.root.rotation.y = -0.1 + work * 0.25;
    }
    bot.head.rotation.y =
      (index === 0 ? 0.14 : index === 1 ? -0.2 : 0.15) * (0.3 + work) +
      (still ? 0 : Math.sin(t * 0.45 + index) * 0.035);
    bot.head.rotation.x = 0.02 + work * 0.12;
    bot.head.rotation.z =
      (index === 0 ? -0.045 : 0.04) +
      (still ? 0 : Math.sin(t * 0.7 + index) * 0.018);
    const wave = still ? 0 : Math.sin(t * 1.7 + index) * work * 0.055;
    bot.right.rotation.set(
      -0.35 - work * 0.8 - wave,
      0,
      -0.16 - work * 0.65 + handoff * 0.2,
    );
    bot.left.rotation.set(
      -0.35 - work * 0.4 + wave,
      0,
      0.16 + work * 0.3 - handoff * 0.12,
    );
    const blink = still
      ? 1
      : Math.pow(Math.max(0, Math.sin(t * 1.15 + index * 2.3)), 48);
    bot.eyes.forEach((eye) => (eye.scale.y = still ? 1 : 1 - blink * 0.9));
  }
  renderer.setAnimationLoop((now: number) => {
    if (disposed || lost) return;
    const dt = Math.min((now - last) / 1000 || 0.016, 0.05);
    last = now;
    if (!inView || document.hidden) return;
    const still = options.reduced(),
      p = options.progress(),
      decision = options.decision();
    if (
      still &&
      !needsRender &&
      Math.abs(p - lastProgress) < 0.0001 &&
      decision === lastDecision
    )
      return;
    needsRender = false;
    lastProgress = p;
    if (!still) time += dt;
    const cameraDrift = still ? 0 : Math.sin(p * 0.7) * 0.28;
    const aspect = width / height,
      distance = Math.max(14.8, 18.5 / aspect);
    camera.position.set(
      0.8 + cameraDrift,
      4.35 + Math.sin(p * 0.45) * 0.12,
      distance,
    );
    cameraTarget.set(0.15, 2.05, 0);
    camera.lookAt(cameraTarget);
    world.rotation.y = still ? 0 : Math.sin(p * 0.48) * -0.055;
    board.position.y = 2.12 + Math.sin(p * 0.6) * 0.04;
    board.rotation.y = -0.09 + smooth(p, 3, 4.5) * 0.06;
    const sourceIn = smooth(p, 0.1, 0.95),
      languageIn = smooth(p, 2.2, 3.05),
      reviewIn = smooth(p, 3.45, 4.25);
    sourcePanel.position.set(
      mix(-4.1, -3.1, sourceIn),
      mix(0.45, 2.95, sourceIn),
      mix(-0.6, 1.25, sourceIn),
    );
    sourcePanel.scale.setScalar(mix(0.45, 1, sourceIn));
    sourcePanel.rotation.z = -0.05 + (still ? 0 : Math.sin(time * 0.6) * 0.008);
    languagePanel.position.set(
      mix(4.5, 2.15, languageIn),
      mix(0.55, 3.05, languageIn),
      mix(-1.3, 0.9, languageIn),
    );
    languagePanel.scale.setScalar(mix(0.18, 1, languageIn));
    languagePanel.visible = languageIn > 0.002;
    receipt.position.set(0.3, mix(-0.55, 0.65, reviewIn), 1.8);
    receipt.scale.setScalar(mix(0.5, 1, reviewIn));
    receipt.visible = reviewIn > 0.002;
    swatches.position.y = 0.82 + smooth(p, 1.2, 2) * 0.18;
    swatches.rotation.z = still ? 0 : Math.sin(time * 0.5) * 0.025;
    sourceBot.root.visible = true;
    [sourceBot, visualBot, languageBot].forEach((bot, index) =>
      poseRobot(bot, index, p, time, still),
    );
    linkMat.opacity = sourceIn * 0.8 * (1 - reviewIn * 0.4);
    gaze.copy(linkCurve.getPoint(still ? 0.5 : (time * 0.18) % 1));
    spark.position.copy(gaze);
    spark.visible = sourceIn > 0.6;
    if (
      (Math.abs(p - painted) > 0.012 && now - lastPaint > 45) ||
      decision !== lastCampaignDecision
    ) {
      paintCampaign(p, decision);
      painted = p;
      lastPaint = now;
      lastCampaignDecision = decision;
    }
    if (decision !== lastDecision) {
      paintReceipt(decision);
      lastDecision = decision;
    }
    renderer.render(scene, camera);
  });
  await document.fonts.ready;
  if (!disposed) {
    paintCampaign(options.progress(), options.decision());
    options.onReady();
  }
  return {
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      intersection.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      resources.forEach((r) => r.dispose());
      environmentTarget.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
