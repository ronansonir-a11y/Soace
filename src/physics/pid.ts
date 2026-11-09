/** PID-регулятор Flight Assist: гасит угловой дрейф и боковой снос к вектору носа. */
export class PIDController {
  integral = 0; private prev = 0;
  constructor(public kp: number, public ki: number, public kd: number, private limit = 10) {}
  update(error: number, dt: number): number {
    if (dt <= 0) return 0;
    this.integral = THREE_clamp(this.integral + error * dt, -this.limit, this.limit);
    const deriv = (error - this.prev) / dt; this.prev = error;
    return this.kp * error + this.ki * this.integral + this.kd * deriv;
  }
  reset(): void { this.integral = 0; this.prev = 0; }
}
function THREE_clamp(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, v)); }
