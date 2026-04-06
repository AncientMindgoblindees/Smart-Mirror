export interface NewsHeadline {
  title: string;
  source: string;
}

/**
 * Scaffolding entry point for future grounded-news integration.
 * TODO: replace with Gemini 3 Flash + Google Search grounding backend route.
 */
export async function getNewsHeadlinesPreview(_limit = 5): Promise<NewsHeadline[]> {
  await new Promise((r) => setTimeout(r, 380));
  return [
    { title: 'Global markets open mixed amid AI investment surge', source: 'World Desk' },
    { title: 'Urban transport pilots expand autonomous shuttle lanes', source: 'Transit Wire' },
    { title: 'Climate summit sets new targets for grid modernization', source: 'Energy Brief' },
    { title: 'Healthcare systems adopt new patient-assistant copilots', source: 'HealthTech' },
    { title: 'Space agencies publish joint lunar habitat roadmap', source: 'Orbit News' },
  ];
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
