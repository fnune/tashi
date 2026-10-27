import { useEffect, useState, useSyncExternalStore } from "react";
import {
  type FetchPage,
  PagedList,
  type PagedListState,
} from "./paged-list.js";

export type PagedListHandle<T> = PagedListState<T> & { list: PagedList<T> };

// `fetchPage` and `keyOf` are read once, so pass functions that do not change.
export function usePagedList<T>(
  fetchPage: FetchPage<T>,
  keyOf: (item: T) => string,
): PagedListHandle<T> {
  const [list] = useState(() => new PagedList(fetchPage, keyOf));
  const state = useSyncExternalStore(list.subscribe, list.getSnapshot);
  useEffect(() => {
    void list.loadMore();
  }, [list]);
  return { ...state, list };
}
