import type { Quality } from '../core/save';

export interface QualityPreset {
  pixelRatio: number;
  composer: boolean;
  bloom: boolean;
  bloomRes: number;      // fraction of render size for bloom chain
  msaa: number;
  particles: number;     // particle budget multiplier
  drawDistance: number;  // camera far / fog distance helper
  practicalLights: number; // dynamic point lights reused across flickering practicals
  chipLights: number;    // point lights reserved for the nearest chips
  dust: number;
  decals: number;
  casings: number;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low:    { pixelRatio: 1,   composer: false, bloom: false, bloomRes: 0.5, msaa: 0, particles: 0.5, drawDistance: 34, practicalLights: 1, chipLights: 0, dust: 60,  decals: 24, casings: 8 },
  medium: { pixelRatio: 1.5, composer: true,  bloom: true,  bloomRes: 0.5, msaa: 0, particles: 0.8, drawDistance: 46, practicalLights: 2, chipLights: 2, dust: 140, decals: 48, casings: 16 },
  high:   { pixelRatio: 2,   composer: true,  bloom: true,  bloomRes: 0.6, msaa: 4, particles: 1,   drawDistance: 60, practicalLights: 4, chipLights: 3, dust: 240, decals: 80, casings: 24 },
};

export const QUALITY_ORDER: Quality[] = ['low', 'medium', 'high'];

/** Watches frame rate; requests one quality drop if the average stays under 45 fps for 5 s. */
export class AutoQuality {
  private lowTime = 0;
  private cooldown = 8;
  constructor(private onDrop: () => void) {}
  update(fps: number, dt: number, active: boolean) {
    if (!active) { this.lowTime = 0; return; }
    if (this.cooldown > 0) { this.cooldown -= dt; return; }
    if (fps < 45) this.lowTime += dt; else this.lowTime = Math.max(0, this.lowTime - dt * 2);
    if (this.lowTime > 5) {
      this.lowTime = 0;
      this.cooldown = 10;
      this.onDrop();
    }
  }
}
