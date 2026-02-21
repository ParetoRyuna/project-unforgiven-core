export type SfxCue = "click_soft" | "choice_confirm" | "tension_rise" | "reveal_hit" | "ending_stamp" | "none";

let ctx: AudioContext | null = null;
let enabled = true;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  return ctx;
}

function beep(frequency: number, durationMs: number, gainValue: number, type: OscillatorType = "sine"): Promise<void> {
  return new Promise((resolve) => {
    const audio = getContext();
    if (!audio || !enabled) return resolve();

    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = gainValue;

    osc.connect(gain);
    gain.connect(audio.destination);

    const now = audio.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainValue, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.01);
    osc.onended = () => resolve();
  });
}

export function setSfxEnabled(on: boolean): void {
  enabled = on;
}

export function getSfxEnabled(): boolean {
  return enabled;
}

export async function unlockSfx(): Promise<void> {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === "suspended") {
    await audio.resume();
  }
}

export async function playSfx(cue: SfxCue): Promise<void> {
  if (cue === "none") return;
  if (!enabled) return;

  switch (cue) {
    case "click_soft":
      await beep(700, 70, 0.03, "triangle");
      return;
    case "choice_confirm":
      await beep(520, 70, 0.04, "triangle");
      await beep(620, 80, 0.03, "triangle");
      return;
    case "tension_rise":
      await beep(220, 90, 0.03, "sawtooth");
      await beep(280, 90, 0.03, "sawtooth");
      await beep(340, 120, 0.03, "sawtooth");
      return;
    case "reveal_hit":
      await beep(880, 60, 0.04, "square");
      await beep(480, 180, 0.03, "sine");
      return;
    case "ending_stamp":
      await beep(160, 100, 0.05, "square");
      await beep(130, 220, 0.04, "square");
      return;
    default:
      return;
  }
}
