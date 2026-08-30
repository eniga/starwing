// tests/three-mock.js
// Minimal Three.js mock for unit tests.

import { vi } from 'vitest';

const mockVector3 = {
  x: 0, y: 0, z: 0,
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
  clone() { return new Vector3(this.x, this.y, this.z); },
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; },
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); },
  normalize() { const len = this.length(); if (len > 0) { this.x /= len; this.y /= len; this.z /= len; } return this; },
};

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  normalize() { const len = this.length(); if (len > 0) { this.x /= len; this.y /= len; this.z /= len; } return this; }
  negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
}

export class Quaternion {
  constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
  setFromUnitVectors(vFrom, vTo) { /* simplified */ return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  setFromAxisAngle(axis, angle) { /* simplified */ return this; }
  multiply(q) { return this; }
}

export class Matrix4 {
  copy(m) { return this; }
}

export class Color {
  constructor(c) { this.r = 1; this.g = 1; this.b = 1; if (typeof c === 'number') { this.setHex(c); } }
  setHex(hex) { this.r = ((hex >> 16) & 255) / 255; this.g = ((hex >> 8) & 255) / 255; this.b = (hex & 255) / 255; return this; }
  multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
}

export class Mesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = new Vector3();
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);
    this.visible = true;
    this.parent = null;
    this.children = [];
  }
  add(child) {
    child.parent = this;
    this.children.push(child);
  }
  traverse() {}
}

export class Group {
  constructor() {
    this.children = [];
    this.position = new Vector3();
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);
  }
  add(child) { this.children.push(child); child.parent = this; }
  traverse() {}
}

export class MeshStandardMaterial {
  constructor(params = {}) { this.color = params.color || 0xffffff; this.metalness = params.metalness || 0; this.roughness = params.roughness || 0.5; }
}

export class MeshBasicMaterial {
  constructor(params = {}) { this.color = params.color || 0xffffff; this.toneMapped = params.toneMapped !== undefined ? params.toneMapped : true; }
}

export class ConeGeometry {
  constructor(radius, height, segments) { this.type = 'ConeGeometry'; this.radius = radius; this.height = height; }
}

export class BoxGeometry {
  constructor(w, h, d) { this.type = 'BoxGeometry'; this.parameters = { width: w, height: h, depth: d }; }
}

export class SphereGeometry {
  constructor(radius, widthSeg, heightSeg) { this.type = 'SphereGeometry'; this.parameters = { radius }; }
}

export class CylinderGeometry {
  constructor(rTop, rBottom, height, segments) { this.type = 'CylinderGeometry'; }
}

export class TorusGeometry {
  constructor(radius, tube, radialSeg, tubularSeg) { this.type = 'TorusGeometry'; this.parameters = { radius, tube }; }
}

export class OctahedronGeometry {
  constructor(radius, detail) { this.type = 'OctahedronGeometry'; }
}

export class CircleGeometry {
  constructor(radius, segments) { this.type = 'CircleGeometry'; }
}

export const MathUtils = {
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  damp: (current, target, lambda, dt) => {
    const factor = 1 - Math.exp(-lambda * dt);
    return current + (target - current) * factor;
  },
};

export class Object3D {
  constructor() {
    this.position = new Vector3();
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);
    this.visible = true;
    this.parent = null;
    this.children = [];
  }
  add(child) { child.parent = this; this.children.push(child); }
  traverse() {}
}

export class Camera extends Object3D {
  constructor() {
    super();
    this.fov = 60;
    this.aspect = 1;
    this.near = 0.1;
    this.far = 2000;
  }
  lookAt() {}
  updateProjectionMatrix() {}
}

export class PerspectiveCamera extends Camera {
  constructor(fov, aspect, near, far) {
    super();
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
  }
}

export class Scene extends Object3D {}

export class DirectionalLight extends Object3D {
  constructor(color, intensity) {
    super();
    this.color = color;
    this.intensity = intensity;
    this.castShadow = false;
    this.target = new Object3D();
  }
}

export class HemisphereLight extends Object3D {
  constructor(color, groundColor, intensity) {
    super();
    this.color = color;
    this.groundColor = groundColor;
    this.intensity = intensity;
  }
}

export class Raycaster {
  setFromCamera() {}
  intersectObject() { return []; }
}

// Mock renderer for tests that need it
export const mockRenderer = {
  setSize: vi.fn(),
  setPixelRatio: vi.fn(),
  setClearColor: vi.fn(),
  render: vi.fn(),
};

// Create a minimal three namespace
export const three = {
  Vector3,
  Quaternion,
  Matrix4,
  Color,
  Mesh,
  Group,
  MeshStandardMaterial,
  MeshBasicMaterial,
  ConeGeometry,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  TorusGeometry,
  OctahedronGeometry,
  CircleGeometry,
  MathUtils,
  Object3D,
  Camera,
  PerspectiveCamera,
  Scene,
  DirectionalLight,
  HemisphereLight,
  Raycaster,
  renderer: mockRenderer,
};

export default three;
