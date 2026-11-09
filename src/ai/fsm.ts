export type AIState = 'patrol' | 'scan' | 'intercept' | 'dogfight' | 'evade' | 'flee' | 'trade' | 'dock';
export interface AICtx { shield: number; hull: number; distToTarget: number; hasTarget: boolean; hostile: boolean; isTrader: boolean; arrived: boolean; }
/** Боевая стейт-машина NPC: Patrol → Scan → Intercept → Dogfight → Evade (<20% щита) → Flee. */
export function decideAI(state: AIState, c: AICtx): AIState {
  if (c.isTrader) return c.arrived ? 'dock' : 'trade';
  if (c.shield < 20 && (state === 'dogfight' || state === 'intercept')) return 'evade';
  if (state === 'evade' && c.shield > 45) return 'flee';
  switch (state) {
    case 'patrol': return c.hostile && c.hasTarget ? 'scan' : 'patrol';
    case 'scan': return c.distToTarget < 900 ? 'intercept' : 'patrol';
    case 'intercept': return c.distToTarget < 320 ? 'dogfight' : 'intercept';
    case 'dogfight': return c.distToTarget > 700 ? 'intercept' : 'dogfight';
    default: return state;
  }
}
