import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// ---------- Scene layout ----------
// The horizon sits a quarter of the way up from the bottom of the screen.
// The camera tilts up just enough to put it there, which keeps the camera
// low and level with the toad so its face is visible.
const FOV = 35;                 // vertical field of view, degrees
const HORIZON_NDC = -0.5;       // -1 is the bottom of the screen, 0 the middle
const CAMERA_HEIGHT = 0.35;     // metres above the ground
const TOAD_LENGTH = 0.5;        // the model is normalised to 1 unit long
const HORIZON_COLOR = 0x3a2c1e; // must match --horizon in style.css
const MIN_HOP = 0.8;            // shortest hop, in metres
const MAX_HOP = 1.1;            // longest single hop when jumping onto a new page

const canvas = document.getElementById('scene');
const hint = document.getElementById('hint');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HORIZON_COLOR, 5, 38);

const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200);
camera.position.set(0, CAMERA_HEIGHT, 0);
const halfFov = THREE.MathUtils.degToRad(FOV / 2);
const pitch = Math.atan(-HORIZON_NDC * Math.tan(halfFov));
camera.rotation.x = pitch;

// Nearest ground point visible at the bottom edge of the screen.
const nearestGround = CAMERA_HEIGHT / Math.tan(halfFov - pitch);
const NEAR_SPOT = nearestGround + TOAD_LENGTH * 0.9;
const FAR_SPOT = nearestGround * 3.4;

// ---------- Ground ----------
function soilTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#3a2e22';
  g.fillRect(0, 0, size, size);
  // Speckles of lighter earth, dark crumbs and the odd green fleck of moss.
  const specks = [['#5a4632', 0.55, 2600], ['#1f170e', 0.7, 2600], ['#4f5236', 0.4, 600], ['#6d5a44', 0.35, 700]];
  for (const [color, alpha, count] of specks) {
    g.fillStyle = color;
    g.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      const r = Math.random() * 2.4 + 0.4;
      g.beginPath();
      g.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ map: soilTexture(), roughness: 1, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- Light ----------
scene.add(new THREE.HemisphereLight(0xc9c0b4, 0x2e2114, 1.5));

const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
key.position.set(1.5, 3.5, 1.5);
key.target.position.set(0, 0, -(NEAR_SPOT + FAR_SPOT) / 2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 20 });
key.shadow.radius = 4;
key.shadow.bias = -0.0005;
scene.add(key, key.target);

// A faint toadstool-red light from behind, to lift the toad off the ground.
const rim = new THREE.DirectionalLight(0xd65f6a, 0.35);
rim.position.set(-2, 1.2, -12);
scene.add(rim);

// ---------- Sizing ----------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => {
  resize();
  if (toad && pending === 0) toad.position.copy(clampToView(toad.position));
});
resize();

// ---------- Where the toad may sit ----------
// Anywhere on the ground between the bottom edge of the screen and a
// comfortable distance before the horizon, kept inside the left/right edges.
// Half the width of the ground the camera sees at a depth.
const visibleHalfWidth = depth => depth * Math.tan(halfFov) * camera.aspect;

function halfWidthAt(depth) {
  return Math.max(0, visibleHalfWidth(depth) * 0.82 - TOAD_LENGTH * 0.6);
}

function randomSpot() {
  // Square the random number so nearer (bigger) positions come up more often.
  const t = Math.random() ** 1.6;
  const depth = THREE.MathUtils.lerp(NEAR_SPOT, FAR_SPOT, t);
  const half = halfWidthAt(depth);
  return new THREE.Vector3(THREE.MathUtils.randFloatSpread(half * 2), 0, -depth);
}

function clampToView(p) {
  const depth = THREE.MathUtils.clamp(-p.z, NEAR_SPOT, FAR_SPOT);
  const half = halfWidthAt(depth);
  return new THREE.Vector3(THREE.MathUtils.clamp(p.x, -half, half), 0, -depth);
}

function pickTarget(from) {
  let best = null;
  let bestDistance = -1;
  for (let i = 0; i < 25; i++) {
    const spot = randomSpot();
    const d = spot.distanceTo(from);
    if (d >= MIN_HOP) return spot;
    if (d > bestDistance) { best = spot; bestDistance = d; }
  }
  return best;
}

