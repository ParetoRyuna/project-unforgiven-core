import { NODE_CODES, type ChapterCode, type NodeCode } from "../../../packages/universal-shield-sdk/src/hide_sis_types.ts";
import { getNodeChoicePresentation, type ChoicePresentation } from "./choices.ts";

export type Speaker = "picha" | "baibua" | "narrator";
export type Emotion = "calm" | "icy" | "wounded" | "resolute" | "dangerous";
export type CameraKey = "still" | "push" | "drift" | "shake" | "stamp";
export type BackgroundKey = "manor" | "memory_vault" | "rooftop";
export type SfxCue = "click_soft" | "choice_confirm" | "tension_rise" | "reveal_hit" | "ending_stamp" | "none";

export type DialogueBeat = {
  speaker: Speaker;
  cn: string;
  en: string;
  emotion: Emotion;
  sfxCue?: SfxCue;
  camera?: CameraKey;
};

export type SceneScript = {
  nodeId: NodeCode;
  chapter: ChapterCode;
  backgroundKey: BackgroundKey;
  beats: DialogueBeat[];
  choicePresentation: ChoicePresentation[];
};

function scene(nodeId: NodeCode, chapter: ChapterCode, backgroundKey: BackgroundKey, beats: DialogueBeat[]): SceneScript {
  return {
    nodeId,
    chapter,
    backgroundKey,
    beats,
    choicePresentation: getNodeChoicePresentation(nodeId),
  };
}

