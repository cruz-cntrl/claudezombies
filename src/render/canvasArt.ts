import * as THREE from 'three';
import { bakedStandard } from './materials';

/** Canvas-painted art: Halcyon propaganda posters, warning signs, scrawled graffiti. */
const POSTERS: { title: string; sub: string; bg: string; fg: string; motif: 'tower' | 'eye' | 'head' | 'hand' }[] = [
  { title: 'HALCYON', sub: 'PEACE THROUGH SIGNAL', bg: '#2a3a3a', fg: '#e8d8a8', motif: 'tower' },
  { title: 'OBEY THE TONE', sub: 'A QUIET MIND IS A LOYAL MIND', bg: '#5a1a14', fg: '#ecdcb4', motif: 'head' },
  { title: 'THE SIGNAL', sub: 'WATCHES OVER YOU', bg: '#1e2a3a', fg: '#e0c890', motif: 'eye' },
  { title: 'VOLUNTEER', sub: 'PROJECT TETHER NEEDS YOU', bg: '#3a3420', fg: '#f0e0b0', motif: 'hand' },
];

function drawPoster(i: number): HTMLCanvasElement {
  const P = POSTERS[i % POSTERS.length];
  const c = document.createElement('canvas');
  c.width = 256; c.height = 360;
  const g = c.getContext('2d')!;
  g.fillStyle = P.bg; g.fillRect(0, 0, 256, 360);
  g.strokeStyle = P.fg; g.lineWidth = 6; g.strokeRect(12, 12, 232, 336);
  g.fillStyle = P.fg; g.strokeStyle = P.fg; g.lineWidth = 5;
  // motif
  g.save(); g.translate(128, 150);
  switch (P.motif) {
    case 'tower':
      g.beginPath(); g.moveTo(0, -80); g.lineTo(-40, 70); g.moveTo(0, -80); g.lineTo(40, 70); g.moveTo(-28, 20); g.lineTo(28, 20); g.moveTo(-18, -20); g.lineTo(18, -20); g.stroke();
      for (let r = 20; r < 90; r += 22) { g.beginPath(); g.arc(0, -80, r, -2.6, -0.5); g.stroke(); }
      break;
    case 'eye':
      g.beginPath(); g.ellipse(0, 0, 80, 40, 0, 0, 6.3); g.stroke();
      g.beginPath(); g.arc(0, 0, 22, 0, 6.3); g.fill();
      for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.28; g.beginPath(); g.moveTo(Math.cos(a) * 95, Math.sin(a) * 60); g.lineTo(Math.cos(a) * 115, Math.sin(a) * 75); g.stroke(); }
      break;
    case 'head':
      g.beginPath(); g.arc(0, 0, 55, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(30, 70); g.lineTo(-35, 70); g.closePath(); g.stroke();
      g.fillRect(-12, -70, 24, 18);
      for (let r = 14; r < 60; r += 14) { g.beginPath(); g.arc(0, -78, r, -2.4, -0.7); g.stroke(); }
      break;
    case 'hand':
      g.beginPath(); g.moveTo(-30, 80); g.lineTo(-30, -10); g.lineTo(-30, -60); g.moveTo(-10, -10); g.lineTo(-10, -75); g.moveTo(10, -10); g.lineTo(10, -70); g.moveTo(30, 0); g.lineTo(30, -55); g.moveTo(-30, 80); g.lineTo(35, 80); g.lineTo(35, 0); g.stroke();
      break;
  }
  g.restore();
  g.textAlign = 'center';
  g.font = '42px "Black Ops One", Impact';
  g.fillText(P.title, 128, 285);
  g.font = '15px "Special Elite", monospace';
  g.fillText(P.sub, 128, 318);
  // aging: stains, tears, fading
  for (let k = 0; k < 40; k++) {
    g.fillStyle = `rgba(${40 + Math.random() * 40},${30 + Math.random() * 20},10,${Math.random() * 0.25})`;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 360, 5 + Math.random() * 30, 0, 6.3); g.fill();
  }
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(256, 300); g.lineTo(200, 360); g.lineTo(256, 360); g.fill();
  if (i % 2) { g.beginPath(); g.moveTo(0, 0); g.lineTo(60, 0); g.lineTo(0, 50); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  // scrawled graffiti on one design
  if (i % 3 === 1) {
    g.strokeStyle = 'rgba(120,10,8,0.85)'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(30, 60); g.lineTo(226, 240); g.moveTo(226, 60); g.lineTo(30, 240); g.stroke();
    g.fillStyle = 'rgba(130,12,8,0.9)'; g.font = '26px "Special Elite"';
    g.fillText('SHOOT THE CHIP', 128, 345);
  }
  return c;
}

let posterMats: THREE.Material[] | null = null;
export function posterMaterials(): THREE.Material[] {
  if (posterMats) return posterMats;
  posterMats = POSTERS.map((_, i) => {
    const t = new THREE.CanvasTexture(drawPoster(i));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return bakedStandard({ map: t, normalMap: t, roughnessMap: t } as any, { normalMap: null, roughnessMap: null, roughness: 0.9, transparent: true, alphaTest: 0.3 });
  });
  return posterMats;
}

/** Scrawled wall text decal (blood/paint). */
export function graffitiTexture(text: string, color = 'rgba(110,10,8,0.85)'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.font = '64px "Special Elite", monospace';
  g.textAlign = 'center';
  g.fillText(text, 256, 86);
  for (let k = 0; k < 12; k++) { const x = 40 + Math.random() * 430; g.fillRect(x, 80, 4, 10 + Math.random() * 40); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
