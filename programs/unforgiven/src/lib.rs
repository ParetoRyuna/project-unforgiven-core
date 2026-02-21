use anchor_lang::solana_program::sysvar::SysvarId;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    ed25519_program,
    program::invoke,
    system_instruction,
    sysvar::instructions as ix_sysvar,
};
mod unforgiven_math;

use unforgiven_math::calculate_vrgda_price;

declare_id!("7cVF3X3PvNLTNHd9EqvWHsrtHkeJXwRzBcRuoHoTThVT");

// =============================================================================
// CONSTANTS
// =============================================================================

/// Basis points scale: 1.0 = 10000
const BPS: u128 = 10000;

/// Minimum alpha score (0.05) to prevent division-by-zero exploits
const MIN_ALPHA_BPS: u16 = 500;

/// Sales-velocity scaling constant used to derive exponential growth/decay rate
const DECAY_CONSTANT: i128 = 100;

/// Maximum sales velocity in basis points per second (±50% cap)
const PRICE_MODIFIER_MAX_BPS: i128 = 5000;

/// Ed25519 instruction data layout constants
const ED25519_HEADER_LEN: usize = 16;
const ED25519_PUBKEY_LEN: usize = 32;
const ED25519_SIG_LEN: usize = 64;
/// AuthorizationPayload (Spec 3.3): user_wallet(32) + event_id(32) + tier_level(1) + expiry(8) + nonce(8) = 81 bytes
const ORACLE_MESSAGE_LEN: usize = 81;

/// Sentinel value: offsets point to current instruction's data
const ED25519_CURRENT_IX: usize = u16::MAX as usize;

// =============================================================================
// STATE
// =============================================================================

#[account]
#[derive(InitSpace)]
pub struct GlobalState {
    /// Authority that can update auction params
    pub authority: Pubkey,
    /// Oracle's Ed25519 public key (verified via instruction introspection)
    pub oracle_pubkey: [u8; 32],
    /// Target sales per second in basis points (e.g. 10000 = 1.0 items/sec)
    pub target_rate_bps: u64,
    /// Auction start timestamp (unix)
    pub start_time: i64,
    /// Base ticket price in lamports
    pub base_price: u64,
    /// Number of tickets sold so far
    pub items_sold: u64,
    /// PDA bump for global state
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Ticket {
    /// Buyer's wallet
    pub buyer: Pubkey,
    /// Timestamp of purchase
    pub purchase_time: i64,
}

/// Minimal vault account for receiving SOL payments
#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub _reserved: u8,
}

// =============================================================================
// ERRORS
// =============================================================================

#[error_code]
pub enum UnforgivenError {
    #[msg("Signature expired")]
    SignatureExpired,
    #[msg("Invalid Ed25519 instruction")]
    InvalidEd25519Instruction,
    #[msg("Oracle public key mismatch")]
    OracleMismatch,
    #[msg("Message format mismatch")]
    MessageMismatch,
    #[msg("Buyer mismatch in signed message")]
    BuyerMismatch,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Event ID mismatch")]
    EventMismatch,
}

/// Tier -> Alpha BPS for VRGDA (Spec 3.4): 1=Platinum(10000), 2=Gold(5000), 3=Silver(2500)
fn tier_to_alpha_bps(tier_level: u8) -> u16 {
    match tier_level {
        1 => 10000,
        2 => 5000,
        _ => 2500u16.max(MIN_ALPHA_BPS),
    }
}

// =============================================================================
// PROGRAM
// =============================================================================

#[program]
pub mod unforgiven {
    use super::*;

    /// Initialize the global auction state.
    /// 
    /// * `target_rate_bps` - Target sales per second in basis points (10000 = 1 item/sec)
    /// * `start_time` - Unix timestamp when auction starts
    /// * `base_price` - Base ticket price in lamports
    pub fn initialize(
        ctx: Context<Initialize>,
        target_rate_bps: u64,
        start_time: i64,
        base_price: u64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.global_state;
        state.authority = ctx.accounts.authority.key();
        state.oracle_pubkey = ctx.accounts.oracle.key().to_bytes();
        state.target_rate_bps = target_rate_bps;
        state.start_time = start_time;
        state.base_price = base_price;
        state.items_sold = 0;
        state.bump = ctx.bumps.global_state;

        Ok(())
    }

    /// Buy a ticket (Mint Request for Relayer). Spec 3.4.
    /// * `sig_instruction_index` - Index of the Ed25519 verification instruction in the tx
    /// * `event_id` - Target event account (must equal global_state key for single-event MVP)
    /// * `tier_level` - 1=Platinum, 2=Gold, 3=Silver (maps to VRGDA discount)
    /// * `expiry` - Expiry timestamp signed by Oracle (replay protection)
    /// * `nonce` - Unique ID signed by Oracle
    pub fn buy_ticket(
        ctx: Context<BuyTicket>,
        sig_instruction_index: u16,
        event_id: Pubkey,
        tier_level: u8,
        expiry: i64,
        nonce: u64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp < expiry,
            UnforgivenError::SignatureExpired
        );

