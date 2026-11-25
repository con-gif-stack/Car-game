type Listener<Args extends unknown[]> = (...args: Args) => void;
type StoredListener = (...args: unknown[]) => void;

/** A small typed event emitter, so game logic doesn't depend on Phaser. */
export class Emitter<Events extends Record<string, unknown[]>> {
  private readonly listeners = new Map<keyof Events, Set<StoredListener>>();

  /** Subscribes to an event. Returns a function that unsubscribes. */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as unknown as StoredListener);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(listener as unknown as StoredListener);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      listener(...args);
    }
  }
}
