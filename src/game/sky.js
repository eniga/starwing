// game/sky.js
// Procedural gradient sky dome, a distant sun, and a cheap screen-space lens
// flare (a few additive sprites along the sun->center line). Fog is set here
// to match the horizon color.

import * as THREE from 'three';

function radialTex(inner, outer, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createSky(scene, level) {
  const skyCfg = level.sky || { top: 0x0a1a3a, bottom: 0xff8a4d, sun: new THREE.Vector3(0.3, 0.15, -1) };
  const fogCfg = level.fog || { color: 0xff8a4d, density: 0.0016 };

  // Gradient dome.
  const skyGeo = new THREE.SphereGeometry(1600, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(skyCfg.top) },
      bottomColor: { value: new THREE.Color(skyCfg.bottom) },
      exponent: { value: 0.7 },
    },
    vertexShader: `varying vec3 vWorld; void main(){ vWorld = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 topColor; uniform vec3 bottomColor; uniform float exponent; varying vec3 vWorld;
      void main(){
        float h = normalize(vWorld - cameraPosition).y;
        float t = pow(max(h, 0.0), exponent);
        vec3 col = mix(bottomColor, topColor, t);
        // Slight warm band at the horizon.
        col += bottomColor * (1.0 - smoothstep(0.0, 0.25, abs(h))) * 0.25;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  // Fog matched to the horizon.
  scene.fog = new THREE.FogExp2(fogCfg.color, fogCfg.density);
  scene.background = new THREE.Color(fogCfg.color);

  // Sun sprite (distant, inside the dome so terrain can occlude it).
  const sunDir = new THREE.Vector3(skyCfg.sun[0], skyCfg.sun[1], skyCfg.sun[2]).normalize();
  const sunTex = radialTex('rgba(255,244,214,1)', 'rgba(255,180,90,0)');
  const sunMat = new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false, toneMapped: false });
  const sun = new THREE.Sprite(sunMat);
  sun.scale.setScalar(260);
  scene.add(sun);

  // Lens flare sprites (children of the camera, positioned in camera space).
  const flareTex = radialTex('rgba(255,220,180,0.9)', 'rgba(255,160,80,0)');
  const flares = [];
  const flareFracs = [-0.35, -0.7, -1.1, -1.5];
  const flareSizes = [2.2, 1.2, 3.0, 1.6];
  for (let i = 0; i < flareFracs.length; i++) {
    const m = new THREE.SpriteMaterial({ map: flareTex, color: 0xffcf9e, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, transparent: true, opacity: 0.5, toneMapped: false });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(flareSizes[i]);
    s.position.z = -5;
    s.renderOrder = 10;
    flares.push(s);
  }

  const _v = new THREE.Vector3();
  const _sunWorld = new THREE.Vector3();

  function update(camera) {
    sky.position.copy(camera.position);
    _sunWorld.copy(camera.position).addScaledVector(sunDir, 1500);
    sun.position.copy(_sunWorld);
    // Project the sun to NDC to place the flare elements.
    _v.copy(_sunWorld).project(camera);
    const halfH = 5 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfW = halfH * camera.aspect;
    for (let i = 0; i < flares.length; i++) {
      const f = flareFracs[i];
      flares[i].position.x = _v.x * halfW * f;
      flares[i].position.y = _v.y * halfH * f;
      flares[i].material.opacity = 0.5 * (1 - Math.abs(f) * 0.3);
    }
  }
  // Attach flares to the camera so they live in camera space.
  function attach(camera) { for (const s of flares) camera.add(s); }

  return {
    update,
    attach,
    dispose() {
      scene.remove(sky); skyGeo.dispose(); skyMat.dispose();
      scene.remove(sun); sunTex.dispose(); sunMat.dispose();
      flareTex.dispose();
      for (const s of flares) s.material.dispose();
    },
  };
}
