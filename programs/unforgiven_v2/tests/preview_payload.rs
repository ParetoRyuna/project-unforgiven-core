use ed25519_dalek::{Keypair as DalekKeypair, PublicKey as DalekPublicKey, SecretKey, Signer};
use unforgiven_v2::{
    execution_event_from_payload, preview_event_from_payload, quote_from_payload,
    serialize_shield_payload_v0, AdminConfig, ShieldPayloadV0, POLICY_VERSION_V0,
    USER_MODE_BOT_SUSPECTED, USER_MODE_VERIFIED,
};

const ONE_SOL_LAMPORTS: u64 = 1_000_000_000;
const NOW: i64 = 1_700_000_000;

fn test_oracle_keypair() -> DalekKeypair {
    let secret = SecretKey::from_bytes(&[7u8; 32]).unwrap();
    let public = DalekPublicKey::from(&secret);
    DalekKeypair { secret, public }
}

fn admin(oracle_pubkey: [u8; 32], model_hash: [u8; 32]) -> AdminConfig {
    AdminConfig {
        authority: anchor_lang::prelude::Pubkey::new_unique(),
        oracle_pubkey,
        active_scoring_model_hash: model_hash,
        bump: 255,
    }
}

fn payload(
    user_pubkey: [u8; 32],
    score: u8,
    velocity_bps: i64,
    time_elapsed: u64,
    mode: u8,
    model_hash: [u8; 32],
) -> ShieldPayloadV0 {
    ShieldPayloadV0 {
        policy_version: POLICY_VERSION_V0,
        user_pubkey,
        initial_price: ONE_SOL_LAMPORTS,
        sales_velocity_bps: velocity_bps,
        time_elapsed,
        dignity_score: score,
        adapter_mask: 0b111,
        user_mode: mode,
        zk_provider: 1,
        zk_proof_hash: [0u8; 32],
        scoring_model_hash: model_hash,
        attestation_expiry: NOW + 120,
        nonce: 7,
    }
}

fn sign_payload(kp: &DalekKeypair, payload: &ShieldPayloadV0) -> [u8; 64] {
    kp.sign(&serialize_shield_payload_v0(payload)).to_bytes()
}

#[test]
fn same_market_heat_has_clear_price_split_by_dignity() {
    let oracle = test_oracle_keypair();
    let model_hash = [11u8; 32];
    let user = anchor_lang::prelude::Pubkey::new_unique();
    let admin_cfg = admin(oracle.public.to_bytes(), model_hash);

    let bot_payload = payload(
        user.to_bytes(),
        0,
        5_000,
        12,
        USER_MODE_BOT_SUSPECTED,
        model_hash,
    );
    let user_payload = payload(
        user.to_bytes(),
        90,
        5_000,
        12,
        USER_MODE_VERIFIED,
        model_hash,
    );

    let bot = preview_event_from_payload(
        &bot_payload,
        &sign_payload(&oracle, &bot_payload),
        &admin_cfg,
        &user,
        NOW,
    )
    .unwrap();
    let user_quote = preview_event_from_payload(
        &user_payload,
        &sign_payload(&oracle, &user_payload),
        &admin_cfg,
        &user,
        NOW,
    )
    .unwrap();

    assert!(bot.final_price > user_quote.final_price);
}

#[test]
fn invalid_payload_values_are_rejected() {
    let oracle = test_oracle_keypair();
    let model_hash = [11u8; 32];
    let user = anchor_lang::prelude::Pubkey::new_unique();
    let admin_cfg = admin(oracle.public.to_bytes(), model_hash);

    let bad_score = payload(
        user.to_bytes(),
        101,
        5_000,
        12,
        USER_MODE_VERIFIED,
        model_hash,
    );
    assert!(quote_from_payload(&bad_score).is_err());

    let bad_velocity = payload(
        user.to_bytes(),
        10,
        -10_000,
        12,
        USER_MODE_VERIFIED,
        model_hash,
    );
    assert!(quote_from_payload(&bad_velocity).is_err());

    let mut bad_sig_payload = payload(
        user.to_bytes(),
        50,
        5_000,
        12,
        USER_MODE_VERIFIED,
        model_hash,
    );
    let mut bad_sig = sign_payload(&oracle, &bad_sig_payload);
    bad_sig[0] ^= 1;
    assert!(
        preview_event_from_payload(&bad_sig_payload, &bad_sig, &admin_cfg, &user, NOW).is_err()
    );

    bad_sig_payload.attestation_expiry = NOW - 1;
    let sig = sign_payload(&oracle, &bad_sig_payload);
    assert!(preview_event_from_payload(&bad_sig_payload, &sig, &admin_cfg, &user, NOW).is_err());
}

#[test]
fn blocked_state_is_visible_on_infinity_path() {
    let oracle = test_oracle_keypair();
    let model_hash = [11u8; 32];
    let user = anchor_lang::prelude::Pubkey::new_unique();
    let admin_cfg = admin(oracle.public.to_bytes(), model_hash);

    let mut p = payload(
        user.to_bytes(),
        0,
        9_000,
        1_000,
        USER_MODE_BOT_SUSPECTED,
        model_hash,
    );
    p.initial_price = u64::MAX;

    let sig = sign_payload(&oracle, &p);
    let event = preview_event_from_payload(&p, &sig, &admin_cfg, &user, NOW).unwrap();
    assert!(event.is_infinite);
    assert!(event.blocked);
}

#[test]
fn blocked_payload_cannot_enter_execution_path() {
    let oracle = test_oracle_keypair();
    let model_hash = [11u8; 32];
    let user = anchor_lang::prelude::Pubkey::new_unique();
    let admin_cfg = admin(oracle.public.to_bytes(), model_hash);

    let mut p = payload(
        user.to_bytes(),
        0,
        9_000,
        1_000,
        USER_MODE_BOT_SUSPECTED,
        model_hash,
    );
    p.initial_price = u64::MAX;

    let sig = sign_payload(&oracle, &p);
    assert!(execution_event_from_payload(&p, &sig, &admin_cfg, &user, NOW).is_err());
}
