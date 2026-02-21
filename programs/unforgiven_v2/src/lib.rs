#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    ed25519_program,
    sysvar::instructions::{self, load_current_index_checked, load_instruction_at_checked},
};

pub mod hide_sis_types;
pub mod unforgiven_math;

use unforgiven_math::{
    calculate_vrgda_quote, VrgdaInput, VrgdaMathError, VrgdaQuote, MAX_TIME_ELAPSED_SECS,
};

declare_id!("5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW");

pub const POLICY_VERSION_V0: u8 = 0;
pub const SHIELD_PAYLOAD_V0_LEN: usize = 141;
pub const USER_MODE_BOT_SUSPECTED: u8 = 0;
pub const USER_MODE_GUEST: u8 = 1;
pub const USER_MODE_VERIFIED: u8 = 2;
const ED25519_OFFSETS_START: usize = 2;
const ED25519_OFFSETS_SIZE: usize = 14;
const ED25519_SIGNATURE_LEN: usize = 64;
const ED25519_PUBKEY_LEN: usize = 32;

#[error_code]
pub enum UnforgivenV2Error {
    #[msg("Invalid policy version")]
    InvalidPolicyVersion,
    #[msg("Invalid dignity score")]
    InvalidDignityScore,
    #[msg("Invalid sales velocity")]
    InvalidSalesVelocity,
    #[msg("Invalid user mode")]
    InvalidUserMode,
    #[msg("Invalid time elapsed")]
    InvalidTimeElapsed,
    #[msg("Attestation expired")]
    AttestationExpired,
    #[msg("Invalid oracle signature")]
    InvalidOracleSignature,
    #[msg("Invalid oracle public key")]
    InvalidOraclePubkey,
    #[msg("Scoring model hash mismatch")]
    ScoringModelHashMismatch,
    #[msg("Signer does not match payload user pubkey")]
    UserPubkeyMismatch,
    #[msg("Shield blocked execution for this payload")]
    ShieldBlocked,
    #[msg("Missing prior ed25519 verify instruction")]
    MissingEd25519Instruction,
    #[msg("Invalid ed25519 verify instruction")]
    InvalidEd25519Instruction,
    #[msg("Ed25519 instruction payload mismatch")]
    Ed25519MessageMismatch,
    #[msg("Ed25519 instruction pubkey mismatch")]
    Ed25519PubkeyMismatch,
    #[msg("Ed25519 instruction signature mismatch")]
    Ed25519SignatureMismatch,
}