// Yaw that turns the model's face (+Z in the file) towards a point.
const yawTowards = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const facingViewer = p => yawTowards(p, camera.position) + THREE.MathUtils.randFloatSpread(0.6);

// ---------- Animation helpers ----------
const ease = {
  inOut: t => t * t * (3 - 2 * t),
  out: t => 1 - (1 - t) ** 3,
};

function play(duration, step) {
  return new Promise(resolve => {
    const start = performance.now();
    const frame = now => {
      const t = Math.min((now - start) / duration, 1);
      step(t);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

function shortestAngle(from, to) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

async function turnTo(yaw, ms) {
  const from = toad.rotation.y;
  const to = shortestAngle(from, yaw);
  await play(ms, t => { toad.rotation.y = THREE.MathUtils.lerp(from, to, ease.inOut(t)); });
}

// ---------- The toad ----------
let toad = null;      // outer group: position and heading
let body = null;      // inner group: squash, stretch and pitch during a hop
const toadMeshes = [];

// Hops and page changes run one after another, never on top of each other.
let queue = Promise.resolve();
let pending = 0;
function enqueue(action) {
  pending++;
  queue = queue.then(action).catch(console.error).finally(() => { pending--; });
  return queue;
}

// One leap from where the toad is to a target on the ground. Placeholder made
// in code; it will be replaced by the hop animation made in Blender.
async function leap(target) {
  const from = toad.position.clone();
  await turnTo(yawTowards(from, target), 220);

  // Crouch.
  await play(120, t => { const k = ease.inOut(t); body.scale.set(1 + 0.06 * k, 1 - 0.12 * k, 1 + 0.06 * k); });

  // Leap: an arc, nose up on the way up and down on the way in.
  const distance = from.distanceTo(target);
  const height = 0.12 + distance * 0.16;
  await play(THREE.MathUtils.clamp(distance * 260, 360, 720), t => {
    toad.position.lerpVectors(from, target, t);
    toad.position.y = height * 4 * t * (1 - t);
    body.rotation.x = THREE.MathUtils.lerp(-0.45, 0.35, t);
    const stretch = Math.sin(Math.PI * t) * 0.1;
    body.scale.set(1 - stretch * 0.4, 1 + stretch, 1 - stretch * 0.4);
  });

  // Land and settle.
  toad.position.copy(target);
  await play(200, t => {
    const squash = Math.sin(Math.PI * t) * (1 - t);
    body.rotation.x = 0.35 * (1 - ease.out(t));
    body.scale.set(1 + 0.12 * squash, 1 - 0.2 * squash, 1 + 0.12 * squash);
  });
  body.rotation.x = 0;
  body.scale.setScalar(1);
}

// Disappear and pop up somewhere else, for people who prefer less motion.
async function blink(target) {
  await play(220, t => body.scale.setScalar(Math.max(0.001, 1 - t)));
  toad.position.copy(target);
  toad.rotation.y = facingViewer(target);
  await play(220, t => body.scale.setScalar(Math.max(0.001, t)));
}

// Tapped: hop to another spot on this page.
async function hop() {
  hint.classList.add('is-hidden');
  const target = pickTarget(toad.position);
  if (reducedMotion.matches) return blink(target);
  await leap(target);
  await turnTo(facingViewer(target), 420);
}

// The model's shape data is meshopt-compressed and its texture is WebP, which
// keeps the download about half the size; the decoder unpacks the shape.
new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
  'assets/toad.glb',
  gltf => {
    const model = gltf.scene;
    model.scale.setScalar(TOAD_LENGTH);
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.material.roughness = 0.75;
        toadMeshes.push(o);
      }
    });

    body = new THREE.Group();
    body.add(model);
    toad = new THREE.Group();
    toad.add(body);
    scene.add(toad);

    // On a year page the toad sits at its side of the screen, as in Figma.
    const spot = page in LANDING_SIDE ? landingSpot(LANDING_SIDE[page]) : randomSpot();
    toad.position.copy(spot);
    toad.rotation.y = facingViewer(spot);
    hint.textContent = 'Tap the toad';

    // Pop up out of the ground where it first appears.
    body.scale.setScalar(0.001);
    play(500, t => body.scale.setScalar(Math.max(0.001, ease.out(t))));
  },
  undefined,
  err => {
    console.error(err);
    hint.textContent = 'The toad could not be loaded. Open the page through a local server (see README).';
  }
);

