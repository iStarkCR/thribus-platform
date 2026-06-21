import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Esfera neural animada (portada do CORTEX). Pontos + linhas, auto-rotação,
// reage ao mouse, respiração orgânica. Lê o verde da marca (--brand-bright).

const OUTER_COUNT = 110;
const OUTER_RADIUS = 2.4;
const OUTER_RADIAL_VARIATION = 0; // raio externo fixo → silhueta sempre círculo perfeito
const OUTER_ANGULAR_JITTER = 0.018;
const OUTER_POINT_SIZE = 0.12;
const OUTER_POINT_OPACITY = 1.0;
const OUTER_LINE_OPACITY = 0.55;
const OUTER_CONNECT_DISTANCE = 1.55;

const INNER_COUNT = 40;
const INNER_RADIUS = 0.95;
const INNER_RADIAL_VARIATION = 0.035;
const INNER_POINT_SIZE = 0.08;
const INNER_POINT_OPACITY = 0.92;
const INNER_LINE_OPACITY = 0.36;
const INNER_CONNECT_DISTANCE = 0.95;

const AUTO_ROTATE_SPEED_OUTER = 0.00028; // mais lento, contemplativo
const AUTO_ROTATE_SPEED_INNER = -0.00052;
const MOUSE_INFLUENCE = 1.4;
const REPULSION_STRENGTH = 0.14;
const DAMPING = 0.86; // mais líquido — os pontos seguem com lag suave
const SPRING_FORCE = 0.06; // mola mais frouxa → movimento fluido tipo Siri
const PARALLAX_LERP = 0.045;
const MAX_LINE_PAIRS = 6000;

// Onda. Na casca externa é TANGENCIAL em CAMADAS (duas senoides em direções/velocidades
// diferentes → fluxo orgânico tipo Siri), com o raio travado → a borda nunca deforma.
// No miolo interno é radial (não afeta a silhueta).
const WAVE_AMP = 0.075; // radial — só miolo interno
const WAVE_AMP_TAN = 0.22; // tangencial — superfície externa flui, sem mexer na borda
const WAVE_FREQ = 1.05;
const WAVE_SPEED = 0.75; // bem mais lento
const HUE_DRIFT = 0.018; // desvio de matiz pequeno — não vira lime/amarelado

function readPrimaryColor(): THREE.Color {
  // Sage da marca (--brand) — verde mais suave/nosso, não o bright que puxava lime.
  const v = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
  const m = v.match(/(\d+)\s+(\d+)\s+(\d+)/);
  if (m) return new THREE.Color().setRGB(+m[1] / 255, +m[2] / 255, +m[3] / 255);
  return new THREE.Color('#6B8F5E');
}

interface Shell {
  positions: THREE.Vector3[];
  originals: THREE.Vector3[];
  velocities: THREE.Vector3[];
}

function buildShell({ count, radius, radialVar, angularJitter = 0 }: { count: number; radius: number; radialVar: number; angularJitter?: number }): Shell {
  const positions: THREE.Vector3[] = [];
  const originals: THREE.Vector3[] = [];
  const velocities: THREE.Vector3[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const yJitter = (Math.random() - 0.5) * angularJitter;
    const tJitter = (Math.random() - 0.5) * angularJitter;
    const y = 1 - (i / Math.max(1, count - 1)) * 2 + yJitter;
    const ringR = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i + tJitter;
    const r = radius + (Math.random() - 0.5) * 2 * radialVar;
    const px = Math.cos(theta) * ringR * r;
    const py = y * r;
    const pz = Math.sin(theta) * ringR * r;
    positions.push(new THREE.Vector3(px, py, pz));
    originals.push(new THREE.Vector3(px, py, pz));
    velocities.push(new THREE.Vector3());
  }
  return { positions, originals, velocities };
}

