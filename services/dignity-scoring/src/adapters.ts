import type { RawAttestation } from './types.ts';
import { providerName, readPathNumber } from './utils.ts';

export function extractGithubCommits(attestations: RawAttestation[]): number {
  let githubCommits = 0;
  for (const raw of attestations) {
    const provider = providerName(raw);
    if (!provider.includes('github')) continue;
    githubCommits = Math.max(
      githubCommits,
      readPathNumber(raw, ['commit_count', 'commits', 'data.commit_count', 'data.commits']) ?? 0,
    );
  }
  return githubCommits;
}

export function extractSpotifyHours(attestations: RawAttestation[]): number {
  let spotifyHours = 0;
  for (const raw of attestations) {
    const provider = providerName(raw);
    if (!provider.includes('spotify')) continue;
    spotifyHours = Math.max(
      spotifyHours,
      readPathNumber(raw, ['playtime_hours', 'hours', 'data.playtime_hours', 'data.hours']) ?? 0,
    );
  }
  return spotifyHours;
}

export function extractTwitterSignals(attestations: RawAttestation[]): {
  accountAgeDays: number;
  activityScore: number;
} {
  let accountAgeDays = 0;
  let activityScore = 0;
  for (const raw of attestations) {
    const provider = providerName(raw);
    if (!provider.includes('twitter') && !provider.includes('x.com')) continue;
    accountAgeDays = Math.max(
      accountAgeDays,
      readPathNumber(raw, ['account_age_days', 'age_days', 'data.account_age_days']) ?? 0,
    );
    activityScore = Math.max(
      activityScore,
      readPathNumber(raw, ['activity_score', 'engagement_score', 'data.activity_score']) ?? 0,
    );
  }
  return { accountAgeDays, activityScore };
}

export function extractGoogleFallbackAgeDays(attestations: RawAttestation[]): number {
  let ageDays = 0;
  for (const raw of attestations) {
    const provider = providerName(raw);
    if (!provider.includes('google')) continue;
    ageDays = Math.max(
      ageDays,
      readPathNumber(raw, ['account_age_days', 'age_days', 'data.account_age_days']) ?? 0,
    );
  }
  return ageDays;
}
