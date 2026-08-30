// game/terrain.js
// Procedural heightmap terrain streamed in chunks along the rail, plus
// instanced props (rocks, city blocks, floating debris) and landmark arches.
// The height function is deterministic from the level seed, and the rail's
// altitude is derived from it so the ship always flies above the ground.

import * as THREE from 'three';

// ---- Deterministic 2D value noise (fBm) ----
function makeNoise(seed) {
  function hash(x, y) {
    let h = (seed | 0) + (x | 0) * 374761393 + (y | 0) * 668265263;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  function value(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function fbm(x, y) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < 4; o++) { sum += value(x * freq, y * freq) * amp; norm += amp; amp *= 0.5; freq *= 2.02; }
    return sum / norm;
  }
  return { fbm };
}

const CHUNK_SIZE = 220, CHUNK_SEG = 44, CHUNK_SPACING = 150, NUM_CHUNKS = 9;

// Standalone height function (deterministic from seed). main.js uses this to
// build the rail's altitude BEFORE creating the terrain, so the ship always
// flies above the ground. Same seed => identical heights.
export function makeHeight(tc) {
  const noise = makeNoise(tc.seed);
  return (x, z) => tc.base + (noise.fbm(x * tc.scale, z * tc.scale) - 0.5) * 2 * tc.amplitude;
}

export function createTerrain(scene, level) {
  const tc = level.terrain;
  const heightAt = makeHeight(tc);

  // ---- Terrain chunks ----
  const groundMat = new THREE.MeshStandardMaterial({
    color: tc.groundColor, roughness: 0.95, metalness: 0.0, flatShading: true,
  });
  const chunks = [];
  const baseGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEG, CHUNK_SEG);
  baseGeo.rotateX(-Math.PI / 2); // lie flat in XZ

  for (let i = 0; i < NUM_CHUNKS; i++) {
    const geo = baseGeo.clone();
    const mesh = new THREE.Mesh(geo, groundMat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    scene.add(mesh);
    chunks.push({ mesh, geo, d: 0 });
  }

  function displaceChunk(chunk, rail) {
    const f = rail.getFrame(chunk.d, rail.frame);
    const pos = chunk.geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), lz = pos.getZ(i);
      const wx = f.pos.x + lx, wz = f.pos.z + lz;
      pos.setY(i, heightAt(wx, wz));
    }
    pos.needsUpdate = true;
    chunk.geo.computeVertexNormals();
    chunk.mesh.position.set(f.pos.x, 0, f.pos.z);
  }

  // ---- Instanced props ----
  const dummy = new THREE.Object3D();
  const props = [];

  function makeInstances(geo, mat, count, placeFn) {
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      placeFn(i, dummy);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
    props.push(im);
    return im;
  }

  // Rocks on the ground.
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: tc.rockColor, roughness: 0.9, flatShading: true });
  const rockCount = tc.rockCount || 2200;
  makeInstances(rockGeo, rockMat, rockCount, (i, d) => {
    const dist = (i / rockCount) * level.railLength + Math.random() * 40;
    const f = level.rail.getFrame(dist, level.rail.frame);
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 90;
    const wx = f.pos.x + Math.cos(a) * r, wz = f.pos.z + Math.sin(a) * r;
    const s = 1 + Math.random() * 4;
    d.position.set(wx, heightAt(wx, wz) + s * 0.3, wz);
    d.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    d.scale.set(s, s * (0.6 + Math.random() * 0.8), s);
  });

  // City blocks (chrome skyline) in the city zone.
  if (tc.city) {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.MeshStandardMaterial({ color: tc.cityColor, metalness: 0.85, roughness: 0.25, flatShading: true });
    const count = tc.cityCount || 1400;
    makeInstances(boxGeo, boxMat, count, (i, d) => {
      const t = i / count;
      const dist = tc.city.start + t * (tc.city.end - tc.city.start);
      const f = level.rail.getFrame(dist, level.rail.frame);
      const side = i % 2 === 0 ? 1 : -1;
      const off = 25 + Math.random() * 70;
      const wx = f.pos.x + f.right.x * side * off + (Math.random() - 0.5) * 20;
      const wz = f.pos.z + f.right.z * side * off + (Math.random() - 0.5) * 20;
      const h = 6 + Math.random() * 40;
      d.position.set(wx, heightAt(wx, wz) + h / 2, wz);
      d.rotation.set(0, Math.random() * 0.4, 0);
      d.scale.set(4 + Math.random() * 6, h, 4 + Math.random() * 6);
    });
  }

  // Floating debris (asteroid-belt feel).
  const debGeo = new THREE.DodecahedronGeometry(1, 0);
  const debMat = new THREE.MeshStandardMaterial({ color: tc.debrisColor, roughness: 0.8, flatShading: true });
  const debCount = tc.debrisCount || 1400;
  makeInstances(debGeo, debMat, debCount, (i, d) => {
    const dist = (i / debCount) * level.railLength + Math.random() * 60;
    const f = level.rail.getFrame(dist, level.rail.frame);
    const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 80;
    const wx = f.pos.x + Math.cos(a) * r, wz = f.pos.z + Math.sin(a) * r;
    const wy = f.pos.y + (Math.random() - 0.5) * 60;
    const s = 0.5 + Math.random() * 2.5;
    d.position.set(wx, wy, wz);
    d.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    d.scale.setScalar(s);
  });

  // ---- Landmark arches to fly through ----
  const arches = [];
  const archMat = new THREE.MeshStandardMaterial({ color: tc.accentColor, metalness: 0.6, roughness: 0.4, flatShading: true, emissive: tc.accentColor, emissiveIntensity: 0.3 });
  (tc.arches || [0.2, 0.5, 0.8]).forEach((frac) => {
    const f = level.rail.getFrame(frac * level.railLength, level.rail.frame);
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(4, 26, 4), archMat);
      pillar.position.set(s * 16, 13, 0); pillar.castShadow = true; g.add(pillar);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(40, 4, 4), archMat);
    top.position.set(0, 27, 0); top.castShadow = true; g.add(top);
    g.position.set(f.pos.x, heightAt(f.pos.x, f.pos.z), f.pos.z);
    g.quaternion.setFromRotationMatrix(f.matrix);
    scene.add(g); arches.push(g);
  });

  // ---- Streaming ----
  function update(rail, playerD) {
    for (const c of chunks) {
      if (c.d < playerD - 2 * CHUNK_SPACING) {
        c.d += NUM_CHUNKS * CHUNK_SPACING;
        displaceChunk(c, rail);
      }
    }
  }

  function init(rail) {
    for (let i = 0; i < NUM_CHUNKS; i++) {
      chunks[i].d = -2 * CHUNK_SPACING + i * CHUNK_SPACING;
      displaceChunk(chunks[i], rail);
    }
  }

  return {
    heightAt,
    init,
    update,
    dispose() {
      for (const c of chunks) { scene.remove(c.mesh); c.geo.dispose(); }
      for (const p of props) { scene.remove(p); p.geometry.dispose(); }
      for (const a of arches) { scene.remove(a); a.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
      groundMat.dispose(); rockMat.dispose(); debMat.dispose(); archMat.dispose();
    },
  };
}