// Textura de "ponto redondo" (gradiente radial). Sem ela o PointsMaterial
// renderiza QUADRADOS — com ela os pontos e os pulsos ficam redondos/suaves.
function makeDotTexture(): THREE.Texture {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  // Núcleo SÓLIDO (pontos bem aparentes) + borda macia só na ponta.
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.62, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

function makePointsAndLines(shell: Shell, opts: { count: number; pointSize: number; pointOpacity: number; lineOpacity: number }, color: THREE.Color) {
  const { count, pointSize, pointOpacity, lineOpacity } = opts;

  const pointsGeometry = new THREE.BufferGeometry();
  const pointsArray = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pointsArray[i * 3] = shell.positions[i].x;
    pointsArray[i * 3 + 1] = shell.positions[i].y;
    pointsArray[i * 3 + 2] = shell.positions[i].z;
  }
  pointsGeometry.setAttribute('position', new THREE.BufferAttribute(pointsArray, 3));

  const pointsMaterial = new THREE.PointsMaterial({ color, size: pointSize, transparent: true, opacity: pointOpacity, sizeAttenuation: true, depthWrite: false });
  const points = new THREE.Points(pointsGeometry, pointsMaterial);

  const linesGeometry = new THREE.BufferGeometry();
  const linePosArray = new Float32Array(MAX_LINE_PAIRS * 6);
  linesGeometry.setAttribute('position', new THREE.BufferAttribute(linePosArray, 3));
  const lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: lineOpacity, depthWrite: false });
  const lines = new THREE.LineSegments(linesGeometry, lineMaterial);

  return { points, lines, pointsGeometry, pointsMaterial, linesGeometry, lineMaterial, linePosArray };
}

interface NeuralSphereProps {
  className?: string;
  speedMultiplier?: number;
  interactionMultiplier?: number;
  parallaxMultiplier?: number;
  ambient?: boolean;
  /** 0-1 — liga a esfera a um sinal (voz): gira/brilha/ondula mais. */
  intensity?: number;
  /** Escala a distância de conexão → <1 = menos linhas (esfera pequena). */
  connectScale?: number;
}

