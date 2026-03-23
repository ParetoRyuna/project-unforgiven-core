#![allow(unexpected_cfgs)]

use anchor_lang::{prelude::*, Discriminator};
use anchor_lang::solana_program::{
    ed25519_program,
    program::{invoke, invoke_signed},
    system_instruction,
    sysvar::instructions::{self, load_current_index_checked, load_instruction_at_checked},
};
use anchor_spl::token::{
    self,
    spl_token::{self, instruction::AuthorityType},
    CloseAccount,
    Mint,
    MintTo,
    SetAuthority,
    Token,
    TokenAccount,
    TransferChecked,
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
pub const TICKET_AMOUNT: u64 = 1;
pub const TICKET_DECIMALS: u8 = 0;
pub const RESALE_FEE_BPS: u64 = 500;

const ED25519_OFFSETS_START: usize = 2;
const ED25519_OFFSETS_SIZE: usize = 14;
const ED25519_SIGNATURE_LEN: usize = 64;
const ED25519_PUBKEY_LEN: usize = 32;
const EXECUTE_SHIELD_DISCRIMINATOR: [u8; 8] = [121, 30, 47, 225, 69, 64, 66, 80];
const TICKET_MINT_AUTHORITY_SEED: &[u8] = b"ticket_mint_authority_v2";
const TICKET_MINT_SEED: &[u8] = b"ticket_mint_v2";
const TICKET_TOKEN_SEED: &[u8] = b"ticket_token_v2";
const TICKET_RECEIPT_SEED: &[u8] = b"ticket_receipt_v2";
const TICKET_LISTING_SEED: &[u8] = b"ticket_listing_v2";
const TICKET_ESCROW_SEED: &[u8] = b"ticket_escrow_v2";
const SPL_TOKEN_MINT_LEN: usize = 82;
const SPL_TOKEN_ACCOUNT_LEN: usize = 165;

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
    #[msg("Treasury account does not match protocol authority")]
    TreasuryMismatch,
    #[msg("Ticket receipt mint mismatch")]
    TicketMintMismatch,
    #[msg("Ticket receipt owner mismatch")]
    TicketOwnerMismatch,
    #[msg("Ticket is already listed")]
    TicketAlreadyListed,
    #[msg("Ticket is not listed")]
    TicketNotListed,
    #[msg("Listing price must be positive")]
    InvalidListingPrice,
    #[msg("Ticket token amount mismatch")]
    InvalidTicketAmount,
    #[msg("Self trade is not allowed")]
    SelfTradeForbidden,
    #[msg("Invalid execute_shield account")]
    InvalidExecuteShieldAccount,
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

#[account]
#[derive(InitSpace)]
pub struct TicketReceipt {
    pub mint: Pubkey,
    pub event_key: Pubkey,
    pub original_buyer: Pubkey,
    pub current_holder: Pubkey,
    pub purchase_price: u64,
    pub last_sale_price: u64,
    pub issued_at: i64,
    pub last_transfer_at: i64,
    pub nonce: u64,
    pub zk_proof_hash: [u8; 32],
    pub listed: bool,
    pub resale_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TicketListing {
    pub seller: Pubkey,
    pub mint: Pubkey,
    pub ask_price: u64,
    pub created_at: i64,
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

#[event]
pub struct TicketMintedEvent {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub final_price: u64,
    pub nonce: u64,
}

#[event]
pub struct TicketListedEvent {
    pub mint: Pubkey,
    pub seller: Pubkey,
    pub ask_price: u64,
}

#[event]
pub struct TicketListingCanceledEvent {
    pub mint: Pubkey,
    pub seller: Pubkey,
}

#[event]
pub struct TicketSaleEvent {
    pub mint: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub sale_price: u64,
    pub protocol_fee: u64,
    pub resale_count: u64,
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
        let payload_bytes = serialize_shield_payload_v0(&payload);
        validate_preview_request_fields(
            &payload,
            &ctx.accounts.admin_config,
            &ctx.accounts.user.key(),
            clock.unix_timestamp,
        )?;
        verify_ed25519_ix(
            &ctx.accounts.instructions.to_account_info(),
            &payload_bytes,
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
        seed_payload: ShieldPayloadV0,
        _oracle_signature: [u8; 64],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_ix_idx = load_current_index_checked(&ctx.accounts.instructions.to_account_info())
            .map_err(|_| error!(UnforgivenV2Error::InvalidEd25519Instruction))?;
        let current_ix = load_instruction_at_checked(
            current_ix_idx as usize,
            &ctx.accounts.instructions.to_account_info(),
        )
        .map_err(|_| error!(UnforgivenV2Error::InvalidEd25519Instruction))?;
        require_keys_eq!(
            current_ix.program_id,
            crate::id(),
            UnforgivenV2Error::InvalidEd25519Instruction
        );

        let current_data = current_ix.data.as_slice();
        require!(
            current_data.len() == 8 + SHIELD_PAYLOAD_V0_LEN + ED25519_SIGNATURE_LEN,
            UnforgivenV2Error::InvalidEd25519Instruction
        );
        require!(
            current_data[..8] == EXECUTE_SHIELD_DISCRIMINATOR,
            UnforgivenV2Error::InvalidEd25519Instruction
        );

        let payload_bytes = &current_data[8..8 + SHIELD_PAYLOAD_V0_LEN];
        let oracle_signature = &current_data[8 + SHIELD_PAYLOAD_V0_LEN..];
        let expected_payload_bytes = serialize_shield_payload_v0(&seed_payload);
        require!(
            payload_bytes == expected_payload_bytes.as_slice(),
            UnforgivenV2Error::InvalidEd25519Instruction
        );
        validate_preview_request_fields(
            &seed_payload,
            &ctx.accounts.admin_config,
            &ctx.accounts.user.key(),
            clock.unix_timestamp,
        )?;
        verify_ed25519_ix(
            &ctx.accounts.instructions.to_account_info(),
            payload_bytes,
            oracle_signature,
            &ctx.accounts.admin_config.oracle_pubkey,
        )?;

        require_keys_eq!(
            ctx.accounts.treasury.key(),
            ctx.accounts.global_config_v2.authority,
            UnforgivenV2Error::TreasuryMismatch
        );

        let nonce_bytes = seed_payload.nonce.to_le_bytes();
        let user_key = ctx.accounts.user.key();
        let (expected_proof_use, proof_use_bump) = Pubkey::find_program_address(
            &[
                b"proof_use",
                seed_payload.user_pubkey.as_ref(),
                seed_payload.zk_proof_hash.as_ref(),
                nonce_bytes.as_ref(),
            ],
            ctx.program_id,
        );
        require_keys_eq!(
            ctx.accounts.proof_use.key(),
            expected_proof_use,
            UnforgivenV2Error::InvalidExecuteShieldAccount
        );

        let (expected_ticket_mint, ticket_mint_bump) = Pubkey::find_program_address(
            &[
                TICKET_MINT_SEED,
                seed_payload.user_pubkey.as_ref(),
                seed_payload.zk_proof_hash.as_ref(),
                nonce_bytes.as_ref(),
            ],
            ctx.program_id,
        );
        require_keys_eq!(
            ctx.accounts.ticket_mint.key(),
            expected_ticket_mint,
            UnforgivenV2Error::InvalidExecuteShieldAccount
        );

        let (expected_user_ticket_token, user_ticket_token_bump) = Pubkey::find_program_address(
            &[TICKET_TOKEN_SEED, expected_ticket_mint.as_ref(), user_key.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(
            ctx.accounts.user_ticket_token.key(),
            expected_user_ticket_token,
            UnforgivenV2Error::InvalidExecuteShieldAccount
        );

        let (expected_ticket_receipt, ticket_receipt_bump) = Pubkey::find_program_address(
            &[TICKET_RECEIPT_SEED, expected_ticket_mint.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(
            ctx.accounts.ticket_receipt.key(),
            expected_ticket_receipt,
            UnforgivenV2Error::InvalidExecuteShieldAccount
        );

        create_pda_account(
            &ctx.accounts.user.to_account_info(),
            &ctx.accounts.proof_use.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            ctx.program_id,
            8 + ProofUse::INIT_SPACE,
            &[
                b"proof_use",
                seed_payload.user_pubkey.as_ref(),
                seed_payload.zk_proof_hash.as_ref(),
                nonce_bytes.as_ref(),
                &[proof_use_bump],
            ],
        )?;
        create_pda_account(
            &ctx.accounts.user.to_account_info(),
            &ctx.accounts.ticket_mint.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &spl_token::id(),
            SPL_TOKEN_MINT_LEN,
            &[
                TICKET_MINT_SEED,
                seed_payload.user_pubkey.as_ref(),
                seed_payload.zk_proof_hash.as_ref(),
                nonce_bytes.as_ref(),
                &[ticket_mint_bump],
            ],
        )?;
        initialize_ticket_mint(
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.ticket_mint.to_account_info(),
            &ctx.accounts.ticket_mint_authority.key(),
        )?;
        create_pda_account(
            &ctx.accounts.user.to_account_info(),
            &ctx.accounts.user_ticket_token.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &spl_token::id(),
            SPL_TOKEN_ACCOUNT_LEN,
            &[
                TICKET_TOKEN_SEED,
                expected_ticket_mint.as_ref(),
                user_key.as_ref(),
                &[user_ticket_token_bump],
            ],
        )?;
        initialize_ticket_token_account(
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.user_ticket_token.to_account_info(),
            &ctx.accounts.ticket_mint.to_account_info(),
            &user_key,
        )?;
        create_pda_account(
            &ctx.accounts.user.to_account_info(),
            &ctx.accounts.ticket_receipt.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            ctx.program_id,
            8 + TicketReceipt::INIT_SPACE,
            &[
                TICKET_RECEIPT_SEED,
                expected_ticket_mint.as_ref(),
                &[ticket_receipt_bump],
            ],
        )?;

        let quote = quote_from_payload(&seed_payload)?;
        require!(!quote.blocked, UnforgivenV2Error::ShieldBlocked);

        write_proof_use_account(
            &ctx.accounts.proof_use.to_account_info(),
            &seed_payload,
            clock.unix_timestamp,
            proof_use_bump,
        )?;

        transfer_lamports(
            &ctx.accounts.user.to_account_info(),
            &ctx.accounts.treasury.to_account_info(),
            quote.final_price,
        )?;

        let mint_authority_bump = [ctx.bumps.ticket_mint_authority];
        let mint_authority_seeds: &[&[u8]] =
            &[TICKET_MINT_AUTHORITY_SEED, &mint_authority_bump];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.ticket_mint.to_account_info(),
                    to: ctx.accounts.user_ticket_token.to_account_info(),
                    authority: ctx.accounts.ticket_mint_authority.to_account_info(),
                },
                &[mint_authority_seeds],
            ),
            TICKET_AMOUNT,
        )?;

        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    account_or_mint: ctx.accounts.ticket_mint.to_account_info(),
                    current_authority: ctx.accounts.ticket_mint_authority.to_account_info(),
                },
                &[mint_authority_seeds],
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    account_or_mint: ctx.accounts.ticket_mint.to_account_info(),
                    current_authority: ctx.accounts.ticket_mint_authority.to_account_info(),
                },
                &[mint_authority_seeds],
            ),
            AuthorityType::FreezeAccount,
            None,
        )?;

        write_ticket_receipt_account(
            &ctx.accounts.ticket_receipt.to_account_info(),
            &ctx.accounts.ticket_mint.key(),
            &ctx.accounts.global_config_v2.key(),
            &user_key,
            quote.final_price,
            clock.unix_timestamp,
            &seed_payload,
            ticket_receipt_bump,
        )?;

        emit!(ShieldExecutionEvent {
            final_price: quote.final_price,
            blocked: quote.blocked,
            effective_velocity_bps: quote.effective_velocity_bps,
            dignity_score: seed_payload.dignity_score,
            adapter_mask: seed_payload.adapter_mask,
            user_mode: seed_payload.user_mode,
            nonce: seed_payload.nonce,
            zk_proof_hash: seed_payload.zk_proof_hash,
        });

        emit!(TicketMintedEvent {
            mint: ctx.accounts.ticket_mint.key(),
            owner: ctx.accounts.user.key(),
            final_price: quote.final_price,
            nonce: seed_payload.nonce,
        });

        Ok(())
    }

    pub fn list_ticket(ctx: Context<ListTicket>, ask_price: u64) -> Result<()> {
        require!(ask_price > 0, UnforgivenV2Error::InvalidListingPrice);
        require!(
            !ctx.accounts.ticket_receipt.listed,
            UnforgivenV2Error::TicketAlreadyListed
        );
        require!(
            ctx.accounts.seller_ticket_token.amount == TICKET_AMOUNT,
            UnforgivenV2Error::InvalidTicketAmount
        );

        let clock = Clock::get()?;

        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.seller_ticket_token.to_account_info(),
                    mint: ctx.accounts.ticket_mint.to_account_info(),
                    to: ctx.accounts.listing_escrow_token.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            TICKET_AMOUNT,
            TICKET_DECIMALS,
        )?;

        token::close_account(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.seller_ticket_token.to_account_info(),
                destination: ctx.accounts.seller.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ))?;

        let listing = &mut ctx.accounts.listing;
        listing.seller = ctx.accounts.seller.key();
        listing.mint = ctx.accounts.ticket_mint.key();
        listing.ask_price = ask_price;
        listing.created_at = clock.unix_timestamp;
        listing.bump = ctx.bumps.listing;

        ctx.accounts.ticket_receipt.listed = true;

        emit!(TicketListedEvent {
            mint: ctx.accounts.ticket_mint.key(),
            seller: ctx.accounts.seller.key(),
            ask_price,
        });

        Ok(())
    }

    pub fn cancel_ticket_listing(ctx: Context<CancelTicketListing>) -> Result<()> {
        require!(
            ctx.accounts.ticket_receipt.listed,
            UnforgivenV2Error::TicketNotListed
        );
        require!(
            ctx.accounts.listing_escrow_token.amount == TICKET_AMOUNT,
            UnforgivenV2Error::InvalidTicketAmount
        );

        let ticket_mint_key = ctx.accounts.ticket_mint.key();
        let listing_bump = [ctx.accounts.listing.bump];
        let listing_seeds: &[&[u8]] =
            &[TICKET_LISTING_SEED, ticket_mint_key.as_ref(), &listing_bump];

        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.listing_escrow_token.to_account_info(),
                    mint: ctx.accounts.ticket_mint.to_account_info(),
                    to: ctx.accounts.seller_ticket_token.to_account_info(),
                    authority: ctx.accounts.listing.to_account_info(),
                },
                &[listing_seeds],
            ),
            TICKET_AMOUNT,
            TICKET_DECIMALS,
        )?;

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.listing_escrow_token.to_account_info(),
                destination: ctx.accounts.seller.to_account_info(),
                authority: ctx.accounts.listing.to_account_info(),
            },
            &[listing_seeds],
        ))?;

        ctx.accounts.ticket_receipt.listed = false;

        emit!(TicketListingCanceledEvent {
            mint: ticket_mint_key,
            seller: ctx.accounts.seller.key(),
        });

        Ok(())
    }

    pub fn fill_ticket_listing(ctx: Context<FillTicketListing>) -> Result<()> {
        require!(
            ctx.accounts.ticket_receipt.listed,
            UnforgivenV2Error::TicketNotListed
        );
        require!(
            ctx.accounts.listing_escrow_token.amount == TICKET_AMOUNT,
            UnforgivenV2Error::InvalidTicketAmount
        );
        require_keys_neq!(
            ctx.accounts.buyer.key(),
            ctx.accounts.seller.key(),
            UnforgivenV2Error::SelfTradeForbidden
        );
        require_keys_eq!(
            ctx.accounts.fee_recipient.key(),
            ctx.accounts.global_config_v2.authority,
            UnforgivenV2Error::TreasuryMismatch
        );

        let clock = Clock::get()?;
        let sale_price = ctx.accounts.listing.ask_price;
        let protocol_fee = compute_resale_fee(sale_price)?;
        let seller_proceeds = sale_price
            .checked_sub(protocol_fee)
            .ok_or(error!(UnforgivenV2Error::InvalidListingPrice))?;

        transfer_lamports(
            &ctx.accounts.buyer.to_account_info(),
            &ctx.accounts.seller.to_account_info(),
            seller_proceeds,
        )?;
        transfer_lamports(
            &ctx.accounts.buyer.to_account_info(),
            &ctx.accounts.fee_recipient.to_account_info(),
            protocol_fee,
        )?;

        let ticket_mint_key = ctx.accounts.ticket_mint.key();
        let listing_bump = [ctx.accounts.listing.bump];
        let listing_seeds: &[&[u8]] =
            &[TICKET_LISTING_SEED, ticket_mint_key.as_ref(), &listing_bump];

        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.listing_escrow_token.to_account_info(),
                    mint: ctx.accounts.ticket_mint.to_account_info(),
                    to: ctx.accounts.buyer_ticket_token.to_account_info(),
                    authority: ctx.accounts.listing.to_account_info(),
                },
                &[listing_seeds],
            ),
            TICKET_AMOUNT,
            TICKET_DECIMALS,
        )?;

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.listing_escrow_token.to_account_info(),
                destination: ctx.accounts.seller.to_account_info(),
                authority: ctx.accounts.listing.to_account_info(),
            },
            &[listing_seeds],
        ))?;

        let receipt = &mut ctx.accounts.ticket_receipt;
        receipt.current_holder = ctx.accounts.buyer.key();
        receipt.last_sale_price = sale_price;
        receipt.last_transfer_at = clock.unix_timestamp;
        receipt.listed = false;
        receipt.resale_count = receipt
            .resale_count
            .checked_add(1)
            .ok_or(error!(UnforgivenV2Error::InvalidListingPrice))?;

        emit!(TicketSaleEvent {
            mint: ticket_mint_key,
            seller: ctx.accounts.seller.key(),
            buyer: ctx.accounts.buyer.key(),
            sale_price,
            protocol_fee,
            resale_count: receipt.resale_count,
        });

        Ok(())
    }
}

