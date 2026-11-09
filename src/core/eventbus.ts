type Handler = (payload: any) => void;
export class EventBus {
  private map = new Map<string, Set<Handler>>();
  on(ev: string, fn: Handler): void { (this.map.get(ev) ?? this.map.set(ev, new Set()).get(ev)!).add(fn); }
  emit(ev: string, payload?: any): void { this.map.get(ev)?.forEach((f) => f(payload)); }
}
export const bus = new EventBus();
