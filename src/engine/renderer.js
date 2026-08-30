// engine/renderer.js
// WebGLRenderer + EffectComposer chain + lighting + adaptive quality.
// Chain: Render -> UnrealBloom -> ChromaticAberration -> Film -> FXAA -> Output.
// OutputPass applies ACES tone mapping + sRGB. Chromatic aberration scales
// with boost. Adaptive quality steps down bloom -> shadows -> pixel ratio ->
// particles when a rolling frame-time average exceeds budget.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const ChromaticShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
    void main(){
      vec2 dir = vUv - 0.5;
      float d = length(dir);
      float amt = uAmount * d;
      float r = texture2D(tDiffuse, vUv - dir * amt).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + dir * amt).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }`,
};

const PRESETS = {
  high:   { dpr: 2.0, bloom: 0.85, shadow: 2048, particles: 3000, film: true },
  medium: { dpr: 1.5, bloom: 0.65, shadow: 1024, particles: 2000, film: true },
  low:    { dpr: 1.0, bloom: 0.35, shadow: 512,  particles: 1000, film: false },
};

export function createRenderer(canvas, scene, camera) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance',
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lighting: one shadow-casting key light + hemisphere fill.
  const keyLight = new THREE.DirectionalLight(0xfff2e0, 2.4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  const sc = keyLight.shadow.camera;
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight); scene.add(keyLight.target);
  const hemiLight = new THREE.HemisphereLight(0xbfe8ff, 0x2a1e14, 0.7);
  scene.add(hemiLight);

  // Post chain.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.7, 0.6, 0.82);
  composer.addPass(bloom);
  const chroma = new ShaderPass(ChromaticShader);
  composer.addPass(chroma);
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);
  composer.addPass(new OutputPass());

  let quality = 'medium';
  let degrade = 0;
  let particleBudget = PRESETS.medium.particles;

  function applyQuality() {
    const p = Object.assign({}, PRESETS[quality]);
    // Apply degradation notches on top of the base preset.
    if (degrade >= 1) p.bloom = Math.max(0.2, p.bloom * 0.6);
    if (degrade >= 2) p.shadow = Math.min(p.shadow, 1024);
    if (degrade >= 3) p.dpr = 1.0;
    if (degrade >= 4) p.particles = Math.min(p.particles, 800);
    if (degrade >= 5) { p.shadow = 0; p.bloom = 0; }

    const dpr = Math.min(window.devicePixelRatio || 1, p.dpr);
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = p.shadow > 0;
    keyLight.castShadow = p.shadow > 0;
    if (p.shadow > 0) keyLight.shadow.mapSize.set(p.shadow, p.shadow);
    if (keyLight.shadow.map) { keyLight.shadow.map.dispose(); keyLight.shadow.map = null; }
    bloom.strength = p.bloom;
    bloom.enabled = p.bloom > 0;
    particleBudget = p.particles;
    onResize();
  }

  function onResize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }

  // Rolling frame-time EMA for adaptive quality.
  let ema = 16.6, cool = 0;
  function update(frameMs) {
    if (frameMs > 200) frameMs = 200; // ignore tab-switch spikes
    ema = ema * 0.94 + frameMs * 0.06;
    if (cool > 0) { cool--; return; }
    if (ema > 17.5 && degrade < 5) { degrade++; applyQuality(); cool = 90; }
    else if (ema < 14.5 && degrade > 0) { degrade--; applyQuality(); cool = 240; }
  }

  return {
    renderer, composer, keyLight, hemiLight,
    setQuality(q) { quality = q; degrade = 0; applyQuality(); },
    getQuality() { return quality; },
    setChromatic(a) { chroma.uniforms.uAmount.value = a; },
    setParticleBudget(n) { particleBudget = n; },
    getParticleBudget() { return particleBudget; },
    setFogColor(c) { /* handled by level */ },
    setSize: onResize,
    update,
    render() { composer.render(); },
  };
}
