import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface BrickLink {
  href: string;
  title: string;
  meta: string;
}

interface Brick {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  body: CANNON.Body;
  link: BrickLink | null;
}

// 실제 레고 비율(돌기 간격 8mm, 높이 9.6mm, 돌기 지름 4.8mm, 돌기 높이 1.7mm)
const PITCH = 1;
const HEIGHT = PITCH * 1.2;
const STUD_R = PITCH * 0.3;
const STUD_H = PITCH * 0.2125;
const SIZES: [number, number][] = [
  [2, 4],
  [2, 2],
  [1, 4],
  [1, 2],
  [2, 3],
  [1, 3],
];
const DEPTH = 2.6; // 블록이 쌓이는 공간의 앞뒤 절반 두께
const MIN_HALF_WIDTH = 7; // 세로 화면에서도 블록이 쌓일 만큼의 폭을 확보한다

// 돌기: 윗면 모서리를 살짝 둥글린 원기둥.
// LatheGeometry 는 점 순서로 면 방향이 정해지므로 옆면은 아래→위, 윗면은 바깥→가운데 순서로 둔다.
function studGeometry() {
  const f = STUD_H * 0.25;
  const pts = [new THREE.Vector2(STUD_R, 0), new THREE.Vector2(STUD_R, STUD_H - f)];
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(STUD_R - f + Math.cos(a) * f, STUD_H - f + Math.sin(a) * f));
  }
  pts.push(new THREE.Vector2(0, STUD_H));
  return new THREE.LatheGeometry(pts, 28).toNonIndexed();
}

// 몸통 중심이 원점에 오도록 만든다(물리 상자와 위치를 맞추기 위해).
function brickGeometry(w: number, d: number, stud: THREE.BufferGeometry) {
  const parts: THREE.BufferGeometry[] = [new RoundedBoxGeometry(w * PITCH, HEIGHT, d * PITCH, 3, PITCH * 0.05)];
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      parts.push(stud.clone().translate((i - (w - 1) / 2) * PITCH, HEIGHT / 2 - 0.002, (j - (d - 1) / 2) * PITCH));
    }
  }
  return mergeGeometries(parts);
}

const COLORS = [
  { color: '#0a1ee6', roughness: 0.22, env: 0.55 },
  { color: '#d6d6dc', roughness: 0.25, env: 0.8 },
  { color: '#060607', roughness: 0.18, env: 1 },
  { color: '#1428d8', roughness: 0.45, env: 0.6 },
  { color: '#a9a9b2', roughness: 0.4, env: 0.8 },
];

export class Bricks {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private world = new CANNON.World({ gravity: new CANNON.Vec3(0, -30, 0) });
  private bricks: Brick[] = [];
  private walls: CANNON.Body[] = [];
  private pusher: CANNON.Body;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(9, 9);
  private pointerActive = false;
  private hovered: Brick | null = null;
  private visible = false;
  private dropped = 0;
  private dropTimer = 0;
  private frame = 0;
  private last = performance.now();
  private halfW = 1;
  private halfH = 1;
  private camZ = 26;
  private io: IntersectionObserver;
  private ro: ResizeObserver;

