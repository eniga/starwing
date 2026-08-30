// game/rail.js
// The flight rail: a Catmull-Rom spline sampled by arc length. The player and
// camera travel forward along it; the player moves within a bounded window in
// the rail's local (right, up) plane.
//
// Frame at distance d (right-handed, forward = tangent):
//   right = normalize(cross(tangent, worldUp))
//   up    = cross(right, tangent)
// A guard swaps the reference up when the tangent goes near-vertical so the
// frame never degenerates.

import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const REF_UP2 = new THREE.Vector3(1, 0, 0);

export class RailFrame {
  constructor() {
    this.pos = new THREE.Vector3();
    this.tangent = new THREE.Vector3(0, 0, -1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    // A matrix built from the frame (columns: right, up, -tangent) for orienting
    // actors that should face forward along the rail.
    this.matrix = new THREE.Matrix4();
  }
}

export function createRail(points) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
  const totalLength = curve.getLength();

  const _t = new THREE.Vector3();
  const _r = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const _ref = new THREE.Vector3();

  function getFrame(d, f) {
    const t = Math.min(1, Math.max(0, d / totalLength));
    curve.getPointAt(t, f.pos);
    curve.getTangentAt(t, f.tangent);
    if (f.tangent.lengthSq() < 1e-6) f.tangent.set(0, 0, -1);
    f.tangent.normalize();

    // Pick a reference up that is not near-parallel to the tangent.
    _ref.copy(Math.abs(f.tangent.dot(WORLD_UP)) > 0.9 ? REF_UP2 : WORLD_UP);
    _r.crossVectors(f.tangent, _ref);
    if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0);
    _r.normalize();
    _u.crossVectors(_r, f.tangent).normalize();

    f.right.copy(_r);
    f.up.copy(_u);
    // Orientation matrix: forward = -tangent (three.js objects face -Z by default).
    f.matrix.makeBasis(f.right, f.up, _t.copy(f.tangent).negate());
    return f;
  }

  function getPoint(d, out) {
    const t = Math.min(1, Math.max(0, d / totalLength));
    return curve.getPointAt(t, out);
  }

  return {
    curve,
    totalLength,
    getFrame,
    getPoint,
    frame: new RailFrame(), // shared scratch frame
  };
}
