const { PublicKey } = require('@solana/web3.js');

const UPGRADEABLE_BPF_LOADER_PROGRAM_ID = new PublicKey(
  'BPFLoaderUpgradeab1e11111111111111111111111',
);

function toPublicKey(value) {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

function deriveProgramDataAddress(programId) {
  const pid = toPublicKey(programId);
  return PublicKey.findProgramAddressSync(
    [pid.toBuffer()],
    UPGRADEABLE_BPF_LOADER_PROGRAM_ID,
  )[0];
}

module.exports = {
  UPGRADEABLE_BPF_LOADER_PROGRAM_ID,
  deriveProgramDataAddress,
};
