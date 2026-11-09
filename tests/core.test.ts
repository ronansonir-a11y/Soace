import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RNG } from '../src/core/rng';
import { generateGalaxy, neighbours } from '../src/procgen/galaxy';
import { PIDController } from '../src/physics/pid';
import { solveLead } from '../src/combat/lead';
import { ObjectPool } from '../src/combat/pool';
import { Market } from '../src/economy/market';
import { decideAI } from '../src/ai/fsm';
import { rebaseWorld, ORIGIN_THRESHOLD } from '../src/core/floatingOrigin';

describe('RNG / Galaxy (Модуль A)', () => {
  it('один сид = одна галактика из 50 систем', () => {
    const a = generateGalaxy('AETHER-6'), b = generateGalaxy('AETHER-6');
    expect(a.systems).toHaveLength(50);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(generateGalaxy('OTHER').systems[0].name).toBe(a.systems[0].name); // имена фиксированы, позиции — нет
  });
  it('граф прыжков связный (BFS из системы 0)', () => {
    const g = generateGalaxy('test-seed'); const seen = new Set([0]); const q = [0];
    while (q.length) { const cur = q.pop()!; for (const n of neighbours(g, cur)) if (!seen.has(n)) { seen.add(n); q.push(n); } }
    expect(seen.size).toBe(50);
  });
  it('у каждой системы 3–8 планет', () => {
    for (const s of generateGalaxy('x').systems) expect(s.planets.length).toBeGreaterThanOrEqual(3);
  });
});
describe('PID Flight Assist (Модуль Б, тест физики)', () => {
  it('гасит ошибку к нулю', () => {
    const pid = new PIDController(2.0, 0.3, 0.08); let err = 10;
    for (let i = 0; i < 900; i++) { const u = pid.update(err, 1 / 60); err -= u * (1 / 60); }
    expect(Math.abs(err)).toBeLessThan(0.5);
  });
  it('корабль с тягой летит вперёд и останавливается с ассистом', () => {
    const pid = new PIDController(3.0, 0.1, 0.05); let pos = 0, vel = 0;
    for (let i = 0; i < 300; i++) { vel += 12 * (1 / 60); pos += vel * (1 / 60); } // 5 c тяги
    const afterThrust = pos; expect(afterThrust).toBeGreaterThan(0);
    for (let i = 0; i < 600; i++) { vel += pid.update(0 - vel, 1 / 60) * (1 / 60); pos += vel * (1 / 60); }
    expect(Math.abs(vel)).toBeLessThan(0.6);
  });
});
describe('Lead Target Indicator (Модуль В)', () => {
  it('упреждение попадает по движущейся цели', () => {
    const ps = new THREE.Vector3(0, 0, 0), pt = new THREE.Vector3(100, 0, -200);
    const vt = new THREE.Vector3(30, 5, 0), vs = new THREE.Vector3(0, 0, 0);
    const sol = solveLead(ps, vs, pt, vt, 400)!; expect(sol).not.toBeNull();
    const bulletAt = sol.aim.clone(); const targetAt = pt.clone().addScaledVector(vt, sol.time);
    expect(bulletAt.distanceTo(targetAt)).toBeLessThan(0.01);
    expect(sol.time).toBeGreaterThan(0);
  });
  it('снаряд медленнее уходящей цели → null', () => {
    const sol = solveLead(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(0, 0, -100), new THREE.Vector3(0, 0, -500), 100);
    expect(sol).toBeNull();
  });
});
describe('ObjectPool (Модуль В)', () => {
  it('переиспользует объекты, не создаёт новые сверх пула', () => {
    let created = 0; const pool = new ObjectPool(() => ({ id: created++ }), 5);
    const objs = Array.from({ length: 5 }, () => pool.obtain());
    expect(pool.obtain()).toBeNull();
    pool.release(objs[0]!); expect(pool.obtain()).toBe(objs[0]);
    expect(created).toBe(5);
  });
});
describe('Экономика (Модуль Г)', () => {
  it('покупка двигает цену вверх, продажа — вниз', () => {
    const m = new Market('seed'); const c = m.items.get('iron')!;
    const p0 = m.price(c); expect(m.buy('iron', 40, 100000).ok).toBe(true); const p1 = m.price(c);
    expect(p1).toBeGreaterThan(p0); m.sell('iron', 10); expect(m.price(c)).toBeLessThanOrEqual(p1);
  });
  it('нельзя купить без кредитов', () => { expect(new Market('s').buy('opal', 5, 1).ok).toBe(false); });
});
describe('AI FSM (Модуль Г)', () => {
  const base = { hull: 100, hasTarget: true, hostile: true, isTrader: false, arrived: false };
  it('щит < 20% → evade', () => { expect(decideAI('dogfight', { ...base, shield: 15, distToTarget: 100 })).toBe('evade'); });
  it('patrol → scan → intercept → dogfight по дистанции', () => {
    expect(decideAI('patrol', { ...base, shield: 100, distToTarget: 500 })).toBe('scan');
    expect(decideAI('scan', { ...base, shield: 100, distToTarget: 500 })).toBe('intercept');
    expect(decideAI('intercept', { ...base, shield: 100, distToTarget: 100 })).toBe('dogfight');
  });
  it('торговец идёт на стыковку', () => { expect(decideAI('trade', { ...base, isTrader: true, shield: 100, distToTarget: 0, arrived: true })).toBe('dock'); });
});
describe('Floating Origin (Модуль A)', () => {
  it('ребейз при > 5000 возвращает игрока в (0,0,0), мир смещается', () => {
    const player = new THREE.Vector3(ORIGIN_THRESHOLD + 100, 0, 0);
    const rock = new THREE.Object3D(); rock.position.set(ORIGIN_THRESHOLD + 300, 5, 0);
    expect(rebaseWorld(player, [rock])).toBe(true);
    expect(player.length()).toBe(0); expect(rock.position.x).toBeCloseTo(200);
    expect(rebaseWorld(new THREE.Vector3(10, 0, 0), [])).toBe(false);
  });
});
