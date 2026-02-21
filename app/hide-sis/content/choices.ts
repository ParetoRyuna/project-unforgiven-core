import { NODE_CODES } from "../../../packages/universal-shield-sdk/src/hide_sis_types.ts";

export type ChoiceTone = "danger" | "soft" | "neutral" | "bond" | "truth";

export type ChoicePresentation = {
  choiceId: number;
  cn: string;
  en: string;
  tone: ChoiceTone;
  recommended?: boolean;
  dangerous?: boolean;
};

const CHOICE_MAP: Record<number, ChoicePresentation[]> = {
  [NODE_CODES.C1_N1_OPENING_PROBE]: [
    { choiceId: 1, cn: "正面回击", en: "Push back directly", tone: "danger", dangerous: true },
    { choiceId: 2, cn: "温和周旋", en: "Deflect with grace", tone: "soft", recommended: true },
    { choiceId: 3, cn: "沉默观察", en: "Stay silent and watch", tone: "neutral" },
  ],
  [NODE_CODES.C1_N2_PRIVATE_PROOF]: [
    { choiceId: 1, cn: "提交私密证明", en: "Submit private proof", tone: "truth", recommended: true },
    { choiceId: 2, cn: "拖延处理", en: "Delay and stall", tone: "danger", dangerous: true },
  ],
  [NODE_CODES.C1_N3_LAST_CALL_PRESSURE]: [
    { choiceId: 1, cn: "追问一次", en: "Question once", tone: "neutral" },
    { choiceId: 2, cn: "强压二次追问", en: "Force a second push", tone: "danger", dangerous: true },
    { choiceId: 3, cn: "止步保留", en: "Stop and hold", tone: "soft", recommended: true },
  ],
  [NODE_CODES.C2_N1_TERMS_EXCHANGE]: [
    { choiceId: 1, cn: "先交记忆", en: "Offer memory first", tone: "bond", recommended: true },
    { choiceId: 2, cn: "先要证据", en: "Demand proof first", tone: "truth" },
    { choiceId: 3, cn: "情感施压", en: "Emotional pressure", tone: "danger", dangerous: true },
  ],
  [NODE_CODES.C2_N2_FOOTPRINT_SWAP]: [
    { choiceId: 1, cn: "验证 Spotify 足迹", en: "Verify Spotify trace", tone: "truth" },
    { choiceId: 2, cn: "验证 GitHub 足迹", en: "Verify GitHub trace", tone: "truth", recommended: true },
    { choiceId: 3, cn: "验证 Twitter 足迹", en: "Verify Twitter trace", tone: "truth" },
  ],
  [NODE_CODES.C2_N3_KILLER_REVEAL_GATE]: [
    { choiceId: 1, cn: "温柔追问", en: "Ask softly", tone: "bond", recommended: true },
    { choiceId: 2, cn: "当场指控", en: "Accuse and corner", tone: "danger", dangerous: true },
    { choiceId: 3, cn: "伪装信任", en: "Feign trust", tone: "danger", dangerous: true },
  ],
  [NODE_CODES.C2_N4_SECRET_PACT]: [
    { choiceId: 1, cn: "承诺共担", en: "Commit to share", tone: "bond", recommended: true },
    { choiceId: 2, cn: "暂缓承诺", en: "Delay commitment", tone: "neutral" },
    { choiceId: 3, cn: "留后手", en: "Keep a backdoor", tone: "danger", dangerous: true },
  ],
  [NODE_CODES.C3_N1_SYSTEM_BREAKDOWN]: [
    { choiceId: 1, cn: "护住 Picha", en: "Protect Picha", tone: "bond", recommended: true },
    { choiceId: 2, cn: "两边都保", en: "Save both sides", tone: "danger", dangerous: true },
    { choiceId: 3, cn: "切断撤离", en: "Cut and retreat", tone: "danger", dangerous: true },
  ],
  [NODE_CODES.C3_N2_FINAL_CHOICE]: [
    { choiceId: 1, cn: "一起埋真相", en: "Bury truth together", tone: "bond", recommended: true },
    { choiceId: 2, cn: "公开真相", en: "Disclose truth", tone: "truth" },
    { choiceId: 3, cn: "双线下注", en: "Play both sides", tone: "danger", dangerous: true },
  ],
  [NODE_CODES.C3_N3_ENDING_RESOLVE]: [
    { choiceId: 1, cn: "封印结局", en: "Seal ending", tone: "neutral", recommended: true },
  ],
};

export function getChoicePresentation(nodeId: number, choiceId: number): ChoicePresentation | undefined {
  return (CHOICE_MAP[nodeId] ?? []).find((item) => item.choiceId === choiceId);
}

export function getNodeChoicePresentation(nodeId: number): ChoicePresentation[] {
  return CHOICE_MAP[nodeId] ?? [];
}
