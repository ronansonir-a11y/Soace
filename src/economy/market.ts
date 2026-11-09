import { RNG } from '../core/rng';
export interface Commodity { id: string; name: string; base: number; stock: number; demand: number; }
export const COMMODITIES: Array<[string, string, number]> = [
  ['iron', 'Железная руда', 12], ['titanium', 'Титан', 38], ['opal', 'Войд-опал', 210],
  ['water', 'Вода', 4], ['food', 'Продовольствие', 18], ['meds', 'Медикаменты', 64], ['tech', 'Электроника', 120],
];
export class Market {
  items = new Map<string, Commodity>();
  private rng: RNG;
  constructor(seed: string) {
    this.rng = new RNG(seed + ':market');
    for (const [id, name, base] of COMMODITIES) this.items.set(id, { id, name, base, stock: this.rng.int(20, 400), demand: this.rng.int(20, 400) });
  }
  price(c: Commodity): number { return Math.max(1, Math.round(c.base * (1 + (c.demand - c.stock) / 220))); }
  buy(id: string, qty: number, credits: number): { ok: boolean; cost: number } {
    const c = this.items.get(id)!; const cost = this.price(c) * qty;
    if (c.stock < qty || credits < cost) return { ok: false, cost };
    c.stock -= qty; c.demand += Math.ceil(qty / 4); return { ok: true, cost };
  }
  sell(id: string, qty: number): number {
    const c = this.items.get(id)!; const gain = this.price(c) * qty;
    c.stock += qty; c.demand = Math.max(0, c.demand - Math.ceil(qty / 4)); return gain;
  }
  tick(): void { for (const c of this.items.values()) { c.demand += this.rng.int(-4, 5); c.stock += this.rng.int(-2, 4); c.demand = Math.max(0, c.demand); c.stock = Math.max(0, c.stock); } }
}
export interface Contract { id: number; kind: 'bounty' | 'delivery' | 'mining'; title: string; reward: number; target: string; qty: number; }
export function generateContracts(seed: string, systemName: string): Contract[] {
  const rng = new RNG(seed + ':' + systemName);
  const kinds: Contract['kind'][] = ['bounty', 'delivery', 'mining'];
  return kinds.map((kind, i) => ({
    id: i, kind,
    title: kind === 'bounty' ? `Уничтожить пирата в системе ${systemName}` : kind === 'delivery' ? `Доставить груз: ${systemName}` : `Добыть руду в поясе ${systemName}`,
    reward: rng.int(400, 2600), target: systemName, qty: rng.int(3, 12),
  }));
}
