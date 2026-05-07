import { useEffect, useRef, useState } from 'react';

import { usePollingQuery } from '@/hooks/infra/usePollingQuery';

type FeedResponse = {
  providers: string[];
};

type UseCalendarFeedOpts<TResp extends FeedResponse, TItem> = {
  fetcher: () => Promise<TResp>;
  mapItems: (resp: TResp) => TItem[];
  refreshKey?: string;
};

export function useCalendarFeed<TResp extends FeedResponse, TItem>(
  opts: UseCalendarFeedOpts<TResp, TItem>,
): {
  items: TItem[];
  hasProviders: boolean;
  loading: boolean;
} {
  const [items, setItems] = useState<TItem[]>([]);
  const [hasProviders, setHasProviders] = useState(false);
  const { loading, refresh } = usePollingQuery({
    fetcher: opts.fetcher,
    pollMs: 15_000,
    refreshEventName: 'mirror:calendar_updated',
    onData: (resp) => {
      setItems(opts.mapItems(resp));
      setHasProviders(resp.providers.length > 0);
    },
    onError: () => {
      // keep stale data
    },
  });
  const previousRefreshKey = useRef(opts.refreshKey);
  useEffect(() => {
    if (previousRefreshKey.current === opts.refreshKey) return;
    previousRefreshKey.current = opts.refreshKey;
    refresh();
  }, [opts.refreshKey, refresh]);
  return { items, hasProviders, loading };
}
