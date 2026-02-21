import {
  CHAPTER_LABELS,
  ENDING_LABELS,
  HIDE_SIS_CANONICAL_CODES,
  NODE_LABELS,
} from "../../packages/universal-shield-sdk/src/hide_sis_types.ts";

export const HIDE_SIS_FRONTEND_ID_MAP = {
  version: "v0.1",
  codes: HIDE_SIS_CANONICAL_CODES,
  labels: {
    chapters: CHAPTER_LABELS,
    nodes: NODE_LABELS,
    endings: ENDING_LABELS,
  },
} as const;
