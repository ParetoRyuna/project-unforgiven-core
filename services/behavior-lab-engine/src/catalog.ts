import fs from 'fs';
import path from 'path';

import type {
  CaseSource,
  DailyLogSource,
  LabEntryPayload,
  LabEntryType,
  LabManifest,
  LabManifestEntry,
  PressureEventSource,
  StoryEpisodeCompiled,
} from './types.ts';

const CACHE_KEY = '__wanwanLabCatalogCacheV1';

type CacheState = {
  manifestMtimeMs: number;
  manifest: LabManifest | null;
};

function getCache(): CacheState {
  const globalRef = globalThis as typeof globalThis & { [CACHE_KEY]?: CacheState };
  if (!globalRef[CACHE_KEY]) {
    globalRef[CACHE_KEY] = { manifestMtimeMs: -1, manifest: null };
  }
  return globalRef[CACHE_KEY] as CacheState;
}

function generatedRoot(): string {
  return path.join(process.cwd(), 'content-lab', 'generated');
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export function getLabManifest(): LabManifest {
  const filePath = path.join(generatedRoot(), 'index.json');
  const stat = fs.statSync(filePath);
  const cache = getCache();
  if (cache.manifest && cache.manifestMtimeMs === stat.mtimeMs) {
    return cache.manifest;
  }
  const manifest = readJsonFile<LabManifest>(filePath);
  cache.manifest = manifest;
  cache.manifestMtimeMs = stat.mtimeMs;
  return manifest;
}

export function listLabEntries(): LabManifestEntry[] {
  return getLabManifest().entries;
}

export function findLabEntryById(entryType: LabEntryType, entryId: string): LabManifestEntry | null {
  return (
    getLabManifest().entries.find((entry) => entry.entry_type === entryType && entry.id === entryId) ?? null
  );
}

export function findLabEntryBySlug(entryType: LabEntryType, slug: string): LabManifestEntry | null {
  return (
    getLabManifest().entries.find((entry) => entry.entry_type === entryType && entry.slug === slug) ?? null
  );
}

function storyPathFromEntry(entry: LabManifestEntry): string {
  const slug = entry.slug;
  const parts = slug.split('-ep-');
  if (parts.length !== 2) {
    throw new Error(`invalid story slug mapping: ${slug}`);
  }
  const seriesId = parts[0];
  const episodeId = `ep-${parts[1]}`;
  return path.join(generatedRoot(), 'stories', seriesId, `${episodeId}.json`);
}

function pressurePathFromEntry(entry: LabManifestEntry): string {
  return path.join(generatedRoot(), 'pressure-events', `${entry.slug}.json`);
}

function casePathFromEntry(entry: LabManifestEntry): string {
  return path.join(generatedRoot(), 'cases', `${entry.slug}.json`);
}

function dailyLogPathFromEntry(entry: LabManifestEntry): string {
  return path.join(generatedRoot(), 'daily-logs', `${entry.slug}.json`);
}

export function getStoryBySlug(slug: string): StoryEpisodeCompiled | null {
  const entry = findLabEntryBySlug('story', slug);
  if (!entry) return null;
  return readJsonFile<StoryEpisodeCompiled>(storyPathFromEntry(entry));
}

export function getPressureEventBySlug(slug: string): PressureEventSource | null {
  const entry = findLabEntryBySlug('pressure_event', slug);
  if (!entry) return null;
  return readJsonFile<PressureEventSource>(pressurePathFromEntry(entry));
}

export function getCaseBySlug(slug: string): CaseSource | null {
  const entry = findLabEntryBySlug('case', slug);
  if (!entry) return null;
  return readJsonFile<CaseSource>(casePathFromEntry(entry));
}

export function getDailyLogBySlug(slug: string): DailyLogSource | null {
  const entry = findLabEntryBySlug('daily_log', slug);
  if (!entry) return null;
  return readJsonFile<DailyLogSource>(dailyLogPathFromEntry(entry));
}

export function getLabEntryPayload(entryType: LabEntryType, entryId: string): LabEntryPayload | null {
  const entry = findLabEntryById(entryType, entryId);
  if (!entry) return null;
  switch (entryType) {
    case 'story':
      return readJsonFile<StoryEpisodeCompiled>(storyPathFromEntry(entry));
    case 'pressure_event':
      return readJsonFile<PressureEventSource>(pressurePathFromEntry(entry));
    case 'case':
      return readJsonFile<CaseSource>(casePathFromEntry(entry));
    case 'daily_log':
      return readJsonFile<DailyLogSource>(dailyLogPathFromEntry(entry));
    default:
      return null;
  }
}
