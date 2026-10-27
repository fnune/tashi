# Paged lists

The history loads a page at a time as the end of the list comes into view. Any other list that can grow (foods, a future list of people) follows the same pattern.

## How it fits together

- The server answers `GET /api/<list>?limit=&cursor=` with the items and a `next_cursor`, which is `null` on the last page. The cursor is opaque and keyset-based (see `TimelinePageResponse`), so a page never repeats or skips an item when the list changes underneath.
- `paging/paged-list.ts` is the whole logic and knows nothing about React or the DOM. It holds the items loaded so far and offers `loadMore()`, `reload()` and `loadUntil(found)`.
- `paging/use-paged-list.ts` is the hook that connects it to React and loads the first page.
- `components/ui/LoadMore.tsx` goes under the list. It asks for the next page when it comes within a screen of the viewport, shows a failure with a retry button, and renders nothing once the list is complete.

## Rules the code keeps

- One request at a time: overlapping `loadMore()` calls share the request in flight.
- `reload()` after an edit or a delete fetches as many pages as were loaded and swaps them in at once, so the list neither collapses to its first page nor flickers. A newer reload abandons an older one, and a late page from before a reload is ignored.
- A failed page keeps what is shown, sets `error`, and the next `loadMore()` retries.
- A link to an item that is not loaded yet calls `loadUntil`, which loads pages until the item is there, the list ends, or a request fails.
- The marker is observed again after every page. A marker that stays on screen reports once, so without a new observer a short page would stall the list.
- Anything that needs the whole list (a delete-everything button) waits until `hasMore` is false.

## Adding a list

1. Return `{ items, next }` from a client function that takes a cursor, and keep that function stable (a module-level function, not one built in a component).
2. Call `usePagedList(fetchPage, (item) => item.id)` where the list's state lives.
3. Render the items, then `<LoadMore hasMore loading error onLoadMore lang />` with `onLoadMore` from `useCallback(() => void list.loadMore(), [list])`.
4. Call `list.reload()` where the data changes, and `list.loadUntil` for deep links.

## Tests

- `paged-list.test.ts` covers the rules above with a fake `fetchPage`: `pnpm --filter @tashi/frontend test`. A new list needs no new unit tests unless it adds a rule.
- `packages/e2e/tests/history.test.ts` is the end-to-end template: the first page only, scrolling to load the rest, no requests after the end, an edit that keeps the loaded pages, a link to a deep item, and a retry after a failed page. Make a page fail with `page.route(..., (route) => route.abort())`.