fn compute_resale_fee(sale_price: u64) -> Result<u64> {
    sale_price
        .checked_mul(RESALE_FEE_BPS)
        .and_then(|value| value.checked_div(10_000))
        .ok_or(error!(UnforgivenV2Error::InvalidListingPrice))
}

fn transfer_lamports<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    let ix = system_instruction::transfer(&from.key(), &to.key(), amount);
    invoke(&ix, &[from.clone(), to.clone()])?;
    Ok(())
}

fn create_pda_account<'info>(
    payer: &AccountInfo<'info>,
    new_account: &AccountInfo<'info>,
    system_program_info: &AccountInfo<'info>,
    owner: &Pubkey,
    space: usize,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    require!(
        new_account.owner == &anchor_lang::system_program::ID,
        UnforgivenV2Error::InvalidExecuteShieldAccount
    );
    require!(
        new_account.lamports() == 0 && new_account.data_is_empty(),
        UnforgivenV2Error::InvalidExecuteShieldAccount
    );

    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(space);
    let ix = system_instruction::create_account(
        payer.key,
        new_account.key,
        lamports,
        space as u64,
        owner,
    );
    invoke_signed(
        &ix,
        &[payer.clone(), new_account.clone(), system_program_info.clone()],
        &[signer_seeds],
    )?;
    Ok(())
}

