import { expect } from "chai";

import { NODE_CODES } from "../packages/universal-shield-sdk/src/hide_sis_types.ts";
import { resolveCharacterSourceCandidates } from "../app/hide-sis/assets/characters.manifest.ts";
import { SCENE_SCRIPTS } from "../app/hide-sis/content/scenes.ts";

describe("Hide & Sis VN content coverage", () => {
  it("has scene scripts for every node and bilingual beats", () => {
    for (const nodeId of Object.values(NODE_CODES)) {
      const scene = SCENE_SCRIPTS[nodeId];
      expect(scene, `scene missing for node ${nodeId}`).to.not.equal(undefined);
      expect(scene.beats.length, `beats length invalid for ${nodeId}`).to.be.greaterThanOrEqual(3);
      expect(scene.beats.length, `beats length invalid for ${nodeId}`).to.be.lessThanOrEqual(6);
      expect(scene.choicePresentation.length, `choice presentation missing for ${nodeId}`).to.be.greaterThan(0);

      for (const beat of scene.beats) {
        expect(beat.cn.trim().length, `cn beat missing for ${nodeId}`).to.be.greaterThan(0);
        expect(beat.en.trim().length, `en beat missing for ${nodeId}`).to.be.greaterThan(0);
      }
    }
  });

  it("resolves character image fallback candidates in local->remote->placeholder order", () => {
    const picha = resolveCharacterSourceCandidates("picha", "calm");
    const baibua = resolveCharacterSourceCandidates("baibua", "wounded");

    expect(picha).to.have.length(3);
    expect(baibua).to.have.length(3);

    expect(picha[0]).to.match(/^\/hide-sis\/characters\//);
    expect(picha[1]).to.match(/^https:\/\//);
    expect(picha[2]).to.match(/placeholder\.svg$/);

    expect(baibua[0]).to.match(/^\/hide-sis\/characters\//);
    expect(baibua[1]).to.match(/^https:\/\//);
    expect(baibua[2]).to.match(/placeholder\.svg$/);
  });
});