        require!(
            event_id == ctx.accounts.global_state.key(),
            UnforgivenError::EventMismatch
        );

        let ix_sysvar_info = ctx.accounts.instruction_sysvar.to_account_info();
        verify_ed25519_ix(
            &ix_sysvar_info,
            ctx.accounts.buyer.key(),
            event_id,
            tier_level,
            expiry,
            nonce,
            sig_instruction_index as usize,
            &ctx.accounts.global_state.oracle_pubkey,
        )?;

        // Tier -> Alpha BPS for VRGDA: 1=Platinum(10000), 2=Gold(5000), 3=Silver(2500)
        let safe_alpha = tier_to_alpha_bps(tier_level).max(MIN_ALPHA_BPS) as u128;

        // ----- Exponential VRGDA Math (all checked ops) -----
        let state = &ctx.accounts.global_state;
        let now: i64 = clock.unix_timestamp;
        let duration: i64 = now
            .checked_sub(state.start_time)
            .ok_or(UnforgivenError::MathOverflow)?;

        let duration_u64: u64 = if duration > 0 {
            duration as u64
        } else {
            0
        };
        let duration_u128 = duration_u64 as u128;

        // target_sold = (now - start_time) * target_rate_bps / 10000
        let target_sold: u128 = duration_u128
            .checked_mul(state.target_rate_bps as u128)
            .ok_or(UnforgivenError::MathOverflow)?
            .checked_div(BPS)
            .ok_or(UnforgivenError::MathOverflow)?;

        let items_sold_u128 = state.items_sold as u128;

        // sales_difference = items_sold - target_sold (can be negative)
        let sales_difference: i128 = (items_sold_u128 as i128)
            .checked_sub(target_sold as i128)
            .ok_or(UnforgivenError::MathOverflow)?;

        // sales_velocity_bps_per_sec = (sales_difference * DECAY_CONSTANT) / elapsed_seconds (clamped)
        let duration_for_velocity = i128::from(duration_u64.max(1));
        let sales_velocity_bps: i64 = sales_difference
            .checked_mul(DECAY_CONSTANT)
            .ok_or(UnforgivenError::MathOverflow)?
            .checked_div(duration_for_velocity)
            .ok_or(UnforgivenError::MathOverflow)?
            .clamp(-PRICE_MODIFIER_MAX_BPS, PRICE_MODIFIER_MAX_BPS) as i64;

        let vrgda_price: u128 = calculate_vrgda_price(
            state.base_price,
            sales_velocity_bps,
            duration_u64,
        )
        .map_err(|_| error!(UnforgivenError::MathOverflow))? as u128;

        // final_price = vrgda_price * 10000 / safe_alpha
        let final_price: u64 = (vrgda_price
            .checked_mul(BPS)
            .ok_or(UnforgivenError::MathOverflow)?
            .checked_div(safe_alpha)
            .ok_or(UnforgivenError::MathOverflow)?) as u64;

        // ----- Transfer SOL -----
        let transfer_ix = system_instruction::transfer(
            &ctx.accounts.buyer.key(),
            &ctx.accounts.vault.key(),
            final_price,
        );
        invoke(
            &transfer_ix,
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.vault.to_account_info(),
            ],
        )?;

        // ----- Update State -----
        let state = &mut ctx.accounts.global_state;
        state.items_sold = state
            .items_sold
            .checked_add(1)
            .ok_or(UnforgivenError::MathOverflow)?;

        // ----- Mint Ticket PDA (account created via init in context) -----
        let ticket = &mut ctx.accounts.ticket;
        ticket.buyer = ctx.accounts.buyer.key();
        ticket.purchase_time = clock.unix_timestamp;

        Ok(())
    }
}

// =============================================================================
// HELPER: Ed25519 Instruction Introspection
// =============================================================================

