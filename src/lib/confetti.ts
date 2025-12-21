/**
 * Confetti animation for celebration effects
 */
class Confetti {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: any[] = [];
  private animationId: number | null = null;

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private createParticle() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#800080'];
    return {
      x: Math.random() * this.canvas.width,
      y: -10,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      size: Math.random() * 6 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1
    };
  }

  start(duration: number = 3000) {
    // Clear existing animation
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    // Create particles
    for (let i = 0; i < 100; i++) {
      this.particles.push(this.createParticle());
    }

    const startTime = Date.now();

    const animate = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      this.particles = this.particles.filter(particle => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.1; // gravity
        particle.life -= 0.01;

        if (particle.life > 0) {
          this.ctx.globalAlpha = particle.life;
          this.ctx.fillStyle = particle.color;
          this.ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
          return true;
        }
        return false;
      });

      const elapsed = Date.now() - startTime;
      if (elapsed < duration && this.particles.length > 0) {
        this.animationId = requestAnimationFrame(animate);
      } else {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.particles = [];
      }
    };

    animate();
  }
}

// Export for global use
(window as any).Confetti = Confetti;