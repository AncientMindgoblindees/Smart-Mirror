import { useState } from 'react';

import { usePollingQuery } from '@/hooks/infra/usePollingQuery';

type FeedResponse = {
  providers: string[];
};

type UseCalendarFeedOpts<TResp extends FeedResponse, TItem> = {
  fetcher: () => Promise<TResp>;
  mapItems: (resp: TResp) => TItem[];
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
  const { loading } = usePollingQuery({
    fetcher: opts.fetcher,
    pollMs: 60_000,
    refreshEventName: 'mirror:calendar_updated',
    onData: (resp) => {
      setItems(opts.mapItems(resp));
      setHasProviders(resp.providers.length > 0);
    },
    onError: () => {
      // keep stale data
    },
  });
  return { items, hasProviders, loading };
}
