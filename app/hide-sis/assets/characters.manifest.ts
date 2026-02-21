export type CharacterId = "picha" | "baibua";
export type CharacterEmotion = "calm" | "icy" | "wounded" | "resolute" | "dangerous";

export type CharacterAssetEntry = {
  character: CharacterId;
  emotion: CharacterEmotion;
  localSrc: string;
  remoteSrc: string;
  placeholderSrc: string;
  attribution: string;
  licenseNote: string;
};

const pichaRemote = "https://image.tmdb.org/t/p/original/1CxuVTdVcAwlNa1RG7YY5BMFPWA.jpg";
const baibuaRemote = "https://image.tmdb.org/t/p/original/gHJjEHs0BlXkdK8lW0IocqCx5AR.jpg";

function make(character: CharacterId, emotion: CharacterEmotion): CharacterAssetEntry {
  if (character === "picha") {
    return {
      character,
      emotion,
      localSrc: "/hide-sis/characters/picha-jingjing-main.jpg",
      remoteSrc: pichaRemote,
      placeholderSrc: "/hide-sis/characters/picha-placeholder.svg",
      attribution: "TMDB image (Prariyapit Yu / Jingjing)",
      licenseNote: "External image for prototype/demo fallback; replace with licensed production stills before production.",
    };
  }

  return {
    character,
    emotion,
    localSrc: "/hide-sis/characters/baibua-janhae-main.jpg",
    remoteSrc: baibuaRemote,
    placeholderSrc: "/hide-sis/characters/baibua-placeholder.svg",
    attribution: "TMDB image (Ployshompoo Supasap / Janhae)",
    licenseNote: "External image for prototype/demo fallback; replace with licensed production stills before production.",
  };
}

export const CHARACTER_MANIFEST: CharacterAssetEntry[] = [
  make("picha", "calm"),
  make("picha", "icy"),
  make("picha", "wounded"),
  make("picha", "resolute"),
  make("picha", "dangerous"),
  make("baibua", "calm"),
  make("baibua", "icy"),
  make("baibua", "wounded"),
  make("baibua", "resolute"),
  make("baibua", "dangerous"),
];

export function resolveCharacterSourceCandidates(character: CharacterId, emotion: CharacterEmotion): string[] {
  const entry =
    CHARACTER_MANIFEST.find((item) => item.character === character && item.emotion === emotion) ??
    CHARACTER_MANIFEST.find((item) => item.character === character);

  if (!entry) return [];
  return [entry.localSrc, entry.remoteSrc, entry.placeholderSrc];
}

export function getCharacterAttribution(character: CharacterId): CharacterAssetEntry | undefined {
  return CHARACTER_MANIFEST.find((item) => item.character === character);
}
