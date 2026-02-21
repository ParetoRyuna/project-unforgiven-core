import { expect } from "chai";

import {
  startOpenWorld,
  applyOpenWorldAction,
  finalizeOpenWorldSession,
} from "../services/hide-sis-engine/src/openworld_engine.ts";

describe("Hide & Sis openworld", () => {
  it("starts an openworld session with seed, locations, npcs, clues and meta", async () => {
    const payload = await startOpenWorld({ theme_prompt: "家族迷局" });

    expect(payload.world_seed.world_id).to.be.a("string");
    expect(payload.world_state.locations.length).to.be.greaterThan(0);
    expect(payload.world_state.npcs.length).to.be.greaterThan(0);
    expect(payload.world_state.clues.length).to.be.greaterThan(0);
    expect(payload.player_state.current_location).to.be.a("string");
    expect(payload.clock.time_budget).to.equal(100);
    expect(payload.rulebook.length).to.be.greaterThan(0);
    expect(payload.score_preview.grade).to.be.a("string");
    expect(payload.action_preview_next.length).to.be.greaterThan(0);
  });

  it("applies actions and returns expected movement/clock updates", async () => {
    const payload = await startOpenWorld({ theme_prompt: "家族迷局" });
    const worldId = payload.world_seed.world_id;
    const firstLocation = payload.world_state.locations[0]?.id;
    const secondLocation = payload.world_state.locations[1]?.id;
    const initialTime = payload.clock.time_spent;
    const initialTick = payload.world_state.time_tick;

    const moved = await applyOpenWorldAction({
      world_id: worldId,
      action: { type: "MOVE", target_id: secondLocation ?? firstLocation },
    });

    expect(moved.world_state.time_tick).to.equal(initialTick + 1);
    expect(moved.player_state.current_location).to.equal(secondLocation ?? firstLocation);
    expect(moved.clock.time_spent).to.equal(initialTime + 12);

    const searched = await applyOpenWorldAction({
      world_id: worldId,
      action: { type: "SEARCH" },
    });

    expect(searched.player_state.inventory.length).to.be.greaterThan(0);
  });

  it("applies novelty decay so repeated SEARCH gains less truth", async () => {
    const payload = await startOpenWorld({ theme_prompt: "家族迷局" });
    const worldId = payload.world_seed.world_id;

    const a1 = await applyOpenWorldAction({ world_id: worldId, action: { type: "SEARCH" } });
    const a2 = await applyOpenWorldAction({ world_id: worldId, action: { type: "SEARCH" } });

    const gain1 = (a1.scene.effects[0]?.truth_delta as number) ?? 0;
    const gain2 = (a2.scene.effects[0]?.truth_delta as number) ?? 0;
    expect(gain2).to.be.lessThan(gain1);
  });

  it("caps truth gain in CORROBORATION without clue use on target", async () => {
    const payload = await startOpenWorld({ theme_prompt: "家族迷局" });
    const worldId = payload.world_seed.world_id;
    const first = payload.world_state.locations[0].id;
    const second = payload.world_state.locations[1].id;
    const npc = payload.world_state.npcs[0].id;

    await applyOpenWorldAction({ world_id: worldId, action: { type: "MOVE", target_id: second } });
    await applyOpenWorldAction({ world_id: worldId, action: { type: "MOVE", target_id: first } });
    await applyOpenWorldAction({ world_id: worldId, action: { type: "MOVE", target_id: second } });
    await applyOpenWorldAction({ world_id: worldId, action: { type: "MOVE", target_id: first } });

    const interrogate = await applyOpenWorldAction({ world_id: worldId, action: { type: "INTERROGATE", target_id: npc } });
    const truthDelta = interrogate.scene.effects.find((effect) => typeof effect.truth_delta === "number")?.truth_delta ?? 0;
    expect(truthDelta).to.be.at.most(2);
  });

  it("does not hard-fail on high pollution/heat before time budget", async () => {
    const payload = await startOpenWorld({ theme_prompt: "家族迷局" });
    const worldId = payload.world_seed.world_id;
    const npc = payload.world_state.npcs[0].id;

    let latest = payload as any;
    for (let idx = 0; idx < 6; idx += 1) {
      latest = await applyOpenWorldAction({ world_id: worldId, action: { type: "LIE", target_id: npc } });
    }
    expect(latest.player_state.pollution_score).to.be.greaterThan(0);
    expect(latest.finalized).to.equal(null);
  });

  it("auto-finalizes when time budget is exhausted", async () => {
    const payload = await startOpenWorld({ theme_prompt: "家族迷局" });
    const worldId = payload.world_seed.world_id;

    let latest: any = null;
    for (let idx = 0; idx < 12; idx += 1) {
      latest = await applyOpenWorldAction({ world_id: worldId, action: { type: "REST" } });
    }

    expect(latest.finalized).to.not.equal(null);
    expect(latest.finalized.score.composite).to.be.a("number");
    expect(latest.finalized.personalized_ending.title_cn).to.be.a("string");
  });

  it("supports manual finalize and fallback ending payload", async () => {
    const payload = await startOpenWorld({ theme_prompt: "家族迷局" });
    const worldId = payload.world_seed.world_id;
    await applyOpenWorldAction({ world_id: worldId, action: { type: "SEARCH" } });

    const finalized = await finalizeOpenWorldSession(worldId);
    expect(finalized.score.grade).to.be.oneOf(["S", "A", "B", "C", "D"]);
    expect(finalized.engine_summary.length).to.be.greaterThan(0);
    expect(finalized.personalized_ending.title_cn).to.be.a("string");
    expect(finalized.llm_explainer.score_delta.truth).to.be.within(-3, 3);
  });
});