#[account]
#[derive(InitSpace)]
pub struct GlobalConfigV2 {
    pub authority: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct AdminConfig {
    pub authority: Pubkey,
    pub oracle_pubkey: [u8; 32],
    pub active_scoring_model_hash: [u8; 32],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ProofUse {
    pub user_pubkey: [u8; 32],
    pub zk_proof_hash: [u8; 32],
    pub nonce: u64,
    pub used_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ShieldPayloadV0 {
    pub policy_version: u8,
    pub user_pubkey: [u8; 32],
    pub initial_price: u64,
    pub sales_velocity_bps: i64,
    pub time_elapsed: u64,
    pub dignity_score: u8,
    pub adapter_mask: u8,
    pub user_mode: u8,
    pub zk_provider: u8,
    pub zk_proof_hash: [u8; 32],
    pub scoring_model_hash: [u8; 32],
    pub attestation_expiry: i64,
    pub nonce: u64,
}

#[event]
pub struct PreviewPriceEvent {
    pub final_price: u64,
    pub is_infinite: bool,
    pub blocked: bool,
    pub effective_velocity_bps: i64,
    pub dignity_score: u8,
    pub adapter_mask: u8,
    pub dignity_bucket: u8,
    pub user_mode: u8,
}

#[event]
pub struct ShieldExecutionEvent {
    pub final_price: u64,
    pub blocked: bool,
    pub effective_velocity_bps: i64,
    pub dignity_score: u8,
    pub adapter_mask: u8,
    pub user_mode: u8,
    pub nonce: u64,
    pub zk_proof_hash: [u8; 32],
}

#[program]
pub mod unforgiven_v2 {
    use super::*;

    pub fn initialize_v2(ctx: Context<InitializeV2>) -> Result<()> {
        let cfg = &mut ctx.accounts.global_config_v2;
        cfg.authority = ctx.accounts.authority.key();
        cfg.bump = ctx.bumps.global_config_v2;
        Ok(())
    }

    pub fn initialize_admin_config(
        ctx: Context<InitializeAdminConfig>,
        oracle_pubkey: [u8; 32],
        active_scoring_model_hash: [u8; 32],
    ) -> Result<()> {
        let admin = &mut ctx.accounts.admin_config;
        admin.authority = ctx.accounts.authority.key();
        admin.oracle_pubkey = oracle_pubkey;
        admin.active_scoring_model_hash = active_scoring_model_hash;
        admin.bump = ctx.bumps.admin_config;
        Ok(())
    }

    pub fn rotate_oracle(ctx: Context<AdminOnly>, oracle_pubkey: [u8; 32]) -> Result<()> {
        ctx.accounts.admin_config.oracle_pubkey = oracle_pubkey;
        Ok(())
    }

    pub fn set_scoring_model_hash(
        ctx: Context<AdminOnly>,
        active_scoring_model_hash: [u8; 32],
    ) -> Result<()> {
        ctx.accounts.admin_config.active_scoring_model_hash = active_scoring_model_hash;
        Ok(())
    }

    pub fn reset_admin_guardrails(
        ctx: Context<AdminOnly>,
        baseline_scoring_model_hash: [u8; 32],
    ) -> Result<()> {
        ctx.accounts.admin_config.active_scoring_model_hash = baseline_scoring_model_hash;
        Ok(())
    }

    pub fn preview_price(
        ctx: Context<PreviewPrice>,
        payload: ShieldPayloadV0,
        oracle_signature: [u8; 64],
    ) -> Result<()> {
        let clock = Clock::get()?;
        validate_preview_request_fields(
            &payload,
            &ctx.accounts.admin_config,
            &ctx.accounts.user.key(),
            clock.unix_timestamp,
        )?;
        verify_ed25519_ix(
            &ctx.accounts.instructions.to_account_info(),
            &payload,
            &oracle_signature,
            &ctx.accounts.admin_config.oracle_pubkey,
        )?;

        let quote = quote_from_payload(&payload)?;
        emit!(PreviewPriceEvent {
            final_price: quote.final_price,
            is_infinite: quote.is_infinite,
            blocked: quote.blocked,
            effective_velocity_bps: quote.effective_velocity_bps,
            dignity_score: payload.dignity_score,
            adapter_mask: payload.adapter_mask,
            dignity_bucket: dignity_bucket(payload.dignity_score),
            user_mode: payload.user_mode,
        });
        Ok(())
    }

    pub fn execute_shield(
        ctx: Context<ExecuteShield>,
        payload: ShieldPayloadV0,
        oracle_signature: [u8; 64],
    ) -> Result<()> {
        let clock = Clock::get()?;
        validate_preview_request_fields(
            &payload,
            &ctx.accounts.admin_config,
            &ctx.accounts.user.key(),
            clock.unix_timestamp,
        )?;
        verify_ed25519_ix(
            &ctx.accounts.instructions.to_account_info(),
            &payload,
            &oracle_signature,
            &ctx.accounts.admin_config.oracle_pubkey,
        )?;

        let quote = quote_from_payload(&payload)?;
        require!(!quote.blocked, UnforgivenV2Error::ShieldBlocked);

        let proof_use = &mut ctx.accounts.proof_use;
        proof_use.user_pubkey = payload.user_pubkey;
        proof_use.zk_proof_hash = payload.zk_proof_hash;
        proof_use.nonce = payload.nonce;
        proof_use.used_at = clock.unix_timestamp;
        proof_use.bump = ctx.bumps.proof_use;

        emit!(ShieldExecutionEvent {
            final_price: quote.final_price,
            blocked: quote.blocked,
            effective_velocity_bps: quote.effective_velocity_bps,
            dignity_score: payload.dignity_score,
            adapter_mask: payload.adapter_mask,
            user_mode: payload.user_mode,
            nonce: payload.nonce,
            zk_proof_hash: payload.zk_proof_hash,
        });
        Ok(())
    }
}

pub fn serialize_shield_payload_v0(payload: &ShieldPayloadV0) -> [u8; SHIELD_PAYLOAD_V0_LEN] {
    let mut out = [0u8; SHIELD_PAYLOAD_V0_LEN];

    out[0] = payload.policy_version;
    out[1..33].copy_from_slice(&payload.user_pubkey);
    out[33..41].copy_from_slice(&payload.initial_price.to_le_bytes());
    out[41..49].copy_from_slice(&payload.sales_velocity_bps.to_le_bytes());
    out[49..57].copy_from_slice(&payload.time_elapsed.to_le_bytes());
    out[57] = payload.dignity_score;
    out[58] = payload.adapter_mask;
    out[59] = payload.user_mode;
    out[60] = payload.zk_provider;
    out[61..93].copy_from_slice(&payload.zk_proof_hash);
    out[93..125].copy_from_slice(&payload.scoring_model_hash);
    out[125..133].copy_from_slice(&payload.attestation_expiry.to_le_bytes());
    out[133..141].copy_from_slice(&payload.nonce.to_le_bytes());

    out
}

#[cfg(not(target_os = "solana"))]
pub fn verify_oracle_signature(
    payload: &ShieldPayloadV0,
    oracle_signature: &[u8; 64],
    oracle_pubkey: &[u8; 32],
) -> Result<()> {
    use ed25519_dalek::{PublicKey as DalekPublicKey, Signature as DalekSignature, Verifier};

    let public = DalekPublicKey::from_bytes(oracle_pubkey)
        .map_err(|_| error!(UnforgivenV2Error::InvalidOraclePubkey))?;
    let signature = DalekSignature::from_bytes(oracle_signature)
        .map_err(|_| error!(UnforgivenV2Error::InvalidOracleSignature))?;
    let message = serialize_shield_payload_v0(payload);

    public
        .verify(&message, &signature)
        .map_err(|_| error!(UnforgivenV2Error::InvalidOracleSignature))
}

#[cfg(target_os = "solana")]
pub fn verify_oracle_signature(
    _payload: &ShieldPayloadV0,
    _oracle_signature: &[u8; 64],
    _oracle_pubkey: &[u8; 32],
) -> Result<()> {
    Ok(())
}

pub fn validate_preview_request_fields(
    payload: &ShieldPayloadV0,
    admin_config: &AdminConfig,
    user_key: &Pubkey,
    now: i64,
) -> Result<()> {
    require!(
        payload.policy_version == POLICY_VERSION_V0,
        UnforgivenV2Error::InvalidPolicyVersion
    );
    require!(payload.dignity_score <= 100, UnforgivenV2Error::InvalidDignityScore);
    require!(
        payload.sales_velocity_bps > -10_000,
        UnforgivenV2Error::InvalidSalesVelocity
    );
    require!(
        payload.user_mode <= USER_MODE_VERIFIED,
        UnforgivenV2Error::InvalidUserMode
    );
    require!(
        payload.time_elapsed <= MAX_TIME_ELAPSED_SECS,
        UnforgivenV2Error::InvalidTimeElapsed
    );
    require!(
        payload.attestation_expiry > now,
        UnforgivenV2Error::AttestationExpired
    );
    require!(
        payload.scoring_model_hash == admin_config.active_scoring_model_hash,
        UnforgivenV2Error::ScoringModelHashMismatch
    );

    let payload_user = Pubkey::new_from_array(payload.user_pubkey);
    require_keys_eq!(payload_user, *user_key, UnforgivenV2Error::UserPubkeyMismatch);
    Ok(())
}

fn read_u16(data: &[u8], offset: usize) -> Result<u16> {
    let bytes = data
        .get(offset..offset + 2)
        .ok_or(error!(UnforgivenV2Error::InvalidEd25519Instruction))?;
    Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
}

pub fn verify_ed25519_ix(
    ix_sysvar: &AccountInfo<'_>,
    payload: &ShieldPayloadV0,
    oracle_signature: &[u8; 64],
    oracle_pubkey: &[u8; 32],
) -> Result<()> {
    let current_ix_idx = load_current_index_checked(ix_sysvar)
        .map_err(|_| error!(UnforgivenV2Error::InvalidEd25519Instruction))?;
    require!(
        current_ix_idx > 0,
        UnforgivenV2Error::MissingEd25519Instruction
    );

    let ix = load_instruction_at_checked((current_ix_idx - 1) as usize, ix_sysvar)
        .map_err(|_| error!(UnforgivenV2Error::MissingEd25519Instruction))?;
    require!(
        ix.program_id == ed25519_program::id(),
        UnforgivenV2Error::InvalidEd25519Instruction
    );

    let data = ix.data.as_slice();
    require!(
        data.len() >= ED25519_OFFSETS_START + ED25519_OFFSETS_SIZE,
        UnforgivenV2Error::InvalidEd25519Instruction
    );
    require!(
        data[0] == 1,
        UnforgivenV2Error::InvalidEd25519Instruction
    );

    let sig_offset = read_u16(data, 2)? as usize;
    let sig_ix_index = read_u16(data, 4)?;
    let pubkey_offset = read_u16(data, 6)? as usize;
    let pubkey_ix_index = read_u16(data, 8)?;
    let msg_offset = read_u16(data, 10)? as usize;
    let msg_len = read_u16(data, 12)? as usize;
    let msg_ix_index = read_u16(data, 14)?;

    require!(
        sig_ix_index == u16::MAX
            && pubkey_ix_index == u16::MAX
            && msg_ix_index == u16::MAX,
        UnforgivenV2Error::InvalidEd25519Instruction
    );

    let sig = data
        .get(sig_offset..sig_offset + ED25519_SIGNATURE_LEN)
        .ok_or(error!(UnforgivenV2Error::InvalidEd25519Instruction))?;
    let pk = data
        .get(pubkey_offset..pubkey_offset + ED25519_PUBKEY_LEN)
        .ok_or(error!(UnforgivenV2Error::InvalidEd25519Instruction))?;
    let msg = data
        .get(msg_offset..msg_offset + msg_len)
        .ok_or(error!(UnforgivenV2Error::InvalidEd25519Instruction))?;

    require!(
        pk == oracle_pubkey,
        UnforgivenV2Error::Ed25519PubkeyMismatch
    );
    require!(
        sig == oracle_signature,
        UnforgivenV2Error::Ed25519SignatureMismatch
    );

    let expected_msg = serialize_shield_payload_v0(payload);
    require!(
        msg == expected_msg,
        UnforgivenV2Error::Ed25519MessageMismatch
    );

    Ok(())
}

pub fn quote_from_payload(payload: &ShieldPayloadV0) -> Result<VrgdaQuote> {
    let input = VrgdaInput {
        initial_price: payload.initial_price,
        sales_velocity_bps: payload.sales_velocity_bps,
        time_elapsed: payload.time_elapsed,
        dignity_score: payload.dignity_score,
    };

    calculate_vrgda_quote(input).map_err(|err| match err {
        VrgdaMathError::InvalidDignityScore => error!(UnforgivenV2Error::InvalidDignityScore),
        VrgdaMathError::InvalidSalesVelocity => error!(UnforgivenV2Error::InvalidSalesVelocity),
        VrgdaMathError::InvalidTimeElapsed => error!(UnforgivenV2Error::InvalidTimeElapsed),
    })
}

pub fn preview_event_from_payload(
    payload: &ShieldPayloadV0,
    oracle_signature: &[u8; 64],
    admin_config: &AdminConfig,
    user_key: &Pubkey,
    now: i64,
) -> Result<PreviewPriceEvent> {
    validate_preview_request_fields(payload, admin_config, user_key, now)?;
    verify_oracle_signature(payload, oracle_signature, &admin_config.oracle_pubkey)?;

    let quote = quote_from_payload(payload)?;
    Ok(PreviewPriceEvent {
        final_price: quote.final_price,
        is_infinite: quote.is_infinite,
        blocked: quote.blocked,
        effective_velocity_bps: quote.effective_velocity_bps,
        dignity_score: payload.dignity_score,
        adapter_mask: payload.adapter_mask,
        dignity_bucket: dignity_bucket(payload.dignity_score),
        user_mode: payload.user_mode,
    })
}

pub fn execution_event_from_payload(
    payload: &ShieldPayloadV0,
    oracle_signature: &[u8; 64],
    admin_config: &AdminConfig,
    user_key: &Pubkey,
    now: i64,
) -> Result<ShieldExecutionEvent> {
    validate_preview_request_fields(payload, admin_config, user_key, now)?;
    verify_oracle_signature(payload, oracle_signature, &admin_config.oracle_pubkey)?;

    let quote = quote_from_payload(payload)?;
    require!(!quote.blocked, UnforgivenV2Error::ShieldBlocked);

    Ok(ShieldExecutionEvent {
        final_price: quote.final_price,
        blocked: quote.blocked,
        effective_velocity_bps: quote.effective_velocity_bps,
        dignity_score: payload.dignity_score,
        adapter_mask: payload.adapter_mask,
        user_mode: payload.user_mode,
        nonce: payload.nonce,
        zk_proof_hash: payload.zk_proof_hash,
    })
}

fn dignity_bucket(score: u8) -> u8 {
    match score {
        0..=20 => 0,
        21..=40 => 1,
        41..=60 => 2,
        61..=80 => 3,
        _ => 4,
    }
}

#[derive(Accounts)]
pub struct InitializeV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::UnforgivenV2>,
    #[account(constraint = program_data.upgrade_authority_address == Some(authority.key()))]
    pub program_data: Account<'info, ProgramData>,

    #[account(
        init,
        payer = authority,
        space = 8 + GlobalConfigV2::INIT_SPACE,
        seeds = [b"global_v2"],
        bump
    )]
    pub global_config_v2: Account<'info, GlobalConfigV2>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeAdminConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::UnforgivenV2>,
    #[account(constraint = program_data.upgrade_authority_address == Some(authority.key()))]
    pub program_data: Account<'info, ProgramData>,

