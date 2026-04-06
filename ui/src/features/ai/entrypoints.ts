export interface NewsHeadline {
  id: string;
  title: string;
  source: string;
  category: string;
  published_at: string;
  url: string;
  summary?: string;
}

export type NewsPreviewOptions = {
  provider?: 'mock';
  includeSummary?: boolean;
};

/**
 * Scaffolding entry point for future grounded-news integration.
 * TODO: replace with Gemini 3 Flash + Google Search grounding backend route.
 */
export async function getNewsHeadlinesPreview(
  limit = 5,
  options: NewsPreviewOptions = {}
): Promise<NewsHeadline[]> {
  const provider = options.provider ?? 'mock';
  await new Promise((r) => setTimeout(r, 380));
  if (provider !== 'mock') {
    throw new Error(`Unsupported provider in scaffold mode: ${provider}`);
  }
  const now = Date.now();
  const feed: NewsHeadline[] = [
    {
      id: 'mk-001',
      title: 'Global markets open mixed amid AI infrastructure expansion',
      source: 'World Desk',
      category: 'Business',
      published_at: new Date(now - 10 * 60 * 1000).toISOString(),
      url: 'https://example.com/news/mk-001',
      summary: 'Chip and cloud stocks led gains while energy and retail traded flat in early sessions.',
    },
    {
      id: 'mk-002',
      title: 'Autonomous transit pilots add new city-center corridors',
      source: 'Transit Wire',
      category: 'Technology',
      published_at: new Date(now - 26 * 60 * 1000).toISOString(),
      url: 'https://example.com/news/mk-002',
      summary: 'Operators reported lower wait times after expanding dedicated route lanes.',
    },
    {
      id: 'mk-003',
      title: 'Climate coalition agrees on rapid grid modernization milestones',
      source: 'Energy Brief',
      category: 'Science',
      published_at: new Date(now - 44 * 60 * 1000).toISOString(),
      url: 'https://example.com/news/mk-003',
      summary: 'A new plan accelerates storage deployment and long-distance transmission upgrades.',
    },
    {
      id: 'mk-004',
      title: 'Hospital networks deploy copilots for intake and triage workflows',
      source: 'HealthTech',
      category: 'Health',
      published_at: new Date(now - 63 * 60 * 1000).toISOString(),
      url: 'https://example.com/news/mk-004',
      summary: 'Initial rollouts focus on documentation and appointment routing efficiency.',
    },
    {
      id: 'mk-005',
      title: 'Lunar habitat roadmap updated after international design review',
      source: 'Orbit News',
      category: 'Space',
      published_at: new Date(now - 81 * 60 * 1000).toISOString(),
      url: 'https://example.com/news/mk-005',
      summary: 'Consortium teams aligned on safety constraints and shared power architecture.',
    },
    {
      id: 'mk-006',
      title: 'Local weather agencies integrate wildfire smoke nowcast model',
      source: 'Civic Watch',
      category: 'Local',
      published_at: new Date(now - 102 * 60 * 1000).toISOString(),
      url: 'https://example.com/news/mk-006',
      summary: 'The tool gives neighborhoods block-level air quality risk updates.',
    },
  ];
  return feed.slice(0, Math.max(1, limit)).map((item) => ({
    ...item,
    summary: options.includeSummary ? item.summary : undefined,
  }));
}

/**
 * Scaffolding entry point for future virtual try-on generation.
 * TODO: wire selected model/provider once decided.
 */
export async function requestVirtualTryOnPreview(): Promise<{ status: 'stub'; message: string }> {
  await new Promise((r) => setTimeout(r, 250));
  return {
    status: 'stub',
    message: 'Try-On backend is not connected yet. This is a UI scaffold entry point.',
  };
}