  constructor(
    private canvas: HTMLCanvasElement,
    links: BrickLink[],
    private opts: { reduced: boolean; onHover: (link: BrickLink | null) => void; onClick: (link: BrickLink) => void },
  ) {
    const small = matchMedia('(max-width: 720px)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !small;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const key = new THREE.DirectionalLight('#ffffff', 2);
    key.position.set(6, 18, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    const sc = key.shadow.camera;
    sc.left = -22;
    sc.right = 22;
    sc.top = 16;
    sc.bottom = -16;
    sc.near = 1;
    sc.far = 60;
    this.scene.add(key);


    // 물리 설정: 쌓였을 때 덜 떨리도록 반복 횟수를 늘리고, 멈춘 블록은 재운다.
    this.world.allowSleep = true;
    (this.world.solver as CANNON.GSSolver).iterations = 12;
    this.world.defaultContactMaterial.friction = 0.45;
    this.world.defaultContactMaterial.restitution = 0.15;

    // 마우스를 따라다니며 블록을 밀어내는 보이지 않는 공
    this.pusher = new CANNON.Body({ type: CANNON.Body.KINEMATIC, shape: new CANNON.Sphere(1.6) });
    this.pusher.position.set(0, 999, 0);
    this.world.addBody(this.pusher);

    // 물리 몸체는 떨어뜨릴 때 world 에 넣는다.
    // 장식용 블록을 먼저 떨어뜨리고, 라이트업 블록은 마지막에 떨어뜨려 더미 위쪽(잘 보이는 곳)에 놓이게 한다.
    const count = Math.max(links.length + 10, small ? 36 : 64);
    const stud = studGeometry();
    const geos = SIZES.map(([w, d]) => brickGeometry(w, d, stud));
    for (let i = 0; i < count; i++) {
      const link = links[i - (count - links.length)] ?? null;
      const k = i % SIZES.length;
      const [w, d] = SIZES[k];
      const c = COLORS[(i * 3 + (i >> 2)) % COLORS.length];
      const mesh = new THREE.Mesh(
        geos[k],
        new THREE.MeshPhysicalMaterial({
          color: c.color,
          roughness: c.roughness,
          clearcoat: 0.5,
          clearcoatRoughness: 0.1,
          envMapIntensity: c.env,
        }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      mesh.userData.index = i;
      this.scene.add(mesh);

      const body = new CANNON.Body({
        mass: w * d,
        shape: new CANNON.Box(new CANNON.Vec3((w * PITCH) / 2, (HEIGHT + STUD_H * 0.6) / 2, (d * PITCH) / 2)),
        linearDamping: 0.05,
        angularDamping: 0.1,
        sleepSpeedLimit: 0.3,
        sleepTimeLimit: 0.6,
      });
      this.bricks.push({ mesh, body, link });
    }

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('click', this.onClick);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting), { threshold: 0.2 });
    this.io.observe(canvas);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // 화면이 좁으면 카메라를 뒤로 빼서 쌓일 공간을 넓힌다
    this.camZ = Math.max(26, (MIN_HALF_WIDTH / (tan * this.camera.aspect)) * 1.1 + DEPTH);
    this.camera.position.set(0, 0, this.camZ);
    this.camera.updateProjectionMatrix();
    this.halfH = tan * this.camZ;
    this.halfW = this.halfH * this.camera.aspect;
    this.buildWalls();
  }

  // 창의 아래/양옆/앞뒤에 보이지 않는 벽을 세운다. 앞쪽 벽 기준으로 화면 끝에 맞춘다.
  private buildWalls() {
    this.walls.forEach((b) => this.world.removeBody(b));
    const front = (this.camZ - DEPTH) / this.camZ;
    const hw = this.halfW * front;
    const hh = this.halfH * front;
    const plane = (pos: [number, number, number], euler: [number, number, number]) => {
      const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
      b.position.set(...pos);
      b.quaternion.setFromEuler(...euler);
      this.world.addBody(b);
      return b;
    };
    this.walls = [
      plane([0, -hh, 0], [-Math.PI / 2, 0, 0]),
      plane([-hw, 0, 0], [0, Math.PI / 2, 0]),
      plane([hw, 0, 0], [0, -Math.PI / 2, 0]),
      plane([0, 0, -DEPTH], [0, 0, 0]),
      plane([0, 0, DEPTH], [0, Math.PI, 0]),
    ];
    this.bricks.forEach((b) => b.body.wakeUp());
  }

  private ndc(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private pick(p: THREE.Vector2) {
    this.raycaster.setFromCamera(p, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.bricks.filter((b) => b.mesh.visible).map((b) => b.mesh),
      false,
    )[0];
    return hit ? this.bricks[hit.object.userData.index] : null;
  }

  private onPointerMove = (e: PointerEvent) => {
    this.pointer.copy(this.ndc(e));
    this.pointerActive = true;
  };

  private onPointerLeave = () => {
    this.pointerActive = false;
    this.setHovered(null);
  };

  // 터치에서는 pointermove 없이 바로 click 이 오므로 누른 위치에서 다시 찾는다.
  private onClick = (e: MouseEvent) => {
    const link = this.pick(this.ndc(e))?.link;
    if (link) this.opts.onClick(link);
  };

  private setHovered(b: Brick | null) {
    if (b === this.hovered) return;
    this.hovered?.mesh.material.emissive.set('#000000');
    this.hovered = b;
    b?.mesh.material.emissive.set('#1b2bff').multiplyScalar(0.35);
    this.opts.onHover(b?.link ?? null);
  }

  private drop(b: Brick) {
    const [w, d] = SIZES[b.mesh.userData.index % SIZES.length];
    const front = (this.camZ - DEPTH) / this.camZ;
    const span = this.halfW * front - Math.max(w, d) * PITCH * 0.6;
    if (!b.body.world) this.world.addBody(b.body);
    b.body.position.set((Math.random() * 2 - 1) * span, this.halfH + 3 + Math.random() * 2, (Math.random() * 2 - 1) * (DEPTH - 1));
    b.body.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    b.body.velocity.set(0, -6, 0);
    b.body.angularVelocity.set(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3);
    b.body.wakeUp();
    b.mesh.visible = true;
  }

  private tick = () => {
    this.frame = requestAnimationFrame(this.tick);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    if (!this.visible) return;

    // 창이 보이기 시작하면 하나씩 떨어뜨린다
    this.dropTimer -= dt;
    while (this.dropped < this.bricks.length && this.dropTimer <= 0) {
      this.drop(this.bricks[this.dropped++]);
      this.dropTimer += this.opts.reduced ? 0 : 0.045;
    }

    // 마우스 위치(z=0 평면)로 밀어내는 공을 옮긴다. 속도를 줘야 부딪힌 블록에 힘이 전달된다.
    if (this.pointerActive) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const ray = this.raycaster.ray;
      const target = ray.origin.clone().addScaledVector(ray.direction, -ray.origin.z / ray.direction.z);
      const p = this.pusher.position;
      if (p.y > 500) p.set(target.x, target.y, 0);
      this.pusher.velocity.set((target.x - p.x) / dt, (target.y - p.y) / dt, 0);
    } else {
      this.pusher.velocity.set(0, 0, 0);
      this.pusher.position.set(0, 999, 0);
    }

    this.world.fixedStep(1 / 60, dt);

    for (const b of this.bricks) {
      if (!b.mesh.visible) continue;
      b.mesh.position.copy(b.body.position as unknown as THREE.Vector3);
      b.mesh.quaternion.copy(b.body.quaternion as unknown as THREE.Quaternion);
      // 벽 밖으로 튕겨 나가면 다시 위에서 떨어뜨린다
      if (b.body.position.y < -this.halfH - 10 || Math.abs(b.body.position.x) > this.halfW + 10) this.drop(b);
    }

    if (this.pointerActive) {
      const hit = this.pick(this.pointer);
      this.setHovered(hit?.link ? hit : null);
    }

    this.renderer.render(this.scene, this.camera);
  };

  destroy() {
    cancelAnimationFrame(this.frame);
    this.io.disconnect();
    this.ro.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('click', this.onClick);
    const geos = new Set<THREE.BufferGeometry>();
    for (const b of this.bricks) {
      geos.add(b.mesh.geometry);
      b.mesh.material.dispose();
    }
    geos.forEach((g) => g.dispose());
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