fn initialize_ticket_mint<'info>(
    token_program_info: &AccountInfo<'info>,
    mint_info: &AccountInfo<'info>,
    mint_authority: &Pubkey,
) -> Result<()> {
    let ix = spl_token::instruction::initialize_mint2(
        &spl_token::id(),
        mint_info.key,
        mint_authority,
        Some(mint_authority),
        TICKET_DECIMALS,
    )
    .map_err(|_| error!(UnforgivenV2Error::InvalidExecuteShieldAccount))?;
    invoke(&ix, &[mint_info.clone(), token_program_info.clone()])?;
    Ok(())
}

fn initialize_ticket_token_account<'info>(
    token_program_info: &AccountInfo<'info>,
    token_account_info: &AccountInfo<'info>,
    mint_info: &AccountInfo<'info>,
    owner: &Pubkey,
) -> Result<()> {
    let ix = spl_token::instruction::initialize_account3(
        &spl_token::id(),
        token_account_info.key,
        mint_info.key,
        owner,
    )
    .map_err(|_| error!(UnforgivenV2Error::InvalidExecuteShieldAccount))?;
    invoke(
        &ix,
        &[
            token_account_info.clone(),
            mint_info.clone(),
            token_program_info.clone(),
        ],
    )?;
    Ok(())
}

