import { extractGithubCommits, extractGoogleFallbackAgeDays, extractSpotifyHours, extractTwitterSignals } from './adapters.ts';
import type { AdapterBreakdown, RawAttestation } from './types.ts';

export const SCORING_MODEL_V0 =
  'github>50:+40|spotify(hours>10):+30|twitter(age>365&&activity>=50):+20|guest=25|bot=0|cap=100|v0';

export function computeDignityScore(attestations: RawAttestation[] = []): AdapterBreakdown {
  const githubCommits = extractGithubCommits(attestations);
  const spotifyHours = extractSpotifyHours(attestations);
  const twitter = extractTwitterSignals(attestations);
  const googleFallbackAgeDays = extractGoogleFallbackAgeDays(attestations);

  const githubPoints = githubCommits > 50 ? 40 : 0;
  const spotifyPoints = spotifyHours > 10 ? 30 : 0;
  const twitterPoints = twitter.accountAgeDays > 365 && twitter.activityScore >= 50 ? 20 : 0;
  const googleFallbackPoints = 0;

  const adapterMask =
    (githubPoints > 0 ? 0b001 : 0) |
    (spotifyPoints > 0 ? 0b010 : 0) |
    (twitterPoints > 0 ? 0b100 : 0);

  return {
    githubCommits,
    githubPoints,
    spotifyHours,
    spotifyPoints,
    twitterAccountAgeDays: twitter.accountAgeDays,
    twitterActivityScore: twitter.activityScore,
    twitterPoints,
    googleFallbackAgeDays,
    googleFallbackPoints,
    adapterMask,
    totalScore: Math.max(0, Math.min(100, githubPoints + spotifyPoints + twitterPoints)),
  };
}

export type { AdapterBreakdown, RawAttestation } from './types.ts';