export function NeuralSphere({
  className = 'absolute inset-0',
  speedMultiplier = 1,
  interactionMultiplier = 1,
  parallaxMultiplier = 1,
  ambient = true,
  intensity = 0,
  connectScale = 1,
}: NeuralSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intensityRef = useRef(intensity);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 6;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const parallaxGroup = new THREE.Group();
    const outerGroup = new THREE.Group();
    const innerGroup = new THREE.Group();
    parallaxGroup.add(outerGroup, innerGroup);
    scene.add(parallaxGroup);

    const baseColor = readPrimaryColor();
    // Sage MAIS VIVO — sobe saturação (sem virar lime) e um tico de brilho.
    { const hsl = { h: 0, s: 0, l: 0 }; baseColor.getHSL(hsl); baseColor.setHSL(hsl.h, Math.min(1, hsl.s * 1.35), Math.min(0.68, hsl.l + 0.04)); }
    const dotTex = makeDotTexture(); // pontos/pulsos redondos (não quadrados)
    // White mode: blending aditivo SOME no branco (cor + branco = branco) → usa
    // blending normal e cores mais firmes; e reforça opacidade de linhas/pulsos.
    const isLight = document.documentElement.classList.contains('light');
    const opBoost = isLight ? 1.55 : 1;

    const outerShell = buildShell({ count: OUTER_COUNT, radius: OUTER_RADIUS, radialVar: OUTER_RADIAL_VARIATION, angularJitter: OUTER_ANGULAR_JITTER });
    const outer = makePointsAndLines(outerShell, { count: OUTER_COUNT, pointSize: OUTER_POINT_SIZE, pointOpacity: OUTER_POINT_OPACITY, lineOpacity: OUTER_LINE_OPACITY }, baseColor);
    outer.pointsMaterial.map = dotTex;
    outer.pointsMaterial.needsUpdate = true; // recompila com a textura (USE_MAP)
    outerGroup.add(outer.points, outer.lines);

    // ─── Pulsos sinápticos — "neurônios" viajando pelas linhas do córtex ──────
    const TRAV_COUNT = 32;
    const NEIGH_DIST = OUTER_CONNECT_DISTANCE * connectScale * 1.05;
    const neighbors: number[][] = [];
    for (let a = 0; a < OUTER_COUNT; a++) {
      const list: number[] = [];
      for (let b = 0; b < OUTER_COUNT; b++) {
        if (a !== b && outerShell.originals[a].distanceTo(outerShell.originals[b]) < NEIGH_DIST) list.push(b);
      }
      neighbors.push(list);
    }
    const travA = new Int32Array(TRAV_COUNT);
    const travB = new Int32Array(TRAV_COUNT);
    const travT = new Float32Array(TRAV_COUNT);
    const travSpeed = new Float32Array(TRAV_COUNT);
    const pickEdge = (k: number, from?: number) => {
      let a = from ?? Math.floor(Math.random() * OUTER_COUNT);
      let tries = 0;
      while (neighbors[a].length === 0 && tries++ < 8) a = Math.floor(Math.random() * OUTER_COUNT);
      const nb = neighbors[a];
      travA[k] = a;
      travB[k] = nb.length ? nb[Math.floor(Math.random() * nb.length)] : (a + 1) % OUTER_COUNT;
      travSpeed[k] = 0.5 + Math.random() * 0.9;
    };
    for (let k = 0; k < TRAV_COUNT; k++) { pickEdge(k); travT[k] = Math.random(); }
    // Cada pulso = cabeça + rastro de cometa (TAIL). ~40% são DOURADOS, resto Sage.
    const TAIL = 7;
    const SEGS = TAIL + 1;
    const TRAV_TOTAL = TRAV_COUNT * SEGS;
    const travArr = new Float32Array(TRAV_TOTAL * 3);
    const travCol = new Float32Array(TRAV_TOTAL * 3);
    const sagePulse = isLight ? baseColor.clone() : baseColor.clone().lerp(new THREE.Color(1, 1, 1), 0.5);
    const goldPulse = new THREE.Color('#e9c23c');
    const tmpC = new THREE.Color();
    for (let k = 0; k < TRAV_COUNT; k++) {
      const c = (k % 5) < 2 ? goldPulse : sagePulse; // ~40% dourados
      for (let s = 0; s < SEGS; s++) {
        const fade = 1 - s / SEGS; // cabeça brilha, rastro escurece
        tmpC.copy(c).multiplyScalar(fade * fade);
        const idx = (k * SEGS + s) * 3;
        travCol[idx] = tmpC.r; travCol[idx + 1] = tmpC.g; travCol[idx + 2] = tmpC.b;
      }
    }
    const travGeo = new THREE.BufferGeometry();
    travGeo.setAttribute('position', new THREE.BufferAttribute(travArr, 3));
    travGeo.setAttribute('color', new THREE.BufferAttribute(travCol, 3));
    const travMat = new THREE.PointsMaterial({ size: 0.13, map: dotTex, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true, depthWrite: false, blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending });
    const travPoints = new THREE.Points(travGeo, travMat);
    outerGroup.add(travPoints);
    const easeTrav = (x: number) => x * x * (3 - 2 * x);

    // Flash dos nós: quando um pulso chega num ponto, ele pisca (dourado se o
    // pulso é dourado, azul se é verde). Pontos passam a ter COR POR VÉRTICE.
    const FLASH_TIME = 0.42;
    const nodeFlash = new Float32Array(OUTER_COUNT);
    const nodeFlashGold = new Uint8Array(OUTER_COUNT);
    const flashGold = new THREE.Color('#e9c23c');
    const flashBlue = new THREE.Color('#5fa8ff');
    const outerPtCol = new Float32Array(OUTER_COUNT * 3);
    outer.pointsGeometry.setAttribute('color', new THREE.BufferAttribute(outerPtCol, 3));
    outer.pointsMaterial.vertexColors = true;
    outer.pointsMaterial.color.set(0xffffff);
    const baseNodeC = new THREE.Color();
    const flashTmp = new THREE.Color();

    const innerShell = buildShell({ count: INNER_COUNT, radius: INNER_RADIUS, radialVar: INNER_RADIAL_VARIATION, angularJitter: 0.05 });
    const innerColor = baseColor.clone().lerp(new THREE.Color(1, 1, 1), 0.18);
    const inner = makePointsAndLines(innerShell, { count: INNER_COUNT, pointSize: INNER_POINT_SIZE, pointOpacity: INNER_POINT_OPACITY, lineOpacity: INNER_LINE_OPACITY }, innerColor);
    inner.pointsMaterial.map = dotTex;
    inner.pointsMaterial.needsUpdate = true;
    innerGroup.add(inner.points, inner.lines);

    const mouse = { x: 0, y: 0, active: false };
    const targetRot = { x: 0, y: 0 };

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouse.x = nx * 4;
      mouse.y = ny * 2.5;
      mouse.active = true;
      targetRot.y = nx * 0.1 * parallaxMultiplier;
      targetRot.x = -ny * 0.07 * parallaxMultiplier;
    };
    const onMouseLeave = () => {
      mouse.active = false;
      targetRot.x = 0;
      targetRot.y = 0;
    };
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const tempVec = new THREE.Vector3();
    const mouseVec = new THREE.Vector3();
    const waveTarget = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const UP = new THREE.Vector3(0, 1, 0);
    // matiz base (pra fazer o drift de cor)
    const baseHSL = { h: 0, s: 0, l: 0 };
    baseColor.getHSL(baseHSL);
    let raf = 0;
    let smoothI = 0;
    const startTime = performance.now();

    const updateShell = (shell: Shell, geometry: THREE.BufferGeometry, count: number, connectDist: number, linePosArray: Float32Array, geomLines: THREE.BufferGeometry, now: number, waveBoost: number, lockRadius: number | null) => {
      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      mouseVec.set(mouse.x, mouse.y, 0);
      const arr = posAttr.array as Float32Array;

      for (let i = 0; i < count; i++) {
        const pos = shell.positions[i];
        const orig = shell.originals[i];
        const vel = shell.velocities[i];

        if (lockRadius != null) {
          // Onda TANGENCIAL em camadas: duas senoides em direções/velocidades distintas
          // → fluxo orgânico (tipo Siri). Combinada com a trava de raio abaixo, a borda
          // permanece um círculo perfeito.
          const phase = (orig.y * 1.4 + orig.x * 0.5) * WAVE_FREQ - now * WAVE_SPEED;
          const phase2 = (orig.z * 1.1 - orig.y * 0.6) * WAVE_FREQ * 0.6 - now * WAVE_SPEED * 0.45;
          const amt = (Math.sin(phase) * 0.7 + Math.sin(phase2) * 0.5) * WAVE_AMP_TAN * waveBoost;
          tangent.crossVectors(orig, UP);
          if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0);
          tangent.normalize();
          waveTarget.copy(orig).addScaledVector(tangent, amt);
        } else {
          // Onda radial — só no miolo interno (não afeta a silhueta).
          const phase = (orig.x + orig.y * 0.7 + orig.z) * WAVE_FREQ - now * WAVE_SPEED;
          const radial = 1 + (Math.sin(phase) * WAVE_AMP * waveBoost) / (orig.length() || 1);
          waveTarget.copy(orig).multiplyScalar(radial);
        }

        tempVec.subVectors(waveTarget, pos).multiplyScalar(SPRING_FORCE);
        vel.add(tempVec);

        if (mouse.active) {
          tempVec.subVectors(pos, mouseVec);
          const dist = tempVec.length();
          const effInfluence = MOUSE_INFLUENCE * interactionMultiplier;
          if (dist < effInfluence && dist > 0.001) {
            const force = (effInfluence - dist) / effInfluence;
            const power = force * force * REPULSION_STRENGTH * interactionMultiplier;
            tempVec.normalize().multiplyScalar(power);
            vel.add(tempVec);
          }
        }

        vel.multiplyScalar(DAMPING);
        pos.add(vel);

        // Trava o raio → casca externa fica sempre no círculo perfeito (onda e
        // mouse só deslizam os pontos pela superfície, nunca pra fora).
        if (lockRadius != null) pos.setLength(lockRadius);

        arr[i * 3] = pos.x;
        arr[i * 3 + 1] = pos.y;
        arr[i * 3 + 2] = pos.z;
      }
      posAttr.needsUpdate = true;

      let writeIdx = 0;
      const limit = MAX_LINE_PAIRS * 6;
      const distSq = connectDist * connectDist;
      for (let i = 0; i < count && writeIdx < limit; i++) {
        for (let j = i + 1; j < count && writeIdx < limit; j++) {
          const a = shell.positions[i];
          const b = shell.positions[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dz = a.z - b.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < distSq) {
            linePosArray[writeIdx++] = a.x;
            linePosArray[writeIdx++] = a.y;
            linePosArray[writeIdx++] = a.z;
            linePosArray[writeIdx++] = b.x;
            linePosArray[writeIdx++] = b.y;
            linePosArray[writeIdx++] = b.z;
          }
        }
      }
      (geomLines.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      geomLines.setDrawRange(0, writeIdx / 3);
    };

    const animate = () => {
      const now = performance.now() * 0.001;
      const ambientPulse = ambient ? 0.18 + Math.sin(now * 0.5) * 0.06 : 0;
      // attack rápido / decay lento — sensação de respiração natural
      const target = Math.max(ambientPulse, Math.min(1, intensityRef.current));
      smoothI += (target - smoothI) * (target > smoothI ? 0.3 : 0.08);
      const I = smoothI;
      const waveBoost = 1 + I * 1.6;

      const dynOuterConnect = OUTER_CONNECT_DISTANCE * connectScale * (1 + I * 0.2);
      const dynInnerConnect = INNER_CONNECT_DISTANCE * connectScale * (1 + I * 0.24);

      updateShell(outerShell, outer.pointsGeometry, OUTER_COUNT, dynOuterConnect, outer.linePosArray, outer.linesGeometry, now, waveBoost, OUTER_RADIUS);
      updateShell(innerShell, inner.pointsGeometry, INNER_COUNT, dynInnerConnect, inner.linePosArray, inner.linesGeometry, now, waveBoost, null);

      // Pulsos viajando pelas linhas (lerp nó A→B; ao chegar, parte do B). Cada um
      // arrasta um rastro de cometa (TAIL segmentos atrás da cabeça).
      const travDt = 0.016 * (1 + I * 0.8); // mais rápido quando ativo (voz)
      for (let k = 0; k < TRAV_COUNT; k++) {
        travT[k] += travSpeed[k] * travDt;
        if (travT[k] >= 1) {
          travT[k] -= 1;
          const arrived = travB[k]; // nó onde o pulso chegou → pisca
          nodeFlash[arrived] = FLASH_TIME;
          nodeFlashGold[arrived] = (k % 5) < 2 ? 1 : 0; // dourado ou azul
          pickEdge(k, travB[k]);
        }
        const a = outerShell.positions[travA[k]];
        const b = outerShell.positions[travB[k]];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        for (let s = 0; s < SEGS; s++) {
          const e = easeTrav(Math.max(0, travT[k] - s * 0.07));
          const idx = (k * SEGS + s) * 3;
          travArr[idx] = a.x + dx * e;
          travArr[idx + 1] = a.y + dy * e;
          travArr[idx + 2] = a.z + dz * e;
        }
      }
      travGeo.attributes.position.needsUpdate = true;
      travMat.opacity = (isLight ? 0.9 : 0.6) + I * 0.4; // normal blending no claro pede mais corpo

      // Drift de cor — matiz desliza suave (verde ↔ teal/azulado).
      const h = ((baseHSL.h + Math.sin(now * 0.22) * HUE_DRIFT) % 1 + 1) % 1;
      outer.lineMaterial.color.setHSL(h, baseHSL.s, baseHSL.l);
      // Pontos do outer: cor base (drift) + flash dourado/azul ao receber um pulso.
      baseNodeC.setHSL(h, baseHSL.s, baseHSL.l);
      for (let n = 0; n < OUTER_COUNT; n++) {
        let r = baseNodeC.r, g = baseNodeC.g, bl = baseNodeC.b;
        if (nodeFlash[n] > 0) {
          nodeFlash[n] = Math.max(0, nodeFlash[n] - travDt);
          const amt = nodeFlash[n] / FLASH_TIME;
          flashTmp.copy(nodeFlashGold[n] ? flashGold : flashBlue);
          r += (flashTmp.r - r) * amt;
          g += (flashTmp.g - g) * amt;
          bl += (flashTmp.b - bl) * amt;
        }
        const ci = n * 3;
        outerPtCol[ci] = r; outerPtCol[ci + 1] = g; outerPtCol[ci + 2] = bl;
      }
      outer.pointsGeometry.attributes.color.needsUpdate = true;
      inner.pointsMaterial.color.setHSL(h, Math.max(0, baseHSL.s - 0.06), Math.min(1, baseHSL.l + 0.06));
      inner.lineMaterial.color.setHSL(h, Math.max(0, baseHSL.s - 0.06), Math.min(1, baseHSL.l + 0.06));

      const t = (performance.now() - startTime) * 0.00085;
      const breath = 1 + Math.sin(t * 0.85) * 0.018;
      parallaxGroup.scale.setScalar(breath);

      const innerPulse = 0.86 + Math.sin(t * 1.3) * 0.08 + I * 0.22;
      inner.pointsMaterial.opacity = Math.min(1, INNER_POINT_OPACITY * innerPulse * opBoost);
      inner.lineMaterial.opacity = Math.min(1, INNER_LINE_OPACITY * (innerPulse + I * 0.5) * opBoost);
      outer.lineMaterial.opacity = Math.min(1, OUTER_LINE_OPACITY * (1 + I * 1.2) * opBoost);

      const speedBoost = 1 + I * 1.6;
      const wobbleAmp = I * 0.1;
      const swingAmp = 0.025;
      const wobbleX = Math.sin(t * 1.7) * wobbleAmp + Math.sin(t * 0.6) * swingAmp;
      const wobbleY = Math.sin(t * 1.1) * wobbleAmp * 0.6;
      const wobbleZ = Math.cos(t * 2.3) * wobbleAmp * 0.7 + Math.sin(t * 0.9) * swingAmp * 0.4;

      parallaxGroup.rotation.x += (targetRot.x + wobbleX - parallaxGroup.rotation.x) * PARALLAX_LERP;
      parallaxGroup.rotation.y += (targetRot.y + wobbleY - parallaxGroup.rotation.y) * PARALLAX_LERP;
      parallaxGroup.rotation.z += (wobbleZ - parallaxGroup.rotation.z) * 0.18;

      outerGroup.rotation.y += AUTO_ROTATE_SPEED_OUTER * speedMultiplier * speedBoost;
      innerGroup.rotation.y += AUTO_ROTATE_SPEED_INNER * speedMultiplier * speedBoost;
      innerGroup.rotation.x += AUTO_ROTATE_SPEED_INNER * 0.4 * speedMultiplier * speedBoost;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      ro.disconnect();
      outer.pointsGeometry.dispose();
      outer.pointsMaterial.dispose();
      outer.linesGeometry.dispose();
      outer.lineMaterial.dispose();
      travGeo.dispose();
      travMat.dispose();
      inner.pointsGeometry.dispose();
      inner.pointsMaterial.dispose();
      inner.linesGeometry.dispose();
      inner.lineMaterial.dispose();
      dotTex.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={className}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  );
}
