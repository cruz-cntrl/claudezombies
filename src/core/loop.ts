/**
 * Fixed-timestep simulation (60 Hz) decoupled from rendering.
 * update(dt) runs 0..maxSteps times per animation frame; render(alpha, frameDt) once.
 */
export class Loop {
  readonly step = 1 / 60;
  private acc = 0;
  private last = 0;
  private raf = 0;
  running = false;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(
    private update: (dt: number) => void,
    private render: (alpha: number, frameDt: number) => void,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.25) dt = 0.25; // tab hitch guard
      this.fpsAcc += dt;
      this.fpsFrames++;
      if (this.fpsAcc >= 0.5) {
        this.fps = this.fpsFrames / this.fpsAcc;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }
      this.acc += dt;
      let steps = 0;
      while (this.acc >= this.step && steps < 4) {
        this.update(this.step);
        this.acc -= this.step;
        steps++;
      }
      if (steps === 4) this.acc = 0;
      this.render(this.acc / this.step, dt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
