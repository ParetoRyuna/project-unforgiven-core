export type RawAttestation = Record<string, unknown>;

export type AdapterBreakdown = {
  githubCommits: number;
  githubPoints: number;
  spotifyHours: number;
  spotifyPoints: number;
  twitterAccountAgeDays: number;
  twitterActivityScore: number;
  twitterPoints: number;
  googleFallbackAgeDays: number;
  googleFallbackPoints: number;
  adapterMask: number;
  totalScore: number;
};
