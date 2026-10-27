import { useEffect, useRef } from "react";
import { type Language, t } from "../../i18n.js";
import { Button } from "./Button.js";
import { Notice } from "./Notice.js";
import "./LoadMore.css";

const LOOK_AHEAD = "0px 0px 600px 0px";

// Goes under a list that loads in pages. It asks for the next page when it
// comes within a screen of the viewport, shows a failure with a way to retry,
// and leaves nothing behind once the list is complete.
export function LoadMore({
  hasMore,
  loading,
  error,
  onLoadMore,
  lang,
}: {
  hasMore: boolean;
  loading: boolean;
  error: Error | null;
  onLoadMore: () => void;
  lang: Language;
}) {
  const marker = useRef<HTMLDivElement>(null);
  const waiting = hasMore && !loading && !error;
  const canObserve = typeof IntersectionObserver !== "undefined";

  // Watching starts over after every page: a marker that stays on screen
  // reports once, so it needs a fresh observer to ask for the page after.
  useEffect(() => {
    const element = marker.current;
    if (!element || !waiting || !canObserve) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: LOOK_AHEAD },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [waiting, canObserve, onLoadMore]);

  if (error) {
    return (
      <div className="load-more">
        <Notice tone="danger">{t(lang, "loadMoreFailed")}</Notice>
        <Button variant="secondary" onClick={onLoadMore}>
          {t(lang, "tryAgain")}
        </Button>
      </div>
    );
  }
  if (!hasMore) return null;
  return (
    <div className="load-more">
      {loading && (
        <p className="load-more-status" role="status">
          {t(lang, "loadingMore")}
        </p>
      )}
      {waiting &&
        (canObserve ? (
          <div ref={marker} className="load-more-marker" aria-hidden="true" />
        ) : (
          <Button variant="secondary" onClick={onLoadMore}>
            {t(lang, "loadMore")}
          </Button>
        ))}
    </div>
  );
}