fn write_proof_use_account<'info>(
    account: &AccountInfo<'info>,
    payload: &ShieldPayloadV0,
    used_at: i64,
    bump: u8,
) -> Result<()> {
    let mut data = account.try_borrow_mut_data()?;
    require!(
        data.len() >= 8 + ProofUse::INIT_SPACE,
        UnforgivenV2Error::InvalidExecuteShieldAccount
    );
    data[..8].copy_from_slice(&ProofUse::DISCRIMINATOR);
    data[8..40].copy_from_slice(&payload.user_pubkey);
    data[40..72].copy_from_slice(&payload.zk_proof_hash);
    data[72..80].copy_from_slice(&payload.nonce.to_le_bytes());
    data[80..88].copy_from_slice(&used_at.to_le_bytes());
    data[88] = bump;
    Ok(())
}

fn write_ticket_receipt_account<'info>(
    account: &AccountInfo<'info>,
    mint: &Pubkey,
    event_key: &Pubkey,
    owner: &Pubkey,
    final_price: u64,
    now: i64,
    payload: &ShieldPayloadV0,
    bump: u8,
) -> Result<()> {
    let mut data = account.try_borrow_mut_data()?;
    require!(
        data.len() >= 8 + TicketReceipt::INIT_SPACE,
        UnforgivenV2Error::InvalidExecuteShieldAccount
    );
    data[..8].copy_from_slice(&TicketReceipt::DISCRIMINATOR);
    data[8..40].copy_from_slice(mint.as_ref());
    data[40..72].copy_from_slice(event_key.as_ref());
    data[72..104].copy_from_slice(owner.as_ref());
    data[104..136].copy_from_slice(owner.as_ref());
    data[136..144].copy_from_slice(&final_price.to_le_bytes());
    data[144..152].copy_from_slice(&final_price.to_le_bytes());
    data[152..160].copy_from_slice(&now.to_le_bytes());
    data[160..168].copy_from_slice(&now.to_le_bytes());
    data[168..176].copy_from_slice(&payload.nonce.to_le_bytes());
    data[176..208].copy_from_slice(&payload.zk_proof_hash);
    data[208] = 0;
    data[209..217].copy_from_slice(&0u64.to_le_bytes());
    data[217] = bump;
    Ok(())
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
    payload_bytes: &[u8],
    oracle_signature: &[u8],
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
    require!(data[0] == 1, UnforgivenV2Error::InvalidEd25519Instruction);

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

    require!(pk == oracle_pubkey, UnforgivenV2Error::Ed25519PubkeyMismatch);
    require!(sig == oracle_signature, UnforgivenV2Error::Ed25519SignatureMismatch);

    require!(
        msg == payload_bytes,
        UnforgivenV2Error::Ed25519MessageMismatch
    );

    Ok(())
}

