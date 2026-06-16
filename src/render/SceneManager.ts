import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Owns renderer, scene, camera, lighting, environment and the post pipeline. */
export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private keyLight!: THREE.DirectionalLight;
  private readonly maxDpr: number;
  isMobile: boolean;

  // Orbit camera parameters (radians / world units). azimuth 0 => white side near.
  azimuth = 0;
  polar = 1.0;
  distance = 12.6;
  target = new THREE.Vector3(0, 0.25, 0);

  constructor(canvas: HTMLCanvasElement) {
    this.isMobile = matchMedia('(max-width: 820px), (pointer: coarse)').matches;
    this.maxDpr = this.isMobile ? 2 : 2.5;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxDpr));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = this.makeBackdrop();

    // Image-based lighting from a procedurally generated studio room (no external HDR).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.5;

    this.camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );

    this.addLights();
    this.addBackdropStage();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.32, // strength
      0.6, // radius
      0.92, // threshold — only true highlights / emissive / VFX bloom
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    this.updateCamera();
  }

  /** Vertical gradient backdrop texture (deep teal-charcoal to near-black). */
  private makeBackdrop(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#1a2430');
    g.addColorStop(0.45, '#10161d');
    g.addColorStop(1, '#05070a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  private addLights(): void {
    const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x20160f, 0.46);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff2e0, 1.55);
    key.position.set(6, 12, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(this.isMobile ? 1024 : 2048, this.isMobile ? 1024 : 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    const s = 9;
    key.shadow.camera.left = -s;
    key.shadow.camera.right = s;
    key.shadow.camera.top = s;
    key.shadow.camera.bottom = -s;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    this.keyLight = key;
    this.scene.add(key);
    this.scene.add(key.target);

    const rim = new THREE.DirectionalLight(0x6ea8ff, 0.8);
    rim.position.set(-7, 5, -6);
    this.scene.add(rim);

    const fill = new THREE.DirectionalLight(0xffd9a8, 0.5);
    fill.position.set(-3, 4, 8);
    this.scene.add(fill);
  }

  /** Soft glowing stage disc beneath the board for grounding + reflections. */
  private addBackdropStage(): void {
    const stageGeo = new THREE.CircleGeometry(26, 64);
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0x0b0f14,
      roughness: 0.42,
      metalness: 0.2,
    });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.rotation.x = -Math.PI / 2;
    stage.position.y = -0.46;
    stage.receiveShadow = true;
    this.scene.add(stage);

    // Faint radial glow ring under the board.
    const glowTex = this.radialGlow('#2f6f8f');
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.28,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.44;
    this.scene.add(glow);
  }

  private radialGlow(color: string): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, color);
    g.addColorStop(0.4, 'rgba(47,111,143,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  updateCamera(): void {
    this.polar = THREE.MathUtils.clamp(this.polar, 0.22, 1.32);
    this.distance = THREE.MathUtils.clamp(this.distance, 9, 22);
    // Pull back on tall/narrow (portrait) viewports so the 8x8 board still fits.
    const aspect = this.camera.aspect || 1;
    const fit = aspect < 1 ? 1 + (1 / aspect - 1) * 0.85 : 1;
    const dist = this.distance * fit;
    const sinP = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + dist * sinP * Math.sin(this.azimuth),
      this.target.y + dist * Math.cos(this.polar),
      this.target.z + dist * sinP * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.target);
    // Keep the key light following the look direction softly for consistent shadows.
    this.keyLight.target.position.copy(this.target);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxDpr));
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxDpr));
    this.composer.setSize(w, h);
    this.updateCamera();
  }

  render(): void {
    // Accumulate draw stats across all composer passes for accurate diagnostics.
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.composer.render();
  }

  setBloom(strength: number): void {
    this.bloom.strength = strength;
  }
}
