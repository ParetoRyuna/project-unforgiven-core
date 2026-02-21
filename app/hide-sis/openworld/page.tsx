"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Cinzel_Decorative, Cormorant_Garamond } from "next/font/google";

import type {
  Action,
  ActionPreview,
  OpenWorldFinalizePayload,
  ScenePayload,
  ScoreBreakdown,
  SessionClock,
  WorldSeed,
  WorldState,
  PlayerState,
  Clue,
  Guidance,
} from "@/packages/universal-shield-sdk/src/hide_sis_openworld_types";
import styles from "./openworld.module.css";
import { WorldMap } from "./components/WorldMap";
import { ActionBar } from "./components/ActionBar";
import { NpcPanel } from "./components/NpcPanel";
import { Inventory } from "./components/Inventory";
import { Journal } from "./components/Journal";
import { DynamicScene } from "./components/DynamicScene";
import { QuestCard } from "./components/QuestCard";
import { ConsequenceBar } from "./components/ConsequenceBar";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "700"] });

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

export default function HideSisOpenWorldPage() {
  const [theme, setTheme] = useState("家族迷局与继承诅咒");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worldSeed, setWorldSeed] = useState<WorldSeed | null>(null);
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [scene, setScene] = useState<ScenePayload | null>(null);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [clock, setClock] = useState<SessionClock | null>(null);
  const [scorePreview, setScorePreview] = useState<ScoreBreakdown | null>(null);
  const [actionPreviewNext, setActionPreviewNext] = useState<ActionPreview[]>([]);
  const [rulebook, setRulebook] = useState<string[]>([]);
  const [finalized, setFinalized] = useState<OpenWorldFinalizePayload | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const stats = useMemo(() => {
    if (!worldState || !playerState) return null;
    return {
      heat: worldState.heat,
      truth: playerState.truth_progress,
      pollution: playerState.pollution_score,
      dignity: playerState.dignity,
      budget: worldState.budget_bps,
    };
  }, [worldState, playerState]);

  async function handleStart() {
    try {
      setBusy(true);
      setError(null);
      setFinalized(null);
      const payload = await postJson<{
        world_seed: WorldSeed;
        world_state: WorldState;
        player_state: PlayerState;
        scene: ScenePayload;
        guidance?: Guidance;
        clock: SessionClock;
        rulebook: string[];
        score_preview: ScoreBreakdown;
        action_preview_next: ActionPreview[];
      }>("/api/hide-sis/openworld/start", { theme_prompt: theme });

      setWorldSeed(payload.world_seed);
      setWorldState(payload.world_state);
      setPlayerState(payload.player_state);
      setScene(payload.scene);
      setGuidance(payload.guidance ?? null);
      setClock(payload.clock);
      setRulebook(Array.isArray(payload.rulebook) ? payload.rulebook : []);
      setScorePreview(payload.score_preview);
      setActionPreviewNext(payload.action_preview_next ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to start openworld");
    } finally {
      setBusy(false);
    }
  }

  async function applyAction(action: Action) {
    if (!worldSeed) return;
    try {
      setBusy(true);
      setError(null);
      const payload = await postJson<{
        world_seed: WorldSeed;
        world_state: WorldState;
        player_state: PlayerState;
        scene: ScenePayload;
        new_clues: Clue[];
        guidance?: Guidance;
        clock: SessionClock;
        score_preview: ScoreBreakdown;
        action_preview_next: ActionPreview[];
        finalized?: OpenWorldFinalizePayload | null;
      }>("/api/hide-sis/openworld/action", {
        world_id: worldSeed.world_id,
        action,
      });

      setWorldState(payload.world_state);
      setPlayerState(payload.player_state);
      setScene(payload.scene);
      setGuidance(payload.guidance ?? null);
      setClock(payload.clock);
      setScorePreview(payload.score_preview);
      setActionPreviewNext(payload.action_preview_next ?? []);
      if (payload.finalized) {
        setFinalized(payload.finalized);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to apply action");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalize() {
    if (!worldSeed) return;
    try {
      setBusy(true);
      setError(null);
      const payload = await postJson<OpenWorldFinalizePayload>("/api/hide-sis/openworld/finalize", {
        world_id: worldSeed.world_id,
        manual: true,
      });
      setFinalized(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to finalize");
    } finally {
      setBusy(false);
    }
  }

  const ready = worldSeed && worldState && playerState;
  const suggestedAction = guidance?.action_suggested ?? null;
  const showHook = !!clock && clock.time_spent <= 12;
  const countdown = clock ? clock.time_left : 100;
  const canFinalize = !!clock && clock.time_spent > 0 && !finalized;

  const scheduleParallax = (clientX: number, clientY: number) => {
    if (!mapRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const rect = mapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (clientX - rect.left) / rect.width - 0.5;
      const y = (clientY - rect.top) / rect.height - 0.5;
      const clamp = (value: number) => Math.max(-1, Math.min(1, value));
      const maxOffset = 12;
      const px = clamp(x) * maxOffset;
      const py = clamp(y) * maxOffset;
      mapRef.current?.style.setProperty("--parallax-x", `${px.toFixed(1)}px`);
      mapRef.current?.style.setProperty("--parallax-y", `${py.toFixed(1)}px`);
    });
  };

  const resetParallax = () => {
    if (!mapRef.current) return;
    mapRef.current.style.setProperty("--parallax-x", "0px");
    mapRef.current.style.setProperty("--parallax-y", "0px");
  };

  return (
    <div className={`${styles.page} ${cormorant.className}`}>
      <div className={styles.stage}>
        <div
          className={styles.mapLayer}
          ref={mapRef}
          onMouseMove={(event) => scheduleParallax(event.clientX, event.clientY)}
          onMouseLeave={resetParallax}
          onTouchMove={(event) => {
            const touch = event.touches[0];
            if (touch) scheduleParallax(touch.clientX, touch.clientY);
          }}
          onTouchEnd={resetParallax}
        >
          {ready && worldState && playerState ? (
            <WorldMap
              locations={worldState.locations}
              currentId={playerState.current_location}
              onMove={(id) => applyAction({ type: "MOVE", target_id: id })}
              suggestedAction={suggestedAction}
            />
          ) : (
            <div className={styles.mapPlaceholder}>
              <p>Generate a world to begin.</p>
              <span>输入世界主题并生成地图。</span>
            </div>
          )}
        </div>

        <div className={styles.hud}>
          <header className={styles.worldBar}>
            <div className={styles.worldTitle}>
              <p className={`${styles.kicker} ${cinzel.className}`}>Hide & Sis v0.3</p>
              <h1 className={cinzel.className}>开放世界 Open World</h1>
              <p className={styles.subline}>时间预算 · 阶段门 · 个性化终章</p>
            </div>
            <div className={styles.worldControls}>
              <input
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
                placeholder="输入世界主题"
                className={styles.themeInput}
              />
              <button type="button" onClick={handleStart} disabled={busy} className={styles.startButton}>
                {busy ? "Generating..." : "生成世界 Start"}
              </button>
            </div>
            <div className={styles.worldStatus}>
              <div className={styles.ruleCapsules}>
                <span>Phase {clock?.phase ?? "INVESTIGATION"}</span>
                <span>Projected {scorePreview?.grade ?? "D"}</span>
              </div>
              <div className={styles.countdown}>
                <span>Time Left</span>
                <strong>{countdown}</strong>
                <em>ticks</em>
              </div>
              <Link href="/hide-sis" className={styles.backLink}>
                返回主线模式
              </Link>
            </div>
          </header>

          {error && <p className={styles.errorText}>{error}</p>}

          {ready && worldState && playerState && (
            <main className={styles.hudBody}>
              <section className={styles.leftHud}>
                <QuestCard
                  guidance={guidance}
                  showHook={showHook}
                  theme={worldSeed?.theme_prompt ?? ""}
                  clock={clock}
                  scorePreview={scorePreview}
                  rulebook={rulebook}
                />
                <DynamicScene scene={scene} />
                <ConsequenceBar effects={scene?.effects ?? null} />
                <ActionBar
                  onSearch={() => applyAction({ type: "SEARCH" })}
                  onRest={() => applyAction({ type: "REST" })}
                  onFinalize={handleFinalize}
                  disabled={busy || !!finalized}
                  finalizeDisabled={!canFinalize}
                  suggestedAction={suggestedAction}
                  previews={actionPreviewNext}
                />
              </section>

              <section className={styles.rightHud}>
                <div className={styles.statsCard}>
                  <div>
                    <span>Heat</span>
                    <strong>{stats?.heat ?? 0}</strong>
                  </div>
                  <div>
                    <span>Truth</span>
                    <strong>{stats?.truth ?? 0}</strong>
                  </div>
                  <div>
                    <span>Pollution</span>
                    <strong>{stats?.pollution ?? 0}</strong>
                  </div>
                  <div>
                    <span>Dignity</span>
                    <strong>{stats?.dignity ?? 0}</strong>
                  </div>
                  <div>
                    <span>Budget</span>
                    <strong>{stats?.budget ?? 0}</strong>
                  </div>
                </div>

                <NpcPanel
                  npcs={worldState.npcs}
                  relationMap={playerState.relation_map}
                  onInterrogate={(id) => applyAction({ type: "INTERROGATE", target_id: id })}
                  onLie={(id) => applyAction({ type: "LIE", target_id: id })}
                  onAlly={(id) => applyAction({ type: "ALLY", target_id: id })}
                  disabled={busy || !!finalized}
                  suggestedAction={suggestedAction}
                  previews={actionPreviewNext}
                />

                <Inventory
                  clues={playerState.inventory}
                  npcs={worldState.npcs}
                  onUseClue={(clueId, npcId) => applyAction({ type: "USE_CLUE", target_id: npcId, clue_id: clueId })}
                  disabled={busy || !!finalized}
                  suggestedAction={suggestedAction}
                  previews={actionPreviewNext}
                />

                <Journal entries={playerState.journal} />

                {finalized && (
                  <section className="ow-card ow-ending">
                    <h3>{finalized.personalized_ending.title_cn}</h3>
                    <p>{finalized.personalized_ending.epilogue_cn}</p>
                    <p className="ow-ending-sub">{finalized.personalized_ending.title_en}</p>
                    <p className="ow-ending-sub">
                      Score: {finalized.score.composite} ({finalized.score.grade}) · 真相 {finalized.score.truth} · 纯净{" "}
                      {finalized.score.purity} · 关系 {finalized.score.relation} · 人性 {finalized.score.humanity}
                    </p>
                    <p className="ow-ending-sub">{finalized.llm_explainer.summary_cn}</p>
                  </section>
                )}
              </section>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