pub fn deserialize_shield_payload_v0(data: &[u8]) -> Result<ShieldPayloadV0> {
    require!(
        data.len() == SHIELD_PAYLOAD_V0_LEN,
        UnforgivenV2Error::InvalidEd25519Instruction
    );

    Ok(ShieldPayloadV0 {
        policy_version: data[0],
        user_pubkey: data[1..33]
            .try_into()
            .map_err(|_| error!(UnforgivenV2Error::InvalidEd25519Instruction))?,
        initial_price: u64::from_le_bytes(
            data[33..41]
                .try_into()
                .map_err(|_| error!(UnforgivenV2Error::InvalidEd25519Instruction))?,
        ),
        sales_velocity_bps: i64::from_le_bytes(
            data[41..49]
                .try_into()
                .map_err(|_| error!(UnforgivenV2Error::InvalidEd25519Instruction))?,
        ),
        time_elapsed: u64::from_le_bytes(
            data[49..57]
                .try_into()
                .map_err(|_| error!(UnforgivenV2Error::InvalidEd25519Instruction))?,
        ),
        dignity_score: data[57],
        adapter_mask: data[58],
        user_mode: data[59],
        zk_provider: data[60],
        zk_proof_hash: data[61..93]
            .try_into()
            .map_err(|_| error!(UnforgivenV2Error::InvalidEd25519Instruction))?,
        scoring_model_hash: data[93..125]
            .try_into()
            .map_err(|_| error!(UnforgivenV2Error::InvalidEd25519Instruction))?,
        attestation_expiry: i64::from_le_bytes(
            data[125..133]
                .try_into()
                .map_err(|_| error!(UnforgivenV2Error::InvalidEd25519Instruction))?,
        ),
        nonce: u64::from_le_bytes(
            data[133..141]
                .try_into()
                .map_err(|_| error!(UnforgivenV2Error::InvalidEd25519Instruction))?,
        ),
    })
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
pub struct ExecuteShield<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"global_v2"],
        bump = global_config_v2.bump,
    )]
    pub global_config_v2: Box<Account<'info, GlobalConfigV2>>,

    #[account(mut, address = global_config_v2.authority)]
    pub treasury: SystemAccount<'info>,

    #[account(
        seeds = [b"admin_config_v2"],
        bump = admin_config.bump,
    )]
    pub admin_config: Box<Account<'info, AdminConfig>>,

    #[account(address = instructions::ID)]
    /// CHECK: Address constraint guarantees this is the instructions sysvar.
    pub instructions: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: PDA is derived and created inside the handler to avoid payload-heavy pre-handler work.
    pub proof_use: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: PDA is derived and created inside the handler to avoid payload-heavy pre-handler work.
    pub ticket_mint: UncheckedAccount<'info>,

    #[account(seeds = [TICKET_MINT_AUTHORITY_SEED], bump)]
    /// CHECK: PDA signer used only as mint authority.
    pub ticket_mint_authority: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: PDA is derived and created inside the handler to avoid payload-heavy pre-handler work.
    pub user_ticket_token: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: PDA is derived and created inside the handler to avoid payload-heavy pre-handler work.
    pub ticket_receipt: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ListTicket<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    pub ticket_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [TICKET_RECEIPT_SEED, ticket_mint.key().as_ref()],
        bump = ticket_receipt.bump,
        constraint = ticket_receipt.mint == ticket_mint.key() @ UnforgivenV2Error::TicketMintMismatch,
        constraint = ticket_receipt.current_holder == seller.key() @ UnforgivenV2Error::TicketOwnerMismatch,
    )]
    pub ticket_receipt: Account<'info, TicketReceipt>,

    #[account(
        mut,
        seeds = [TICKET_TOKEN_SEED, ticket_mint.key().as_ref(), seller.key().as_ref()],
        bump,
        token::mint = ticket_mint,
        token::authority = seller,
    )]
    pub seller_ticket_token: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = seller,
        space = 8 + TicketListing::INIT_SPACE,
        seeds = [TICKET_LISTING_SEED, ticket_mint.key().as_ref()],
        bump,
    )]
    pub listing: Account<'info, TicketListing>,

    #[account(
        init,
        payer = seller,
        token::mint = ticket_mint,
        token::authority = listing,
        seeds = [TICKET_ESCROW_SEED, ticket_mint.key().as_ref()],
        bump,
    )]
    pub listing_escrow_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CancelTicketListing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    pub ticket_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [TICKET_RECEIPT_SEED, ticket_mint.key().as_ref()],
        bump = ticket_receipt.bump,
        constraint = ticket_receipt.mint == ticket_mint.key() @ UnforgivenV2Error::TicketMintMismatch,
        constraint = ticket_receipt.current_holder == seller.key() @ UnforgivenV2Error::TicketOwnerMismatch,
    )]
    pub ticket_receipt: Account<'info, TicketReceipt>,

    #[account(
        mut,
        close = seller,
        has_one = seller,
        constraint = listing.mint == ticket_mint.key() @ UnforgivenV2Error::TicketMintMismatch,
        seeds = [TICKET_LISTING_SEED, ticket_mint.key().as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, TicketListing>,

    #[account(
        init,
        payer = seller,
        token::mint = ticket_mint,
        token::authority = seller,
        seeds = [TICKET_TOKEN_SEED, ticket_mint.key().as_ref(), seller.key().as_ref()],
        bump,
    )]
    pub seller_ticket_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [TICKET_ESCROW_SEED, ticket_mint.key().as_ref()],
        bump,
        token::mint = ticket_mint,
        token::authority = listing,
    )]
    pub listing_escrow_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct FillTicketListing<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(mut)]
    pub seller: SystemAccount<'info>,

    #[account(
        seeds = [b"global_v2"],
        bump = global_config_v2.bump,
    )]
    pub global_config_v2: Account<'info, GlobalConfigV2>,

    #[account(mut, address = global_config_v2.authority)]
    pub fee_recipient: SystemAccount<'info>,

    pub ticket_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [TICKET_RECEIPT_SEED, ticket_mint.key().as_ref()],
        bump = ticket_receipt.bump,
        constraint = ticket_receipt.mint == ticket_mint.key() @ UnforgivenV2Error::TicketMintMismatch,
        constraint = ticket_receipt.current_holder == seller.key() @ UnforgivenV2Error::TicketOwnerMismatch,
    )]
    pub ticket_receipt: Account<'info, TicketReceipt>,

    #[account(
        mut,
        close = seller,
        has_one = seller,
        constraint = listing.mint == ticket_mint.key() @ UnforgivenV2Error::TicketMintMismatch,
        seeds = [TICKET_LISTING_SEED, ticket_mint.key().as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, TicketListing>,

    #[account(
        init,
        payer = buyer,
        token::mint = ticket_mint,
        token::authority = buyer,
        seeds = [TICKET_TOKEN_SEED, ticket_mint.key().as_ref(), buyer.key().as_ref()],
        bump,
    )]
    pub buyer_ticket_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [TICKET_ESCROW_SEED, ticket_mint.key().as_ref()],
        bump,
        token::mint = ticket_mint,
        token::authority = listing,
    )]
    pub listing_escrow_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{
        Keypair as DalekKeypair, PublicKey as DalekPublicKey, SecretKey, Signer,
    };

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

    fn sample_payload(
        score: u8,
        mode: u8,
        model_hash: [u8; 32],
        user: Pubkey,
    ) -> ShieldPayloadV0 {
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
        assert!(preview_event_from_payload(&payload, &sig, &admin, &Pubkey::new_unique(), NOW)
            .is_err());
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

    #[test]
    fn resale_fee_rounds_down() {
        assert_eq!(compute_resale_fee(1_000_000_000).unwrap(), 50_000_000);
        assert_eq!(compute_resale_fee(999).unwrap(), 49);
    }
}
