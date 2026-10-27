export interface Page<T> {
  items: T[];
  next: string | null;
}

export type FetchPage<T> = (cursor: string | null) => Promise<Page<T>>;

export interface PagedListState<T> {
  items: T[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
  error: Error | null;
}

type Listener = () => void;

// Keeps the pages of a cursor-paginated list. Nothing here knows about React or
// the DOM, so every rule below is covered by a plain unit test.
export class PagedList<T> {
  private state: PagedListState<T> = {
    items: [],
    hasMore: true,
    loading: false,
    loaded: false,
    error: null,
  };
  private cursor: string | null = null;
  private generation = 0;
  private running: Promise<void> | null = null;
  private listeners = new Set<Listener>();

  constructor(
    private fetchPage: FetchPage<T>,
    private keyOf: (item: T) => string,
  ) {}

  getSnapshot = (): PagedListState<T> => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // Overlapping calls share one request, so a scroll handler may call it freely.
  loadMore(): Promise<void> {
    if (this.running) return this.running;
    if (!this.state.hasMore) return Promise.resolve();
    const generation = this.generation;
    this.set({ loading: true, error: null });
    const run = this.fetchPage(this.cursor).then(
      (page) => {
        if (generation !== this.generation) return;
        const known = new Set(this.state.items.map(this.keyOf));
        this.cursor = page.next;
        this.set({
          items: [
            ...this.state.items,
            ...page.items.filter((item) => !known.has(this.keyOf(item))),
          ],
          hasMore: page.next !== null,
          loading: false,
          loaded: true,
        });
      },
      (error) => {
        if (generation !== this.generation) return;
        this.set({ loading: false, error: asError(error) });
      },
    );
    return this.track(run, generation);
  }

  // Fetches again from the start, as far as the list had got, and swaps the
  // result in at once: after an edit the list neither collapses to its first
  // page nor flickers. A reload in flight is abandoned.
  reload(): Promise<void> {
    const generation = ++this.generation;
    const wanted = this.state.items.length;
    this.set({ loading: true, error: null });
    const run = this.fetchUntil(wanted, generation).then(
      (result) => {
        if (!result) return;
        this.cursor = result.cursor;
        this.set({
          items: result.items,
          hasMore: result.cursor !== null,
          loading: false,
          loaded: true,
        });
      },
      (error) => {
        if (generation !== this.generation) return;
        this.set({ loading: false, error: asError(error) });
      },
    );
    return this.track(run, generation);
  }

  // Loads pages until the wanted item is there, for a link to something far
  // down the list. Stops at the end of the list or at the first failure.
  async loadUntil(found: (items: T[]) => boolean): Promise<void> {
    while (!found(this.state.items) && this.state.hasMore) {
      await this.loadMore();
      if (this.state.error) return;
    }
  }

  private async fetchUntil(wanted: number, generation: number) {
    const items: T[] = [];
    let cursor: string | null = null;
    do {
      const page = await this.fetchPage(cursor);
      if (generation !== this.generation) return null;
      const known = new Set(items.map(this.keyOf));
      items.push(...page.items.filter((item) => !known.has(this.keyOf(item))));
      cursor = page.next;
    } while (cursor !== null && items.length < wanted);
    return { items, cursor };
  }

  private track(run: Promise<void>, generation: number): Promise<void> {
    const tracked = run.finally(() => {
      if (this.running === tracked && generation === this.generation) {
        this.running = null;
      }
    });
    this.running = tracked;
    return tracked;
  }

  private set(change: Partial<PagedListState<T>>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
