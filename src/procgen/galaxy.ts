import { RNG } from '../core/rng';
export interface PlanetDef { name: string; orbitRadius: number; size: number; speed: number; phase: number; color: number; biome: string; }
export interface SystemDef { id: number; name: string; x: number; y: number; starColor: number; starSize: number; faction: string; station: string; beltRadius: number; beltCount: number; planets: PlanetDef[]; }
export interface Galaxy { seed: string; systems: SystemDef[]; jumps: Array<[number, number]>; }
export const FACTIONS = ['Торговая Федерация', 'Горнодобывающий Синдикат', 'Пиратские Кланы', 'Полиция Сектора'] as const;
/** Враждебность фракций: 1 = огонь без предупреждения. */
export const HOSTILITY: Record<string, Record<string, number>> = {
  'Торговая Федерация': { 'Пиратские Кланы': 1, 'Горнодобывающий Синдикат': 0 },
  'Горнодобывающий Синдикат': { 'Пиратские Кланы': 1, 'Торговая Федерация': 0 },
  'Пиратские Кланы': { 'Торговая Федерация': 1, 'Горнодобывающий Синдикат': 1, 'Полиция Сектора': 1 },
  'Полиция Сектора': { 'Пиратские Кланы': 1 },
};
const SYS_NAMES = ['Кеплер','Вега','Тау Кита','Процион','Альтаир','Сириус','Эридан','Лиры','Драко','Орион','Персей','Кассиопея','Лебедь','Телец','Скорпион','Центавр','Гидра','Пегас','Андромеда','Волопас','Геркулес','Змееносец','Ворон','Чаша','Рысь','Ящерица','Стрела','Орёл','Дельфин','Малый Конь','Треугольник','Овен','Близнецы','Лев','Дева','Весы','Водолей','Рыбы','Кит','Заяц','Голубь','Корма','Паруса','Киль','Компас','Насос','Секстант','Щит','Лисичка','Единорог'];
const BIOMES = ['лавовый', 'ледяной', 'океанический', 'пустынный', 'джунгли', 'тундра', 'газовый гигант'];
export function generateGalaxy(seed: string): Galaxy {
  const rng = new RNG(seed);
  const systems: SystemDef[] = [];
  for (let i = 0; i < 50; i++) {
    const planets: PlanetDef[] = [];
    const n = rng.int(3, 8);
    for (let p = 0; p < n; p++) planets.push({
      name: `${SYS_NAMES[i]}-${p + 1}`, orbitRadius: 500 + p * 320 + rng.range(-60, 60), size: rng.range(28, 70),
      speed: rng.range(0.004, 0.02) * (rng.next() < 0.5 ? 1 : 1), phase: rng.range(0, Math.PI * 2),
      color: [0x4da6ff, 0xff7a45, 0x9fe870, 0xe8e3d8, 0xc792ff, 0xffd166][rng.int(0, 5)], biome: rng.pick(BIOMES),
    });
    systems.push({
      id: i, name: SYS_NAMES[i], x: rng.range(-4000, 4000), y: rng.range(-4000, 4000),
      starColor: rng.pick([0xffe9b0, 0xffc46b, 0xbcd7ff, 0xff9a7a]), starSize: rng.range(45, 80),
      faction: FACTIONS[i % FACTIONS.length], station: `Станция «${SYS_NAMES[i]}-Прайм»`,
      beltRadius: rng.range(900, 1400), beltCount: rng.int(3000, 7000), planets,
    });
  }
  // Граф прыжков: остовное дерево (связность) + дополнительные рёбра к ближайшим соседям.
  const jumps = new Set<string>(); const add = (a: number, b: number) => { if (a !== b) jumps.add(a < b ? `${a}-${b}` : `${b}-${a}`); };
  const connected = [0];
  while (connected.length < 50) {
    let best: [number, number, number] = [-1, -1, Infinity];
    for (const a of connected) for (let b = 0; b < 50; b++) { if (connected.includes(b)) continue; const d = Math.hypot(systems[a].x - systems[b].x, systems[a].y - systems[b].y); if (d < best[2]) best = [a, b, d]; }
    add(best[0], best[1]); connected.push(best[1]);
  }
  for (let i = 0; i < 50; i++) { const near = systems.map((s, j) => [j, Math.hypot(s.x - systems[i].x, s.y - systems[i].y)] as const).sort((a, b) => a[1] - b[1]); add(i, near[1][0]); if (rng.next() < 0.5) add(i, near[2][0]); }
  return { seed, systems, jumps: [...jumps].map((s) => s.split('-').map(Number) as [number, number]) };
}
export function neighbours(g: Galaxy, id: number): number[] {
  const out: number[] = [];
  for (const [a, b] of g.jumps) { if (a === id) out.push(b); if (b === id) out.push(a); }
  return out;
}