    #[account(
        init,
        payer = authority,
        space = 8 + AdminConfig::INIT_SPACE,
        seeds = [b"admin_config_v2"],
        bump
    )]
    pub admin_config: Account<'info, AdminConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority,
        seeds = [b"admin_config_v2"],
        bump = admin_config.bump,
    )]
    pub admin_config: Account<'info, AdminConfig>,
}

#[derive(Accounts)]
pub struct PreviewPrice<'info> {
    pub user: Signer<'info>,

    #[account(
        seeds = [b"admin_config_v2"],
        bump = admin_config.bump,
    )]
    pub admin_config: Account<'info, AdminConfig>,

    #[account(address = instructions::ID)]
    /// CHECK: Address constraint guarantees this is the instructions sysvar.
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(payload: ShieldPayloadV0)]
pub struct ExecuteShield<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"admin_config_v2"],
        bump = admin_config.bump,
    )]
    pub admin_config: Account<'info, AdminConfig>,

    #[account(address = instructions::ID)]
    /// CHECK: Address constraint guarantees this is the instructions sysvar.
    pub instructions: UncheckedAccount<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + ProofUse::INIT_SPACE,
        seeds = [
            b"proof_use",
            payload.user_pubkey.as_ref(),
            payload.zk_proof_hash.as_ref(),
            payload.nonce.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub proof_use: Account<'info, ProofUse>,

    pub system_program: Program<'info, System>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Keypair as DalekKeypair, PublicKey as DalekPublicKey, SecretKey, Signer};

    const ONE_SOL_LAMPORTS: u64 = 1_000_000_000;
    const NOW: i64 = 1_700_000_000;

    fn test_oracle_keypair() -> DalekKeypair {
        let secret = SecretKey::from_bytes(&[7u8; 32]).unwrap();
        let public = DalekPublicKey::from(&secret);
        DalekKeypair { secret, public }
    }

    fn sample_admin(oracle_pubkey: [u8; 32], model_hash: [u8; 32]) -> AdminConfig {
        AdminConfig {
            authority: Pubkey::new_unique(),
            oracle_pubkey,
            active_scoring_model_hash: model_hash,
            bump: 255,
        }
    }

    fn sample_payload(score: u8, mode: u8, model_hash: [u8; 32], user: Pubkey) -> ShieldPayloadV0 {
        ShieldPayloadV0 {
            policy_version: POLICY_VERSION_V0,
            user_pubkey: user.to_bytes(),
            initial_price: ONE_SOL_LAMPORTS,
            sales_velocity_bps: 5_000,
            time_elapsed: 12,
            dignity_score: score,
            adapter_mask: 0b0000_0111,
            user_mode: mode,
            zk_provider: 1,
            zk_proof_hash: [3u8; 32],
            scoring_model_hash: model_hash,
            attestation_expiry: NOW + 120,
            nonce: 99,
        }
    }

    fn sign_payload(payload: &ShieldPayloadV0, kp: &DalekKeypair) -> [u8; 64] {
        kp.sign(&serialize_shield_payload_v0(payload)).to_bytes()
    }

    #[test]
    fn payload_v0_serialization_layout_is_frozen() {
        let user = Pubkey::new_from_array([1u8; 32]);
        let payload = ShieldPayloadV0 {
            policy_version: 7,
            user_pubkey: user.to_bytes(),
            initial_price: 10,
            sales_velocity_bps: -2,
            time_elapsed: 3,
            dignity_score: 4,
            adapter_mask: 5,
            user_mode: 2,
            zk_provider: 9,
            zk_proof_hash: [8u8; 32],
            scoring_model_hash: [6u8; 32],
            attestation_expiry: 11,
            nonce: 12,
        };

        let bytes = serialize_shield_payload_v0(&payload);
        assert_eq!(bytes.len(), SHIELD_PAYLOAD_V0_LEN);
        assert_eq!(bytes[0], 7);
        assert_eq!(&bytes[1..33], &user.to_bytes());
        assert_eq!(u64::from_le_bytes(bytes[33..41].try_into().unwrap()), 10);
        assert_eq!(i64::from_le_bytes(bytes[41..49].try_into().unwrap()), -2);
        assert_eq!(u64::from_le_bytes(bytes[49..57].try_into().unwrap()), 3);
        assert_eq!(bytes[57], 4);
        assert_eq!(bytes[58], 5);
        assert_eq!(bytes[59], 2);
        assert_eq!(bytes[60], 9);
        assert_eq!(&bytes[61..93], &[8u8; 32]);
        assert_eq!(&bytes[93..125], &[6u8; 32]);
        assert_eq!(i64::from_le_bytes(bytes[125..133].try_into().unwrap()), 11);
        assert_eq!(u64::from_le_bytes(bytes[133..141].try_into().unwrap()), 12);
    }

    #[test]
    fn same_heat_higher_dignity_yields_lower_price() {
        let oracle = test_oracle_keypair();
        let model_hash = [11u8; 32];
        let user = Pubkey::new_unique();
        let admin = sample_admin(oracle.public.to_bytes(), model_hash);

        let bot = sample_payload(0, USER_MODE_BOT_SUSPECTED, model_hash, user);
        let human = sample_payload(90, USER_MODE_VERIFIED, model_hash, user);

        let bot_event = preview_event_from_payload(
            &bot,
            &sign_payload(&bot, &oracle),
            &admin,
            &user,
            NOW,
        )
        .unwrap();
        let human_event = preview_event_from_payload(
            &human,
            &sign_payload(&human, &oracle),
            &admin,
            &user,
            NOW,
        )
        .unwrap();

        assert!(bot_event.final_price > human_event.final_price);
    }

    #[test]
    fn invalid_signature_expiry_and_user_mismatch_are_rejected() {
        let oracle = test_oracle_keypair();
        let model_hash = [11u8; 32];
        let user = Pubkey::new_unique();
        let admin = sample_admin(oracle.public.to_bytes(), model_hash);

        let mut payload = sample_payload(50, USER_MODE_VERIFIED, model_hash, user);
        let mut bad_sig = [0u8; 64];
        bad_sig.copy_from_slice(&sign_payload(&payload, &oracle));
        bad_sig[0] ^= 0xFF;
        assert!(preview_event_from_payload(&payload, &bad_sig, &admin, &user, NOW).is_err());

        payload.attestation_expiry = NOW - 1;
        let expired_sig = sign_payload(&payload, &oracle);
        assert!(preview_event_from_payload(&payload, &expired_sig, &admin, &user, NOW).is_err());

        let payload = sample_payload(50, USER_MODE_VERIFIED, model_hash, user);
        let sig = sign_payload(&payload, &oracle);
        assert!(preview_event_from_payload(&payload, &sig, &admin, &Pubkey::new_unique(), NOW).is_err());
    }

    #[test]
    fn scoring_model_hash_mismatch_is_rejected() {
        let oracle = test_oracle_keypair();
        let model_hash = [11u8; 32];
        let user = Pubkey::new_unique();
        let admin = sample_admin(oracle.public.to_bytes(), [99u8; 32]);

        let payload = sample_payload(50, USER_MODE_VERIFIED, model_hash, user);
        let sig = sign_payload(&payload, &oracle);
        assert!(preview_event_from_payload(&payload, &sig, &admin, &user, NOW).is_err());
    }

    #[test]
    fn blocked_payload_is_rejected_in_execution_path() {
        let oracle = test_oracle_keypair();
        let model_hash = [11u8; 32];
        let user = Pubkey::new_unique();
        let admin = sample_admin(oracle.public.to_bytes(), model_hash);

        let mut payload = sample_payload(0, USER_MODE_BOT_SUSPECTED, model_hash, user);
        payload.initial_price = u64::MAX;
        payload.sales_velocity_bps = 9_000;
        payload.time_elapsed = 1_000;
        let sig = sign_payload(&payload, &oracle);

        assert!(execution_event_from_payload(&payload, &sig, &admin, &user, NOW).is_err());
    }
}