// ---------- Tapping ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function hitsToad(event) {
  if (!toad) return false;
  // The canvas moves up when a page scrolls, so measure from where it is now.
  const r = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(toadMeshes, false).length > 0;
}

canvas.addEventListener('pointerdown', event => {
  if (pending === 0 && hitsToad(event)) enqueue(hop);
});

// ---------- Pages ----------
// The pages sit side by side in time: 2026, home, 2027. Going forward the
// view pans right, the toad is left behind and hops in after you from the
// left; going back it follows from the right. Info and Krølle-Bølle sit
// outside that row: they are plain dark, so the night scene fades out behind them.
const ORDER = { 2026: 0, home: 1, 2027: 2 };
const LANDING_SIDE = { 2026: 1, 2027: -1 };   // where the toad sits when a year page is opened directly
const TITLES = { home: 'Absalons Have', info: 'Info · Absalons Have', 'krolle-bolle': 'Krølle-Bølle · Absalons Have', 2026: 'Absalons Have 2026', 2027: 'Absalons Have 2027' };
// Pages with a plain dark background instead of the night scene.
const FLAT = new Set(['info', 'krolle-bolle']);
const pageEls = Object.fromEntries([...document.querySelectorAll('.page')].map(el => [el.dataset.page, el]));

// '' is home; #info, #krolle-bolle and the years are pages; the id of an Info
// section opens the Info page at that section. Anything else is not a page.
function pageFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id === '') return 'home';
  if (id in TITLES && id !== 'home') return id;
  return infoSectionFromHash() ? 'info' : null;
}

function infoSectionFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const el = id && document.getElementById(id);
  return el && el.matches('.page-info details') ? el : null;
}

