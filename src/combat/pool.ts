/** ObjectPool: ноль Instantiate/Destroy в бою — переиспользуем фиксированный набор. */
export class ObjectPool<T> {
  private freeList: T[] = []; active = 0;
  constructor(private factory: () => T, size: number) { for (let i = 0; i < size; i++) this.freeList.push(factory()); }
  obtain(): T | null { const o = this.freeList.pop() ?? null; if (o) this.active++; return o; }
  release(o: T): void { this.freeList.push(o); this.active--; }
  get capacity(): number { return this.freeList.length + this.active; }
}
