import * as THREE from 'three';
/** Точное упреждение: решает |Pt + Vt·t − Ps| = Sp·t (квадратное уравнение). */
export function solveLead(ps: THREE.Vector3, vs: THREE.Vector3, pt: THREE.Vector3, vt: THREE.Vector3, projSpeed: number): { aim: THREE.Vector3; time: number } | null {
  const r = pt.clone().sub(ps);
  const v = vt.clone().sub(vs);
  const a = v.lengthSq() - projSpeed * projSpeed;
  const b = 2 * r.dot(v);
  const c = r.lengthSq();
  let t: number;
  if (Math.abs(a) < 1e-6) { if (Math.abs(b) < 1e-6) return null; t = -c / b; }
  else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
    t = t1 > 0 && t2 > 0 ? Math.min(t1, t2) : t1 > 0 ? t1 : t2;
  }
  if (t <= 0 || !isFinite(t)) return null;
  return { aim: pt.clone().addScaledVector(vt, t), time: t };
}