/// Verifies that the Ed25519 instruction at the given index contains a valid
/// Oracle signature for AuthorizationPayload: [user_wallet(32) + event_id(32) + tier_level(1) + expiry(8) + nonce(8)] = 81 bytes
fn verify_ed25519_ix(
    instruction_sysvar: &AccountInfo<'_>,
    expected_buyer: Pubkey,
    expected_event_id: Pubkey,
    expected_tier_level: u8,
    expected_expiry: i64,
    expected_nonce: u64,
    sig_instruction_index: usize,
    oracle_pubkey: &[u8; 32],
) -> Result<()> {
    let ed_ix = ix_sysvar::load_instruction_at_checked(sig_instruction_index, instruction_sysvar)
        .map_err(|_| error!(UnforgivenError::InvalidEd25519Instruction))?;

    // Must be Ed25519 program
    require!(
        ed_ix.program_id == ed25519_program::id(),
        UnforgivenError::InvalidEd25519Instruction
    );

    // Ed25519 is stateless - no accounts
    require!(
        ed_ix.accounts.is_empty(),
        UnforgivenError::InvalidEd25519Instruction
    );

    let data = &ed_ix.data;
    require!(
        data.len() >= ED25519_HEADER_LEN,
        UnforgivenError::InvalidEd25519Instruction
    );

    // Parse header
    let sig_count = data[0] as usize;
    require!(sig_count == 1, UnforgivenError::InvalidEd25519Instruction);

    // Offsets: signature_offset, sig_ix_idx, pubkey_offset, pubkey_ix_idx,
    //          message_offset, message_size, message_ix_idx
    let read_u16 = |i: usize| -> Result<u16> {
        let start = 2 + 2 * i;
        let end = start + 2;
        let src = data
            .get(start..end)
            .ok_or(error!(UnforgivenError::InvalidEd25519Instruction))?;
        let mut arr = [0u8; 2];
        arr.copy_from_slice(src);
        Ok(u16::from_le_bytes(arr))
    };

    let signature_offset = read_u16(0)? as usize;
    let signature_ix_idx = read_u16(1)? as usize;
    let public_key_offset = read_u16(2)? as usize;
    let public_key_ix_idx = read_u16(3)? as usize;
    let message_offset = read_u16(4)? as usize;
    let message_size = read_u16(5)? as usize;
    let message_ix_idx = read_u16(6)? as usize;

    // All must point to current instruction
    require!(
        signature_ix_idx == ED25519_CURRENT_IX
            && public_key_ix_idx == ED25519_CURRENT_IX
            && message_ix_idx == ED25519_CURRENT_IX,
        UnforgivenError::InvalidEd25519Instruction
    );

    require!(
        public_key_offset >= ED25519_HEADER_LEN
            && data.len() >= public_key_offset + ED25519_PUBKEY_LEN,
        UnforgivenError::InvalidEd25519Instruction
    );

    require!(
        message_offset >= ED25519_HEADER_LEN
            && data.len() >= message_offset + message_size,
        UnforgivenError::InvalidEd25519Instruction
    );

    require!(
        message_size == ORACLE_MESSAGE_LEN,
        UnforgivenError::MessageMismatch
    );

    // Verify Oracle pubkey
    let pk_slice = &data[public_key_offset..public_key_offset + ED25519_PUBKEY_LEN];
    let mut pk_arr = [0u8; 32];
    pk_arr.copy_from_slice(pk_slice);
    require!(
        pk_arr == *oracle_pubkey,
        UnforgivenError::OracleMismatch
    );

    // Verify message: AuthorizationPayload 81 bytes
    let msg = &data[message_offset..message_offset + message_size];
    let msg_wallet = &msg[0..32];
    let mut wallet_arr = [0u8; 32];
    wallet_arr.copy_from_slice(msg_wallet);
    let signed_buyer = Pubkey::new_from_array(wallet_arr);
    require!(
        signed_buyer == expected_buyer,
        UnforgivenError::BuyerMismatch
    );

    let msg_event_id = &msg[32..64];
    let mut event_arr = [0u8; 32];
    event_arr.copy_from_slice(msg_event_id);
    let signed_event_id = Pubkey::new_from_array(event_arr);
    require!(
        signed_event_id == expected_event_id,
        UnforgivenError::MessageMismatch
    );

    let signed_tier_level = msg[64];
    require!(
        signed_tier_level == expected_tier_level,
        UnforgivenError::MessageMismatch
    );

    let msg_expiry = &msg[65..73];
    let mut expiry_arr = [0u8; 8];
    expiry_arr.copy_from_slice(msg_expiry);
    let signed_expiry = i64::from_le_bytes(expiry_arr);
    require!(signed_expiry == expected_expiry, UnforgivenError::MessageMismatch);

    let msg_nonce = &msg[73..81];
    let mut nonce_arr = [0u8; 8];
    nonce_arr.copy_from_slice(msg_nonce);
    let signed_nonce = u64::from_le_bytes(nonce_arr);
    require!(signed_nonce == expected_nonce, UnforgivenError::MessageMismatch);

    Ok(())
}

// =============================================================================
// ACCOUNTS
// =============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + GlobalState::INIT_SPACE,
        seeds = [b"global"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        init,
        payer = authority,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, Vault>,

    /// Oracle's Ed25519 public key (stored for verification)
    /// CHECK: Validated as valid pubkey
    pub oracle: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(sig_instruction_index: u16, event_id: Pubkey, tier_level: u8, expiry: i64, nonce: u64)]
pub struct BuyTicket<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"global"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = buyer,
        space = 8 + Ticket::INIT_SPACE,
        seeds = [
            b"ticket",
            global_state.key().as_ref(),
            buyer.key().as_ref(),
            nonce.to_le_bytes().as_ref(),
        ],
        bump
    )]
    pub ticket: Account<'info, Ticket>,

    /// Instructions sysvar for Ed25519 introspection
    /// CHECK: Validated by well-known address
    #[account(address = ix_sysvar::Instructions::id())]
    pub instruction_sysvar: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
