import { describe, expect, it, vi } from "vitest";
import { type FetchPage, type Page, PagedList } from "./paged-list.js";

interface Row {
  id: string;
}

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `row-${i}` }));

function paged(source: () => Row[], pageSize: number) {
  const fetchPage = vi.fn<FetchPage<Row>>(async (cursor) => {
    const all = source();
    const start = cursor === null ? 0 : Number(cursor);
    const end = start + pageSize;
    return {
      items: all.slice(start, end),
      next: end < all.length ? String(end) : null,
    };
  });
  return { fetchPage, list: new PagedList(fetchPage, (row) => row.id) };
}

function deferred() {
  let resolve!: (page: Page<Row>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Page<Row>>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ids = (list: PagedList<Row>) =>
  list.getSnapshot().items.map((row) => row.id);

describe("PagedList", () => {
  it("starts empty with more to load", () => {
    const { list } = paged(() => rows(5), 2);
    expect(list.getSnapshot()).toEqual({
      items: [],
      hasMore: true,
      loading: false,
      loaded: false,
      error: null,
    });
  });

  it("loads one page at a time until the end", async () => {
    const { list, fetchPage } = paged(() => rows(5), 2);
    await list.loadMore();
    expect(ids(list)).toEqual(["row-0", "row-1"]);
    expect(list.getSnapshot()).toMatchObject({ hasMore: true, loaded: true });
    await list.loadMore();
    await list.loadMore();
    expect(ids(list)).toEqual(rows(5).map((r) => r.id));
    expect(list.getSnapshot().hasMore).toBe(false);
    await list.loadMore();
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([
      null,
      "2",
      "4",
    ]);
  });

  it("knows an empty list is the whole list", async () => {
    const { list } = paged(() => [], 2);
    await list.loadMore();
    expect(list.getSnapshot()).toMatchObject({
      items: [],
      hasMore: false,
      loaded: true,
    });
  });

  it("lets overlapping calls share one request", async () => {
    const { list, fetchPage } = paged(() => rows(5), 2);
    await Promise.all([list.loadMore(), list.loadMore(), list.loadMore()]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(ids(list)).toHaveLength(2);
  });

  it("says it is loading while a request is out", async () => {
    const first = deferred();
    const list = new PagedList<Row>(
      () => first.promise,
      (row) => row.id,
    );
    const loading = list.loadMore();
    expect(list.getSnapshot().loading).toBe(true);
    first.resolve({ items: rows(1), next: null });
    await loading;
    expect(list.getSnapshot().loading).toBe(false);
  });

  it("keeps what it has when a page fails and loads it on retry", async () => {
    let failing = false;
    const { list } = paged(() => rows(4), 2);
    const inner = list as unknown as { fetchPage: FetchPage<Row> };
    const working = inner.fetchPage;
    inner.fetchPage = async (cursor) => {
      if (failing) throw new Error("offline");
      return working(cursor);
    };
    await list.loadMore();
    failing = true;
    await list.loadMore();
    expect(ids(list)).toEqual(["row-0", "row-1"]);
    expect(list.getSnapshot()).toMatchObject({
      loading: false,
      hasMore: true,
      error: new Error("offline"),
    });
    failing = false;
    await list.loadMore();
    expect(ids(list)).toHaveLength(4);
    expect(list.getSnapshot().error).toBeNull();
  });

  it("drops an item that shows up on two pages", async () => {
    const pages: Page<Row>[] = [
      { items: [{ id: "a" }, { id: "b" }], next: "1" },
      { items: [{ id: "b" }, { id: "c" }], next: null },
    ];
    const list = new PagedList<Row>(
      async (cursor) => pages[cursor === null ? 0 : 1] as Page<Row>,
      (row) => row.id,
    );
    await list.loadMore();
    await list.loadMore();
    expect(ids(list)).toEqual(["a", "b", "c"]);
  });

  describe("reload", () => {
    it("fetches as many pages as were loaded and no more", async () => {
      const { list, fetchPage } = paged(() => rows(10), 2);
      await list.loadMore();
      await list.loadMore();
      await list.loadMore();
      fetchPage.mockClear();
      await list.reload();
      expect(fetchPage).toHaveBeenCalledTimes(3);
      expect(ids(list)).toHaveLength(6);
      expect(list.getSnapshot().hasMore).toBe(true);
    });

    it("picks up an entry added at the top and one removed", async () => {
      let data = rows(6);
      const { list } = paged(() => data, 2);
      await list.loadMore();
      await list.loadMore();
      data = [{ id: "new" }, ...data.filter((r) => r.id !== "row-1")];
      await list.reload();
      expect(ids(list)).toEqual(["new", "row-0", "row-2", "row-3"]);
    });

    it("loads a first page when nothing was loaded yet", async () => {
      const { list } = paged(() => rows(5), 2);
      await list.reload();
      expect(ids(list)).toHaveLength(2);
    });

    it("keeps showing the old items until the new ones are all there", async () => {
      const { list } = paged(() => rows(6), 2);
      await list.loadMore();
      await list.loadMore();
      const before = ids(list);
      const inner = list as unknown as { fetchPage: FetchPage<Row> };
      const gates = [deferred(), deferred()];
      inner.fetchPage = vi
        .fn<FetchPage<Row>>()
        .mockReturnValueOnce(gates[0]?.promise as Promise<Page<Row>>)
        .mockReturnValueOnce(gates[1]?.promise as Promise<Page<Row>>);
      const reloading = list.reload();
      expect(list.getSnapshot()).toMatchObject({ loading: true });
      expect(ids(list)).toEqual(before);
      gates[0]?.resolve({ items: [{ id: "x0" }, { id: "x1" }], next: "2" });
      await Promise.resolve();
      expect(ids(list)).toEqual(before);
      gates[1]?.resolve({ items: [{ id: "x2" }, { id: "x3" }], next: "4" });
      await reloading;
      expect(ids(list)).toEqual(["x0", "x1", "x2", "x3"]);
    });

    it("ignores a page that was still on its way when it started", async () => {
      const late = deferred();
      const calls: (string | null)[] = [];
      const list = new PagedList<Row>(
        (cursor) => {
          calls.push(cursor);
          if (calls.length === 1) return late.promise;
          return Promise.resolve({ items: [{ id: "fresh" }], next: null });
        },
        (row) => row.id,
      );
      const stale = list.loadMore();
      await list.reload();
      late.resolve({ items: [{ id: "stale" }], next: "9" });
      await stale;
      expect(ids(list)).toEqual(["fresh"]);
      expect(list.getSnapshot()).toMatchObject({
        hasMore: false,
        loading: false,
      });
    });

    it("lets the latest of two reloads win", async () => {
      const first = deferred();
      let calls = 0;
      const list = new PagedList<Row>(
        () => {
          calls++;
          return calls === 1
            ? first.promise
            : Promise.resolve({ items: [{ id: "second" }], next: null });
        },
        (row) => row.id,
      );
      const one = list.reload();
      const two = list.reload();
      await two;
      first.resolve({ items: [{ id: "first" }], next: null });
      await one;
      expect(ids(list)).toEqual(["second"]);
    });

    it("keeps the old items and reports a failure", async () => {
      const { list } = paged(() => rows(4), 2);
      await list.loadMore();
      const inner = list as unknown as { fetchPage: FetchPage<Row> };
      inner.fetchPage = async () => {
        throw new Error("offline");
      };
      await list.reload();
      expect(ids(list)).toEqual(["row-0", "row-1"]);
      expect(list.getSnapshot()).toMatchObject({
        loading: false,
        error: new Error("offline"),
      });
    });
  });

  describe("loadUntil", () => {
    it("stops as soon as the wanted item is there", async () => {
      const { list, fetchPage } = paged(() => rows(20), 5);
      await list.loadUntil((items) => items.some((r) => r.id === "row-7"));
      expect(fetchPage).toHaveBeenCalledTimes(2);
      expect(ids(list)).toContain("row-7");
    });

    it("does not fetch when it is already there", async () => {
      const { list, fetchPage } = paged(() => rows(20), 5);
      await list.loadMore();
      fetchPage.mockClear();
      await list.loadUntil((items) => items.some((r) => r.id === "row-1"));
      expect(fetchPage).not.toHaveBeenCalled();
    });

    it("stops at the end of the list when the item does not exist", async () => {
      const { list } = paged(() => rows(7), 3);
      await list.loadUntil((items) => items.some((r) => r.id === "missing"));
      expect(ids(list)).toHaveLength(7);
      expect(list.getSnapshot().hasMore).toBe(false);
    });

    it("stops at a failure instead of retrying forever", async () => {
      const fetchPage = vi.fn<FetchPage<Row>>(async () => {
        throw new Error("offline");
      });
      const list = new PagedList<Row>(fetchPage, (row) => row.id);
      await list.loadUntil(() => false);
      expect(fetchPage).toHaveBeenCalledTimes(1);
      expect(list.getSnapshot().error).toEqual(new Error("offline"));
    });
  });

  describe("subscriptions", () => {
    it("tells listeners about each change until they leave", async () => {
      const { list } = paged(() => rows(4), 2);
      const listener = vi.fn();
      const unsubscribe = list.subscribe(listener);
      await list.loadMore();
      expect(listener).toHaveBeenCalledTimes(2);
      unsubscribe();
      await list.loadMore();
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("hands out the same snapshot until something changes", async () => {
      const { list } = paged(() => rows(4), 2);
      await list.loadMore();
      expect(list.getSnapshot()).toBe(list.getSnapshot());
    });
  });
});