export const SCENE_SCRIPTS: Record<number, SceneScript> = {
  [NODE_CODES.C1_N1_OPENING_PROBE]: scene(NODE_CODES.C1_N1_OPENING_PROBE, 1, "manor", [
    {
      speaker: "narrator",
      cn: "老宅餐厅的烛火摇晃，花香像一层温柔的圈套。",
      en: "Candles tremble in the old manor. The flowers smell like a soft trap.",
      emotion: "calm",
      camera: "drift",
    },
    {
      speaker: "picha",
      cn: "大姐，昨晚你照顾了谁？我只要一个可验证的答案。",
      en: "Big sis, who did you care for last night? I only need a verifiable answer.",
      emotion: "dangerous",
      sfxCue: "tension_rise",
      camera: "push",
    },
    {
      speaker: "baibua",
      cn: "你问得很轻，但每个字都像刀背。",
      en: "You ask gently, but every word lands like a blade.",
      emotion: "icy",
    },
  ]),
  [NODE_CODES.C1_N2_PRIVATE_PROOF]: scene(NODE_CODES.C1_N2_PRIVATE_PROOF, 1, "manor", [
    {
      speaker: "picha",
      cn: "我不要细节。给我绿灯就好。",
      en: "I don't need your details. Just give me the green light.",
      emotion: "calm",
      camera: "still",
    },
    {
      speaker: "narrator",
      cn: "证明通过时，吊灯的光像是短暂回暖。",
      en: "When proof passes, the chandelier light briefly turns warm.",
      emotion: "calm",
      sfxCue: "click_soft",
    },
    {
      speaker: "baibua",
      cn: "我能给你真相的边界，但不给你我的全部。",
      en: "I can give you the boundary of truth, not all of me.",
      emotion: "resolute",
    },
  ]),
  [NODE_CODES.C1_N3_LAST_CALL_PRESSURE]: scene(NODE_CODES.C1_N3_LAST_CALL_PRESSURE, 1, "manor", [
    {
      speaker: "picha",
      cn: "Chatfah最后一通电话，不是打给我。",
      en: "Chatfah's final call wasn't to me.",
      emotion: "wounded",
      camera: "push",
    },
    {
      speaker: "baibua",
      cn: "再追问下去，代价会写在我们两个人身上。",
      en: "If we push harder, the cost will be written on both of us.",
      emotion: "icy",
    },
    {
      speaker: "narrator",
      cn: "审讯热度在空气里上升，像看不见的红丝。",
      en: "Interrogation heat rises in the air like invisible red threads.",
      emotion: "dangerous",
      sfxCue: "tension_rise",
      camera: "drift",
    },
  ]),
  [NODE_CODES.C2_N1_TERMS_EXCHANGE]: scene(NODE_CODES.C2_N1_TERMS_EXCHANGE, 2, "memory_vault", [
    {
      speaker: "narrator",
      cn: "夜更深了，家族档案室像一座记忆冷库。",
      en: "Night deepens. The family archive feels like a cold vault of memory.",
      emotion: "calm",
    },
    {
      speaker: "picha",
      cn: "你给我一段记忆，我还你一块真相。",
      en: "You give me one memory, I return one shard of truth.",
      emotion: "dangerous",
      camera: "push",
    },
    {
      speaker: "baibua",
      cn: "那就先定规则，别让我们都输给情绪。",
      en: "Then we set terms first, before emotion defeats us both.",
      emotion: "resolute",
    },
  ]),
  [NODE_CODES.C2_N2_FOOTPRINT_SWAP]: scene(NODE_CODES.C2_N2_FOOTPRINT_SWAP, 2, "memory_vault", [
    {
      speaker: "picha",
      cn: "你活过的痕迹，比口供诚实。",
      en: "The traces of your life are more honest than testimony.",
      emotion: "calm",
      sfxCue: "click_soft",
    },
    {
      speaker: "narrator",
      cn: "每一次验证都像掀开一层封蜡。",
      en: "Each verification peels back a sealed layer.",
      emotion: "calm",
    },
    {
      speaker: "baibua",
      cn: "我拿现实去换你的真话。",
      en: "I trade reality for your truth.",
      emotion: "resolute",
    },
  ]),
  [NODE_CODES.C2_N3_KILLER_REVEAL_GATE]: scene(NODE_CODES.C2_N3_KILLER_REVEAL_GATE, 2, "memory_vault", [
    {
      speaker: "picha",
      cn: "如果你还愿意听，我可以给你最痛的版本。",
      en: "If you still choose to listen, I can give you the most painful version.",
      emotion: "wounded",
      camera: "push",
    },
    {
      speaker: "baibua",
      cn: "我不要好看的谎话，我要可承受的真相。",
      en: "I don't want pretty lies. I want truth I can survive.",
      emotion: "icy",
    },
    {
      speaker: "narrator",
      cn: "揭露门在这一秒开或关。",
      en: "In this second, the reveal gate opens or shuts.",
      emotion: "dangerous",
      sfxCue: "reveal_hit",
      camera: "shake",
    },
  ]),
  [NODE_CODES.C2_N4_SECRET_PACT]: scene(NODE_CODES.C2_N4_SECRET_PACT, 2, "memory_vault", [
    {
      speaker: "picha",
      cn: "你站我这边，还是站记录那边？",
      en: "Are you standing with me, or with the record?",
      emotion: "dangerous",
    },
    {
      speaker: "baibua",
      cn: "我知道你手里有血，也知道你在等我点头。",
      en: "I know there is blood on your hands, and I know you are waiting for my nod.",
      emotion: "wounded",
    },
    {
      speaker: "narrator",
      cn: "协议不是法律，它更像誓言。",
      en: "This pact is not law. It is closer to an oath.",
      emotion: "calm",
    },
  ]),
  [NODE_CODES.C3_N1_SYSTEM_BREAKDOWN]: scene(NODE_CODES.C3_N1_SYSTEM_BREAKDOWN, 3, "rooftop", [
    {
      speaker: "narrator",
      cn: "家族大厦顶楼，风把每句话都吹成审判。",
      en: "On the family tower rooftop, wind turns every sentence into judgment.",
      emotion: "dangerous",
      camera: "drift",
    },
    {
      speaker: "picha",
      cn: "系统在塌，大姐。我们没有慢慢选的资格。",
      en: "The system is collapsing, big sis. We no longer have the luxury of slow choices.",
      emotion: "dangerous",
      sfxCue: "tension_rise",
      camera: "shake",
    },
    {
      speaker: "baibua",
      cn: "那就快选，但别先把彼此交出去。",
      en: "Then we choose fast, but we do not surrender each other first.",
      emotion: "resolute",
    },
  ]),
  [NODE_CODES.C3_N2_FINAL_CHOICE]: scene(NODE_CODES.C3_N2_FINAL_CHOICE, 3, "rooftop", [
    {
      speaker: "picha",
      cn: "埋了它，我们都还能活；揭开它，我们都得死一次。",
      en: "Bury it and we both live. Expose it and we both die once.",
      emotion: "dangerous",
      camera: "push",
    },
    {
      speaker: "baibua",
      cn: "我不怕真相，我怕我们只剩真相。",
      en: "I don't fear truth. I fear us being reduced to only truth.",
      emotion: "wounded",
    },
    {
      speaker: "narrator",
      cn: "终局按钮亮起，像法槌落下前的一秒。",
      en: "The final choice lights up like one second before a gavel drops.",
      emotion: "dangerous",
      sfxCue: "choice_confirm",
      camera: "shake",
    },
  ]),
  [NODE_CODES.C3_N3_ENDING_RESOLVE]: scene(NODE_CODES.C3_N3_ENDING_RESOLVE, 3, "rooftop", [
    {
      speaker: "narrator",
      cn: "没有更多问题。只剩后果。",
      en: "No more questions. Only consequence.",
      emotion: "calm",
      camera: "stamp",
      sfxCue: "ending_stamp",
    },
    {
      speaker: "picha",
      cn: "无论你写下哪个结局，我都会记得是你写的。",
      en: "Whichever ending you write, I will remember you wrote it.",
      emotion: "wounded",
    },
    {
      speaker: "baibua",
      cn: "那就让这一页，成为我们共同的罪与光。",
      en: "Then let this page become our shared sin and shared light.",
      emotion: "resolute",
    },
  ]),
};

export function getSceneScript(nodeId: number): SceneScript | null {
  return SCENE_SCRIPTS[nodeId] ?? null;
}