// Open the Info section named in the address and scroll it into view.
function openInfoSection() {
  const section = infoSectionFromHash();
  if (!section) return;
  section.hidden = false;
  section.open = true;
  // Wait for the page change to show the Info page before scrolling.
  setTimeout(() => section.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' }), 400);
}

let page = pageFromHash() ?? 'home';
for (const [id, el] of Object.entries(pageEls)) el.hidden = id !== page;
document.title = TITLES[page];
document.body.classList.toggle('is-flat', FLAT.has(page));
if (page !== 'home') hint.classList.add('is-hidden');

// A spot near the front of the ground, at the left (-1) or right (+1) side.
function landingSpot(side) {
  const depth = THREE.MathUtils.lerp(NEAR_SPOT, FAR_SPOT, 0.12);
  return new THREE.Vector3(side * halfWidthAt(depth), 0, -depth);
}

// Slide the old page's text out and the new one in, in the direction of travel.
function swapText(oldEl, newEl, dir) {
  newEl.hidden = false;
  if (reducedMotion.matches) {
    oldEl.hidden = true;
    return;
  }
  const shift = 6 * dir;
  oldEl.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-shift}vw)` }],
    { duration: 450, easing: 'ease-in', fill: 'forwards' })
    .finished.then(() => {
      oldEl.getAnimations().forEach(a => a.cancel());
      if (oldEl !== pageEls[page]) oldEl.hidden = true;   // unless we have already come back to it
    });
  newEl.animate([{ opacity: 0, transform: `translateX(${shift}vw)` }, { opacity: 1, transform: 'none' }],
    { duration: 500, delay: 350, easing: 'ease-out', fill: 'backwards' });
}

// The view moves sideways: the ground (and the toad sitting on it) slides the
// other way until the toad is off screen.
async function pan(dir) {
  let distance = visibleHalfWidth(NEAR_SPOT) * 1.5;
  if (toad) {
    const w = visibleHalfWidth(-toad.position.z) + TOAD_LENGTH;
    distance = Math.max(distance, Math.abs(toad.position.x + dir * w));
  }
  const groundFrom = ground.position.x;
  const toadFrom = toad ? toad.position.x : 0;
  await play(THREE.MathUtils.clamp(distance * 450, 650, 1100), t => {
    const dx = -dir * distance * ease.inOut(t);
    ground.position.x = groundFrom + dx;
    if (toad) toad.position.x = toadFrom + dx;
  });
  // The soil pattern repeats every tile, so jump back by whole tiles to keep
  // the ground from ever running out.
  const tile = 400 / 90;
  ground.position.x = ((ground.position.x % tile) + tile) % tile;
}

// Hop in from just past the edge of the screen to a spot on that side.
async function hopIn(side) {
  const land = landingSpot(side);
  const depth = -land.z;
  const start = new THREE.Vector3(side * (visibleHalfWidth(depth) + TOAD_LENGTH), 0, -depth);
  toad.position.copy(start);
  toad.rotation.y = yawTowards(start, land);
  const hops = Math.max(1, Math.ceil(start.distanceTo(land) / MAX_HOP));
  for (let i = 1; i <= hops; i++) await leap(start.clone().lerp(land, i / hops));
  await turnTo(facingViewer(land), 420);
}

async function changePage(from, to) {
  const viaFlat = FLAT.has(to) || FLAT.has(from);
  const dir = viaFlat ? 0 : Math.sign(ORDER[to] - ORDER[from]);
  document.title = TITLES[to];
  hint.classList.add('is-hidden');
  const column = pageEls[to].querySelector('.info-scroll, .story-scroll, .programme');
  if (column) column.scrollTop = 0;
  document.body.classList.toggle('is-flat', FLAT.has(to));
  swapText(pageEls[from], pageEls[to], dir);
  pageEls[to].querySelector('h1').focus({ preventScroll: true });

  // To and from the plain pages the scene just fades; the toad stays where it was.
  if (!toad || viaFlat) return;
  if (reducedMotion.matches) return blink(landingSpot(-dir));
  await pan(dir);
  await hopIn(-dir);
}

// On 2026 the year, the dates and the play button scroll up together with
// the line-up window.
for (const el of document.querySelectorAll('.page-lift')) {
  const column = el.querySelector('.programme');
  column.addEventListener('scroll', () => el.style.setProperty('--lift', column.scrollTop), { passive: true });
}

// The line-up window scrolls with the mouse wheel wherever the pointer is,
// not only over the window itself.
window.addEventListener('wheel', event => {
  const column = pageEls[page].querySelector('.programme');
  if (!column || column.contains(event.target)) return;
  column.scrollBy({ top: event.deltaY, left: 0 });
}, { passive: true });

// ---------- Play button ----------
// Toggles between the play triangle and the spinning logo. The track will be
// started and stopped here once it exists.
for (const button of document.querySelectorAll('.play')) {
  button.addEventListener('click', () => {
    const playing = button.classList.toggle('is-playing');
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', playing ? 'Pause track' : 'Play track');
  });
}

// ---------- Info search ----------
// Shows only the sections whose title or text contains every word typed.
const infoSearch = document.getElementById('info-search');
const infoSections = [...pageEls.info.querySelectorAll('.info-list details')];
const infoEmpty = pageEls.info.querySelector('.info-empty');
infoSearch.addEventListener('input', () => {
  const words = infoSearch.value.toLocaleLowerCase('da').split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const section of infoSections) {
    const text = section.textContent.toLocaleLowerCase('da');
    const match = words.every(w => text.includes(w));
    section.hidden = !match;
    if (match) shown++;
  }
  infoEmpty.hidden = shown > 0;
});

window.addEventListener('hashchange', () => {
  const to = pageFromHash();
  if (!to) return;
  if (to !== page) {
    const from = page;
    page = to;
    enqueue(() => changePage(from, to));
  }
  openInfoSection();
});
openInfoSection();
canvas.addEventListener('pointermove', event => {
  if (event.pointerType === 'mouse') canvas.classList.toggle('is-over-toad', hitsToad(event));
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
