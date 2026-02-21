"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Cinzel_Decorative, Cormorant_Garamond } from "next/font/google";
import { useWallet } from "@solana/wallet-adapter-react";

import { ENDING_CODES } from "../../packages/universal-shield-sdk/src/hide_sis_types";
import { playSfx } from "./audio/sfx";
import { CharacterLayer } from "./components/CharacterLayer";
import { ChoiceBar } from "./components/ChoiceBar";
import { DialogueBox } from "./components/DialogueBox";
import { EndingSheet } from "./components/EndingSheet";
import { HudDrawer } from "./components/HudDrawer";
import { SfxController } from "./components/SfxController";
import { VNStage } from "./components/VNStage";
import { getSceneScript } from "./content/scenes";
import { getNodeChoicePresentation } from "./content/choices";
import type { EndingBreakdown, GameSession, QuotePayload } from "./types";
import styles from "./hide-sis.module.css";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "700"] });

type Mode = "verified" | "guest" | "bot_suspected";

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data?.error as string | undefined) ?? "request failed");
  }
  return data as T;
}

function modeLabel(mode: Mode): string {
  if (mode === "verified") return "Verified";
  if (mode === "guest") return "Guest";
  return "Bot Suspected";
}

export default function HideSisPage() {
  const wallet = useWallet();
  const [mode, setMode] = useState<Mode>("verified");
  const [session, setSession] = useState<GameSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string>("进入剧场，点亮第一句对白。\nEnter the stage and light the first line.");
  const [beatIndex, setBeatIndex] = useState(0);
  const [lastQuote, setLastQuote] = useState<QuotePayload | null>(null);
  const [endingBreakdown, setEndingBreakdown] = useState<EndingBreakdown | null>(null);

  const scene = useMemo(() => {
    if (!session) return null;
    return getSceneScript(session.current_node.id);
  }, [session]);

  const sceneNodeId = scene?.nodeId ?? 0;
  const previousNodeRef = useRef<number>(0);

  useEffect(() => {
    if (!scene) return;
    if (previousNodeRef.current !== scene.nodeId) {
      setBeatIndex(0);
      previousNodeRef.current = scene.nodeId;
    }
  }, [scene]);

  const currentBeat = scene?.beats[Math.min(beatIndex, Math.max(0, (scene?.beats.length ?? 1) - 1))] ?? null;
  const canAdvanceDialogue = scene ? beatIndex < scene.beats.length - 1 : false;
  const canShowChoices = !!scene && !canAdvanceDialogue && !busy && !session?.completed && session?.current_node.id !== 33;
  const canFinalize = !!session && session.current_node.id === 33 && session.final_decision_code != null && !session.completed && !canAdvanceDialogue;

  useEffect(() => {
    if (!currentBeat?.sfxCue) return;
    playSfx(currentBeat.sfxCue).catch(() => undefined);
  }, [sceneNodeId, beatIndex, currentBeat?.sfxCue]);

  async function handleStart() {
    try {
      setBusy(true);
      setError(null);
      setEndingBreakdown(null);
      await playSfx("click_soft");
      const walletAddress = wallet.publicKey?.toBase58();
      const data = await postJson<{ session: GameSession }>("/api/hide-sis/session/start", {
        wallet: walletAddress,
        mode,
      });
      setSession(data.session);
      setBeatIndex(0);
      setInfo("Picha 的目光先落下。\nPicha's gaze lands first.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to start session");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdvance() {
    if (!scene) return;
    if (canAdvanceDialogue) {
      await playSfx("click_soft");
      setBeatIndex((v) => Math.min(v + 1, scene.beats.length - 1));
    }
  }

  async function handleChoice(choiceId: number) {
    if (!session) return;
    try {
      setBusy(true);
      setError(null);
      await playSfx("choice_confirm");

      const quoted = await postJson<{ quote: QuotePayload }>("/api/hide-sis/turn/quote", {
        session_id: session.session_id,
      });
      setLastQuote(quoted.quote);

      const committed = await postJson<{
        quote: QuotePayload;
        session: GameSession;
        ready_to_finalize: boolean;
      }>("/api/hide-sis/turn/commit", {
        session_id: session.session_id,
        choice_id: choiceId,
      });

      setSession(committed.session);
      setInfo(
        committed.ready_to_finalize
          ? "终局节点已开启。\nFinal gate is now open."
          : committed.quote.blocked
            ? "压迫值过载，污染层上升。\nPressure overflowed, pollution increased."
            : "Picha 重新评估了你。\nPicha recalibrates her judgment.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to commit turn");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalize() {
    if (!session) return;
    try {
      setBusy(true);
      setError(null);
      await playSfx("ending_stamp");
      const data = await postJson<{
        session: GameSession;
        finalized_event: GameSession["finalized_event"];
        ending_breakdown?: EndingBreakdown;
      }>("/api/hide-sis/session/finalize", {
        session_id: session.session_id,
      });
      setSession(data.session);
      setEndingBreakdown(data.ending_breakdown ?? data.session.ending_breakdown ?? null);
      setInfo("结局已封印。\nEnding sealed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to finalize");
    } finally {
      setBusy(false);
    }
  }

  const activeSpeaker = currentBeat?.speaker ?? "narrator";
  const activeEmotion = currentBeat?.emotion ?? "calm";

  return (
    <div className={`${styles.page} ${cormorant.className}`}>
      <SfxController />

      {!session && (
        <div className={styles.lobbyWrap}>
          <section className={styles.lobbyPanel}>
            <p className={`${styles.eyebrow} ${cinzel.className}`}>Hide & Sis: The Silk of Secrets</p>
            <h1 className={`${styles.lobbyTitle} ${cinzel.className}`}>Picha x Baibua</h1>
            <p className={styles.lobbyText}>视觉小说模式已启用。中文主句 + 英文副句。\nVisual novel mode enabled. CN primary + EN support.</p>

            <div className={styles.modeRow}>
              {(["verified", "guest", "bot_suspected"] as Mode[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={busy}
                  onClick={() => setMode(item)}
                  className={`${styles.modeButton} ${mode === item ? styles.modeActive : ""}`}
                >
                  {modeLabel(item)}
                </button>
              ))}
            </div>

            <button type="button" disabled={busy} onClick={handleStart} className={styles.startButton}>
              {busy ? "Opening..." : "开始 Start"}
            </button>
            <Link href="/hide-sis/openworld" className={styles.openWorldLink}>
              Open World Mode
            </Link>

            <Link href="/" className={styles.backLink}>
              Back to Home
            </Link>

            <p className={styles.lobbyHint}>{info}</p>
            {error && <p className={styles.errorText}>{error}</p>}
          </section>
        </div>
      )}

      {session && scene && currentBeat && (
        <div className={styles.vnLayout}>
          <VNStage backgroundKey={scene.backgroundKey} camera={currentBeat.camera ?? "still"}>
            <CharacterLayer
              left={{ character: "baibua", emotion: activeSpeaker === "baibua" ? activeEmotion : "calm", active: activeSpeaker === "baibua" }}
              right={{ character: "picha", emotion: activeSpeaker === "picha" ? activeEmotion : "calm", active: activeSpeaker === "picha" }}
            />

            <div className="overlay-top">
              <p className="chapter-name">Chapter {session.current_node.chapter}</p>
              <h2 className={cinzel.className}>{session.current_node.title}</h2>
              <p className="chapter-sub">{session.current_node.prompt}</p>
            </div>
          </VNStage>

          <div className={styles.uiLayer}>
            <DialogueBox beat={currentBeat} canAdvance={canAdvanceDialogue} onAdvance={handleAdvance} />

            {canShowChoices && (
              <ChoiceBar
                choices={session.current_node.choices}
                presentation={getNodeChoicePresentation(session.current_node.id)}
                disabled={busy}
                onChoose={handleChoice}
              />
            )}

            {canFinalize && (
              <button className={styles.finalizeButton} type="button" onClick={handleFinalize} disabled={busy}>
                {busy ? "Sealing..." : "封印结局 Finalize Ending"}
              </button>
            )}

            <HudDrawer session={session} lastQuote={lastQuote} />

            {session.completed && session.finalized_event && (
              <EndingSheet
                session={session}
                breakdown={endingBreakdown ?? session.ending_breakdown}
                onNewSession={() => {
                  setSession(null);
                  setEndingBreakdown(null);
                  setLastQuote(null);
                  setError(null);
                }}
              />
            )}

            {error && <p className={styles.errorText}>{error}</p>}
            {!error && <p className={styles.infoText}>{info}</p>}
            <p className={styles.metaLine}>Node {session.current_node.id} · Decision {session.final_decision_code ?? "--"}</p>
            {session.ending_code === ENDING_CODES.FRAMED_AND_JAILED && session.completed && (
              <p className={styles.badEndingFlag}>Framed path triggered.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
