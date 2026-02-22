import { expect } from "chai";
import { createRequire } from "node:module";
import { PublicKey } from "@solana/web3.js";

const UPGRADEABLE_LOADER_ID = "BPFLoaderUpgradeab1e11111111111111111111111";
const PROGRAM_ID = "5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW";
const require = createRequire(import.meta.url);

describe("Solana program id helpers", () => {
  it("derives ProgramData PDA deterministically from string and PublicKey inputs", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const helper = require("../scripts/solana_program_ids.js") as {
      deriveProgramDataAddress: (programId: string | PublicKey) => PublicKey;
      UPGRADEABLE_BPF_LOADER_PROGRAM_ID: PublicKey;
    };

    const programId = new PublicKey(PROGRAM_ID);
    const expected = PublicKey.findProgramAddressSync(
      [programId.toBuffer()],
      new PublicKey(UPGRADEABLE_LOADER_ID),
    )[0];

    const fromString = helper.deriveProgramDataAddress(PROGRAM_ID);
    const fromPublicKey = helper.deriveProgramDataAddress(programId);

    expect(fromString.toBase58()).to.equal(expected.toBase58());
    expect(fromPublicKey.toBase58()).to.equal(expected.toBase58());
    expect(helper.UPGRADEABLE_BPF_LOADER_PROGRAM_ID.toBase58()).to.equal(UPGRADEABLE_LOADER_ID);
  });
});
