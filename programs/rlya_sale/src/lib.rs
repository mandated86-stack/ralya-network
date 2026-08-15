use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

declare_id!("AjAMpuiEKuSbi6JUtdtWT5DJzA18ZWmnTqLnVcp3iCS2");

const SALE_SEED: &[u8] = b"sale";
const SALE_VAULT_SEED: &[u8] = b"sale_vault";
const STAKING_BONUS_VAULT_SEED: &[u8] = b"staking_bonus_vault";
const FOUNDER_LOCK_SEED: &[u8] = b"founder_lock";
const FOUNDER_VAULT_SEED: &[u8] = b"founder_vault";
const REFERRAL_SEED: &[u8] = b"referral";
const PRELAUNCH_METRICS_SEED: &[u8] = b"prelaunch_metrics";
const PRELAUNCH_DELIVERY_SEED: &[u8] = b"prelaunch_delivery";
const PRELAUNCH_MANUAL_DELIVERY_SEED: &[u8] = b"prelaunch_manual_delivery";

const RLYA_DECIMALS: u8 = 9;
const USDC_DECIMALS: u8 = 6;
const RLYA_UNIT: u128 = 1_000_000_000;
const USDC_UNIT: u64 = 1_000_000;
const HARD_CAP: u64 = 839_000_000_000_000_000;
const PRESALE_CAP: u64 = 288_000_000_000_000_000;
const STAKING_BONUS_RESERVE: u64 = 14_400_000_000_000_000;
const FOUNDER_AMOUNT: u64 = 83_900_000_000_000_000;
const FOUNDER_LOCK_SECONDS: i64 = 365 * 24 * 60 * 60;
const STANDARD_PRESALE_RELEASE_SECONDS: i64 = 21 * 24 * 60 * 60;
const STAKED_PRESALE_RELEASE_SECONDS: i64 = 36 * 24 * 60 * 60;
const MIN_PURCHASE_USDC: u64 = USDC_UNIT;
const BASE_PRICE_MICRO_USDC: u64 = 3_000;
const STEP_SIZE_RLYA: u64 = 1_000_000;
const STEP_SIZE_BASE_UNITS: u64 = STEP_SIZE_RLYA * 1_000_000_000;
const STEP_INCREMENT_MICRO_USDC: u64 = 50;
const REFERRAL_BPS: u64 = 100;
const STAKING_BONUS_BPS: u64 = 500;
const BPS_DENOMINATOR: u64 = 10_000;

#[program]
pub mod rlya_sale {
    use super::*;

    /// Creates sale state plus separate program-controlled base-sale, staking-bonus
    /// and founder vaults. No RLYA is minted by this instruction.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        require!(
            ctx.accounts.rlya_mint.decimals == RLYA_DECIMALS,
            SaleError::WrongDecimals
        );
        require!(
            ctx.accounts.usdc_mint.decimals == USDC_DECIMALS,
            SaleError::WrongDecimals
        );
        require!(
            ctx.accounts.rlya_mint.mint_authority == COption::Some(ctx.accounts.admin.key()),
            SaleError::InitializerIsNotMintAuthority
        );
        require!(
            ctx.accounts.rlya_mint.freeze_authority.is_none(),
            SaleError::FreezeAuthorityStillActive
        );

        let sale = &mut ctx.accounts.sale;
        sale.admin = ctx.accounts.admin.key();
        sale.treasury = ctx.accounts.treasury.key();
        sale.founder = ctx.accounts.founder.key();
        sale.rlya_mint = ctx.accounts.rlya_mint.key();
        sale.usdc_mint = ctx.accounts.usdc_mint.key();
        sale.presale_cap = PRESALE_CAP;
        sale.base_price_micro_usdc = BASE_PRICE_MICRO_USDC;
        sale.step_size_base_units = STEP_SIZE_BASE_UNITS;
        sale.step_increment_micro_usdc = STEP_INCREMENT_MICRO_USDC;
        sale.referral_bps = REFERRAL_BPS;
        sale.total_sold = 0;
        sale.manual_sold = 0;
        sale.total_usdc_raised = 0;
        sale.total_referral_usdc_paid = 0;
        sale.started_at = 0;
        sale.public_launch_at = 0;
        sale.status = SaleStatus::Draft as u8;
        sale.bump = ctx.bumps.sale;

        let lock = &mut ctx.accounts.founder_lock;
        lock.founder = ctx.accounts.founder.key();
        lock.rlya_mint = ctx.accounts.rlya_mint.key();
        lock.amount = FOUNDER_AMOUNT;
        lock.unlock_at = 0;
        lock.released = false;
        lock.bump = ctx.bumps.founder_lock;

        emit!(SaleInitialized {
            sale: sale.key(),
            rlya_mint: sale.rlya_mint,
            presale_cap: PRESALE_CAP,
            staking_bonus_reserve: STAKING_BONUS_RESERVE,
            founder_amount: FOUNDER_AMOUNT,
            base_price_micro_usdc: BASE_PRICE_MICRO_USDC,
            step_size_base_units: STEP_SIZE_BASE_UNITS,
            step_increment_micro_usdc: STEP_INCREMENT_MICRO_USDC,
            referral_bps: REFERRAL_BPS,
            staking_bonus_bps: STAKING_BONUS_BPS,
        });
        Ok(())
    }

    /// Activates the production sale state only after the complete 839M supply
    /// exists, authorities are gone, and all protocol-controlled launch vaults
    /// hold their exact reviewed allocations. Activation is not public launch.
    pub fn activate(ctx: Context<Activate>) -> Result<()> {
        let sale = &mut ctx.accounts.sale;
        require!(
            sale.status == SaleStatus::Draft as u8,
            SaleError::InvalidState
        );
        require!(
            ctx.accounts.rlya_mint.supply == HARD_CAP,
            SaleError::HardCapMismatch
        );
        require!(
            ctx.accounts.rlya_mint.mint_authority.is_none(),
            SaleError::MintAuthorityStillActive
        );
        require!(
            ctx.accounts.rlya_mint.freeze_authority.is_none(),
            SaleError::FreezeAuthorityStillActive
        );
        require!(
            ctx.accounts.sale_vault.amount == PRESALE_CAP,
            SaleError::SaleVaultFundingMismatch
        );
        require!(
            ctx.accounts.staking_bonus_vault.amount == STAKING_BONUS_RESERVE,
            SaleError::StakingBonusVaultFundingMismatch
        );
        require!(
            ctx.accounts.founder_vault.amount == FOUNDER_AMOUNT,
            SaleError::FounderVaultFundingMismatch
        );

        let now = Clock::get()?.unix_timestamp;
        if sale.started_at == 0 {
            sale.started_at = now;
        }
        sale.status = SaleStatus::Active as u8;
        emit!(SaleStatusChanged {
            status: sale.status,
            timestamp: now,
        });
        Ok(())
    }

    /// Marks the deliberate public token launch once. Presale buyer release clocks
    /// and the founder one-year lock both begin from this public launch timestamp.
    pub fn mark_public_launch(ctx: Context<MarkPublicLaunch>) -> Result<()> {
        require!(
            ctx.accounts.sale.status == SaleStatus::Active as u8
                || ctx.accounts.sale.status == SaleStatus::Paused as u8,
            SaleError::InvalidState
        );
        require!(
            ctx.accounts.sale.public_launch_at == 0,
            SaleError::PublicLaunchAlreadyMarked
        );
        require!(
            ctx.accounts.founder_lock.unlock_at == 0 && !ctx.accounts.founder_lock.released,
            SaleError::FounderAlreadyReleased
        );
        let now = Clock::get()?.unix_timestamp;
        let founder_unlock_at = now
            .checked_add(FOUNDER_LOCK_SECONDS)
            .ok_or(SaleError::MathOverflow)?;
        ctx.accounts.sale.public_launch_at = now;
        ctx.accounts.founder_lock.unlock_at = founder_unlock_at;
        emit!(PublicLaunchMarked {
            timestamp: now,
            founder_unlock_at,
            standard_presale_release_at: now
                .checked_add(STANDARD_PRESALE_RELEASE_SECONDS)
                .ok_or(SaleError::MathOverflow)?,
            staked_presale_release_at: now
                .checked_add(STAKED_PRESALE_RELEASE_SECONDS)
                .ok_or(SaleError::MathOverflow)?,
        });
        Ok(())
    }

    pub fn pause(ctx: Context<AdminSale>) -> Result<()> {
        require!(
            ctx.accounts.sale.status == SaleStatus::Active as u8,
            SaleError::InvalidState
        );
        ctx.accounts.sale.status = SaleStatus::Paused as u8;
        emit!(SaleStatusChanged {
            status: ctx.accounts.sale.status,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn resume(ctx: Context<AdminSale>) -> Result<()> {
        require!(
            ctx.accounts.sale.status == SaleStatus::Paused as u8,
            SaleError::InvalidState
        );
        ctx.accounts.sale.status = SaleStatus::Active as u8;
        emit!(SaleStatusChanged {
            status: ctx.accounts.sale.status,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Permanently attributes a buyer wallet to its first referrer. A buyer cannot
    /// later bypass or change that attribution, and direct two-wallet loops fail.
    pub fn register_referral(ctx: Context<RegisterReferral>) -> Result<()> {
        require!(
            ctx.accounts.buyer.key() != ctx.accounts.referrer.key(),
            SaleError::SelfReferral
        );

        if ctx.accounts.referrer_attribution.to_account_info().owner == ctx.program_id {
            let data = ctx.accounts.referrer_attribution.try_borrow_data()?;
            let mut slice: &[u8] = &data;
            let existing = ReferralAttribution::try_deserialize(&mut slice)?;
            require!(
                existing.referrer != ctx.accounts.buyer.key(),
                SaleError::CircularReferral
            );
        }

        let attribution = &mut ctx.accounts.referral_attribution;
        attribution.buyer = ctx.accounts.buyer.key();
        attribution.referrer = ctx.accounts.referrer.key();
        attribution.bump = ctx.bumps.referral_attribution;
        emit!(ReferralRegistered {
            buyer: attribution.buyer,
            referrer: attribution.referrer,
        });
        Ok(())
    }

    /// Post-launch direct atomic purchase. This path is deliberately unavailable
    /// before `mark_public_launch` because it transfers RLYA immediately.
    pub fn buy(ctx: Context<Buy>, usdc_amount: u64, min_rlya_out: u64) -> Result<()> {
        require!(
            ctx.accounts.sale.status == SaleStatus::Active as u8,
            SaleError::InvalidState
        );
        require!(ctx.accounts.sale.public_launch_at > 0, SaleError::PublicLaunchNotMarked);
        require!(usdc_amount >= MIN_PURCHASE_USDC, SaleError::PurchaseTooSmall);
        require!(
            ctx.accounts.referral_attribution.to_account_info().owner != ctx.program_id,
            SaleError::ReferralRequired
        );

        let price_before = current_price(&ctx.accounts.sale)?;
        let allocation = quote_allocation(&ctx.accounts.sale, usdc_amount)?;
        require!(allocation > 0, SaleError::PurchaseTooSmall);
        require!(allocation >= min_rlya_out, SaleError::SlippageExceeded);
        let new_total = ctx
            .accounts
            .sale
            .total_sold
            .checked_add(allocation)
            .ok_or(SaleError::MathOverflow)?;
        require!(new_total <= ctx.accounts.sale.presale_cap, SaleError::PresaleSoldOut);
        require!(ctx.accounts.sale_vault.amount >= allocation, SaleError::SaleVaultUnderfunded);

        transfer_checked(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.buyer_usdc_account.to_account_info(),
            ctx.accounts.usdc_mint.to_account_info(),
            ctx.accounts.treasury_usdc_account.to_account_info(),
            ctx.accounts.buyer.to_account_info(),
            usdc_amount,
            USDC_DECIMALS,
            None,
        )?;

        let mint_key = ctx.accounts.rlya_mint.key();
        let bump = [ctx.accounts.sale.bump];
        let seeds: &[&[u8]] = &[SALE_SEED, mint_key.as_ref(), &bump];
        transfer_checked(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.sale_vault.to_account_info(),
            ctx.accounts.rlya_mint.to_account_info(),
            ctx.accounts.buyer_rlya_account.to_account_info(),
            ctx.accounts.sale.to_account_info(),
            allocation,
            RLYA_DECIMALS,
            Some(&[seeds]),
        )?;

        let sale = &mut ctx.accounts.sale;
        sale.total_sold = new_total;
        sale.total_usdc_raised = sale
            .total_usdc_raised
            .checked_add(usdc_amount)
            .ok_or(SaleError::MathOverflow)?;
        let price_after = current_price(sale)?;
        emit!(PurchaseCompleted {
            buyer: ctx.accounts.buyer.key(),
            usdc_amount,
            rlya_amount: allocation,
            total_sold: sale.total_sold,
            price_before_micro_usdc: price_before,
            price_after_micro_usdc: price_after,
        });
        Ok(())
    }

    /// Post-launch referred atomic purchase. Buyer allocation is unchanged by the
    /// referral; fixed 1% gross USDC goes to the locked referrer.
    pub fn buy_with_referral(
        ctx: Context<BuyWithReferral>,
        usdc_amount: u64,
        min_rlya_out: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.sale.status == SaleStatus::Active as u8,
            SaleError::InvalidState
        );
        require!(ctx.accounts.sale.public_launch_at > 0, SaleError::PublicLaunchNotMarked);
        require!(usdc_amount >= MIN_PURCHASE_USDC, SaleError::PurchaseTooSmall);
        require!(ctx.accounts.buyer.key() != ctx.accounts.referrer.key(), SaleError::SelfReferral);
        require!(ctx.accounts.sale.referral_bps == REFERRAL_BPS, SaleError::InvalidReferralRate);

        let price_before = current_price(&ctx.accounts.sale)?;
        let allocation = quote_allocation(&ctx.accounts.sale, usdc_amount)?;
        require!(allocation > 0, SaleError::PurchaseTooSmall);
        require!(allocation >= min_rlya_out, SaleError::SlippageExceeded);
        let new_total = ctx
            .accounts
            .sale
            .total_sold
            .checked_add(allocation)
            .ok_or(SaleError::MathOverflow)?;
        require!(new_total <= ctx.accounts.sale.presale_cap, SaleError::PresaleSoldOut);
        require!(ctx.accounts.sale_vault.amount >= allocation, SaleError::SaleVaultUnderfunded);

        let referral_reward_u128 = (usdc_amount as u128)
            .checked_mul(REFERRAL_BPS as u128)
            .ok_or(SaleError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(SaleError::MathOverflow)?;
        let referral_reward =
            u64::try_from(referral_reward_u128).map_err(|_| error!(SaleError::MathOverflow))?;
        require!(
            referral_reward > 0 && referral_reward < usdc_amount,
            SaleError::InvalidReferralReward
        );
        let treasury_amount = usdc_amount
            .checked_sub(referral_reward)
            .ok_or(SaleError::MathOverflow)?;

        transfer_checked(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.buyer_usdc_account.to_account_info(),
            ctx.accounts.usdc_mint.to_account_info(),
            ctx.accounts.treasury_usdc_account.to_account_info(),
            ctx.accounts.buyer.to_account_info(),
            treasury_amount,
            USDC_DECIMALS,
            None,
        )?;
        transfer_checked(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.buyer_usdc_account.to_account_info(),
            ctx.accounts.usdc_mint.to_account_info(),
            ctx.accounts.referrer_usdc_account.to_account_info(),
            ctx.accounts.buyer.to_account_info(),
            referral_reward,
            USDC_DECIMALS,
            None,
        )?;

        let mint_key = ctx.accounts.rlya_mint.key();
        let bump = [ctx.accounts.sale.bump];
        let seeds: &[&[u8]] = &[SALE_SEED, mint_key.as_ref(), &bump];
        transfer_checked(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.sale_vault.to_account_info(),
            ctx.accounts.rlya_mint.to_account_info(),
            ctx.accounts.buyer_rlya_account.to_account_info(),
            ctx.accounts.sale.to_account_info(),
            allocation,
            RLYA_DECIMALS,
            Some(&[seeds]),
        )?;

        let sale = &mut ctx.accounts.sale;
        sale.total_sold = new_total;
        sale.total_usdc_raised = sale
            .total_usdc_raised
            .checked_add(usdc_amount)
            .ok_or(SaleError::MathOverflow)?;
        sale.total_referral_usdc_paid = sale
            .total_referral_usdc_paid
            .checked_add(referral_reward)
            .ok_or(SaleError::MathOverflow)?;
        let price_after = current_price(sale)?;
        emit!(ReferralPurchaseCompleted {
            buyer: ctx.accounts.buyer.key(),
            referrer: ctx.accounts.referrer.key(),
            usdc_amount,
            referral_usdc_amount: referral_reward,
            rlya_amount: allocation,
            total_sold: sale.total_sold,
            price_before_micro_usdc: price_before,
            price_after_micro_usdc: price_after,
        });
        Ok(())
    }

    /// Owner-only immediate distribution for legitimate off-site activity after
    /// public launch. Pre-launch off-site allocations use `deliver_prelaunch_manual`.
    pub fn manual_sale(ctx: Context<ManualSale>, rlya_amount: u64) -> Result<()> {
        require!(
            ctx.accounts.sale.status == SaleStatus::Active as u8
                || ctx.accounts.sale.status == SaleStatus::Paused as u8,
            SaleError::InvalidState
        );
        require!(ctx.accounts.sale.public_launch_at > 0, SaleError::PublicLaunchNotMarked);
        require!(rlya_amount > 0, SaleError::InvalidAmount);
        let price_before = current_price(&ctx.accounts.sale)?;
        let new_total = ctx
            .accounts
            .sale
            .total_sold
            .checked_add(rlya_amount)
            .ok_or(SaleError::MathOverflow)?;
        require!(new_total <= ctx.accounts.sale.presale_cap, SaleError::PresaleSoldOut);
        require!(ctx.accounts.sale_vault.amount >= rlya_amount, SaleError::SaleVaultUnderfunded);

        let mint_key = ctx.accounts.rlya_mint.key();
        let bump = [ctx.accounts.sale.bump];
        let seeds: &[&[u8]] = &[SALE_SEED, mint_key.as_ref(), &bump];
        transfer_checked(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.sale_vault.to_account_info(),
            ctx.accounts.rlya_mint.to_account_info(),
            ctx.accounts.recipient_rlya_account.to_account_info(),
            ctx.accounts.sale.to_account_info(),
            rlya_amount,
            RLYA_DECIMALS,
            Some(&[seeds]),
        )?;

        let sale = &mut ctx.accounts.sale;
        sale.total_sold = new_total;
        sale.manual_sold = sale
            .manual_sold
            .checked_add(rlya_amount)
            .ok_or(SaleError::MathOverflow)?;
        let price_after = current_price(sale)?;
        emit!(ManualSaleRecorded {
            recipient: ctx.accounts.recipient.key(),
            rlya_amount,
            total_sold: sale.total_sold,
            price_before_micro_usdc: price_before,
            price_after_micro_usdc: price_after,
        });
        Ok(())
    }

    /// Commits the final hashed pre-launch manifest and exact expected totals.
    pub fn initialize_prelaunch_metrics(
        ctx: Context<InitializePrelaunchMetrics>,
        manifest_sha256: [u8; 32],
        expected_web_rlya: u64,
        expected_manual_rlya: u64,
        expected_staking_bonus: u64,
        expected_gross_usdc: u64,
        expected_referral_usdc: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.sale.status == SaleStatus::Draft as u8
                || ctx.accounts.sale.status == SaleStatus::Paused as u8,
            SaleError::InvalidState
        );
        let expected_total = expected_web_rlya
            .checked_add(expected_manual_rlya)
            .ok_or(SaleError::MathOverflow)?;
        require!(
            expected_total <= ctx.accounts.sale.presale_cap,
            SaleError::PrelaunchCommitmentMismatch
        );
        require!(
            expected_staking_bonus <= STAKING_BONUS_RESERVE,
            SaleError::StakingBonusCommitmentMismatch
        );
        require!(
            expected_referral_usdc <= expected_gross_usdc,
            SaleError::PrelaunchCommitmentMismatch
        );
        let metrics = &mut ctx.accounts.prelaunch_metrics;
        metrics.rlya_mint = ctx.accounts.rlya_mint.key();
        metrics.manifest_sha256 = manifest_sha256;
        metrics.expected_web_rlya = expected_web_rlya;
        metrics.expected_manual_rlya = expected_manual_rlya;
        metrics.expected_staking_bonus = expected_staking_bonus;
        metrics.expected_gross_usdc = expected_gross_usdc;
        metrics.expected_referral_usdc = expected_referral_usdc;
        metrics.web_rlya_delivered = 0;
        metrics.manual_rlya_delivered = 0;
        metrics.staking_bonus_delivered = 0;
        metrics.gross_usdc_imported = 0;
        metrics.referral_usdc_imported = 0;
        metrics.bump = ctx.bumps.prelaunch_metrics;
        emit!(PrelaunchMetricsInitialized {
            account: metrics.key(),
            rlya_mint: metrics.rlya_mint,
            manifest_sha256,
            expected_web_rlya,
            expected_manual_rlya,
            expected_staking_bonus,
            expected_gross_usdc,
            expected_referral_usdc,
        });
        Ok(())
    }

    /// Imports referral attribution locked by the verified pre-launch USDC ledger.
    pub fn import_prelaunch_referral(ctx: Context<ImportPrelaunchReferral>) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Paused as u8, SaleError::InvalidState);
        require!(ctx.accounts.buyer.key() != ctx.accounts.referrer.key(), SaleError::SelfReferral);

        if ctx.accounts.referrer_attribution.to_account_info().owner == ctx.program_id {
            let data = ctx.accounts.referrer_attribution.try_borrow_data()?;
            let mut slice: &[u8] = &data;
            let existing = ReferralAttribution::try_deserialize(&mut slice)?;
            require!(existing.referrer != ctx.accounts.buyer.key(), SaleError::CircularReferral);
        }

        let attribution = &mut ctx.accounts.referral_attribution;
        attribution.buyer = ctx.accounts.buyer.key();
        attribution.referrer = ctx.accounts.referrer.key();
        attribution.bump = ctx.bumps.referral_attribution;
        emit!(ReferralRegistered {
            buyer: attribution.buyer,
            referrer: attribution.referrer,
        });
        Ok(())
    }

    /// Delivers one wallet's aggregated website presale allocation after its
    /// public-launch release window. Base RLYA comes from the 288M sale vault.
    /// A staked wallet receives an exact fixed 5% bonus from the separate 14.4M
    /// program vault. Bonus RLYA never advances the base sale price curve.
    pub fn deliver_prelaunch(
        ctx: Context<DeliverPrelaunch>,
        rlya_amount: u64,
        gross_usdc_amount: u64,
        referral_usdc_amount: u64,
        staked: bool,
    ) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Paused as u8, SaleError::InvalidState);
        require!(rlya_amount > 0, SaleError::InvalidAmount);
        require!(gross_usdc_amount >= MIN_PURCHASE_USDC, SaleError::PurchaseTooSmall);
        require!(referral_usdc_amount <= gross_usdc_amount, SaleError::InvalidReferralReward);

        let release_delay = if staked {
            STAKED_PRESALE_RELEASE_SECONDS
        } else {
            STANDARD_PRESALE_RELEASE_SECONDS
        };
        require_release_elapsed(&ctx.accounts.sale, release_delay)?;

        let staking_bonus_amount = if staked {
            staking_bonus_for(rlya_amount)?
        } else {
            0
        };

        let next_web_rlya = ctx
            .accounts
            .prelaunch_metrics
            .web_rlya_delivered
            .checked_add(rlya_amount)
            .ok_or(SaleError::MathOverflow)?;
        let next_staking_bonus = ctx
            .accounts
            .prelaunch_metrics
            .staking_bonus_delivered
            .checked_add(staking_bonus_amount)
            .ok_or(SaleError::MathOverflow)?;
        let next_gross_usdc = ctx
            .accounts
            .prelaunch_metrics
            .gross_usdc_imported
            .checked_add(gross_usdc_amount)
            .ok_or(SaleError::MathOverflow)?;
        let next_referral_usdc = ctx
            .accounts
            .prelaunch_metrics
            .referral_usdc_imported
            .checked_add(referral_usdc_amount)
            .ok_or(SaleError::MathOverflow)?;

        require!(
            next_web_rlya <= ctx.accounts.prelaunch_metrics.expected_web_rlya,
            SaleError::PrelaunchCommitmentMismatch
        );
        require!(
            next_staking_bonus <= ctx.accounts.prelaunch_metrics.expected_staking_bonus,
            SaleError::StakingBonusCommitmentMismatch
        );
        require!(
            next_gross_usdc <= ctx.accounts.prelaunch_metrics.expected_gross_usdc,
            SaleError::PrelaunchCommitmentMismatch
        );
        require!(
            next_referral_usdc <= ctx.accounts.prelaunch_metrics.expected_referral_usdc,
            SaleError::PrelaunchCommitmentMismatch
        );

        let price_before = current_price(&ctx.accounts.sale)?;
        let new_total = ctx
            .accounts
            .sale
            .total_sold
            .checked_add(rlya_amount)
            .ok_or(SaleError::MathOverflow)?;
        require!(new_total <= ctx.accounts.sale.presale_cap, SaleError::PresaleSoldOut);
        require!(ctx.accounts.sale_vault.amount >= rlya_amount, SaleError::SaleVaultUnderfunded);
        require!(
            ctx.accounts.staking_bonus_vault.amount >= staking_bonus_amount,
            SaleError::StakingBonusVaultUnderfunded
        );

        let mint_key = ctx.accounts.rlya_mint.key();
        let bump = [ctx.accounts.sale.bump];
        let seeds: &[&[u8]] = &[SALE_SEED, mint_key.as_ref(), &bump];
        transfer_checked(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.sale_vault.to_account_info(),
            ctx.accounts.rlya_mint.to_account_info(),
            ctx.accounts.recipient_rlya_account.to_account_info(),
            ctx.accounts.sale.to_account_info(),
            rlya_amount,
            RLYA_DECIMALS,
            Some(&[seeds]),
        )?;
        if staking_bonus_amount > 0 {
            transfer_checked(
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.staking_bonus_vault.to_account_info(),
                ctx.accounts.rlya_mint.to_account_info(),
                ctx.accounts.recipient_rlya_account.to_account_info(),
                ctx.accounts.sale.to_account_info(),
                staking_bonus_amount,
                RLYA_DECIMALS,
                Some(&[seeds]),
            )?;
        }

        let sale = &mut ctx.accounts.sale;
        sale.total_sold = new_total;
        sale.total_usdc_raised = sale
            .total_usdc_raised
            .checked_add(gross_usdc_amount)
            .ok_or(SaleError::MathOverflow)?;
        sale.total_referral_usdc_paid = sale
            .total_referral_usdc_paid
            .checked_add(referral_usdc_amount)
            .ok_or(SaleError::MathOverflow)?;

        let metrics = &mut ctx.accounts.prelaunch_metrics;
        metrics.web_rlya_delivered = next_web_rlya;
        metrics.staking_bonus_delivered = next_staking_bonus;
        metrics.gross_usdc_imported = next_gross_usdc;
        metrics.referral_usdc_imported = next_referral_usdc;

        let receipt = &mut ctx.accounts.delivery_receipt;
        receipt.recipient = ctx.accounts.recipient.key();
        receipt.rlya_amount = rlya_amount;
        receipt.staking_bonus_amount = staking_bonus_amount;
        receipt.gross_usdc_amount = gross_usdc_amount;
        receipt.referral_usdc_amount = referral_usdc_amount;
        receipt.delivered_at = Clock::get()?.unix_timestamp;
        receipt.staked = staked;
        receipt.bump = ctx.bumps.delivery_receipt;

        let price_after = current_price(sale)?;
        emit!(PrelaunchDelivered {
            recipient: ctx.accounts.recipient.key(),
            rlya_amount,
            staking_bonus_amount,
            staked,
            gross_usdc_amount,
            referral_usdc_amount,
            total_sold: sale.total_sold,
            web_rlya_delivered: metrics.web_rlya_delivered,
            staking_bonus_delivered: metrics.staking_bonus_delivered,
            price_before_micro_usdc: price_before,
            price_after_micro_usdc: price_after,
        });
        Ok(())
    }

    /// Delivers a genuine private/off-site pre-launch base allocation on the
    /// standard day-21 schedule. Private/off-site allocations receive no 5% bonus.
    pub fn deliver_prelaunch_manual(
        ctx: Context<DeliverPrelaunchManual>,
        rlya_amount: u64,
    ) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Paused as u8, SaleError::InvalidState);
        require!(rlya_amount > 0, SaleError::InvalidAmount);
        require_release_elapsed(&ctx.accounts.sale, STANDARD_PRESALE_RELEASE_SECONDS)?;

        let price_before = current_price(&ctx.accounts.sale)?;
        let new_total = ctx
            .accounts
            .sale
            .total_sold
            .checked_add(rlya_amount)
            .ok_or(SaleError::MathOverflow)?;
        require!(new_total <= ctx.accounts.sale.presale_cap, SaleError::PresaleSoldOut);
        require!(ctx.accounts.sale_vault.amount >= rlya_amount, SaleError::SaleVaultUnderfunded);
        let next_manual_rlya = ctx
            .accounts
            .prelaunch_metrics
            .manual_rlya_delivered
            .checked_add(rlya_amount)
            .ok_or(SaleError::MathOverflow)?;
        require!(
            next_manual_rlya <= ctx.accounts.prelaunch_metrics.expected_manual_rlya,
            SaleError::PrelaunchCommitmentMismatch
        );

        let mint_key = ctx.accounts.rlya_mint.key();
        let bump = [ctx.accounts.sale.bump];
        let seeds: &[&[u8]] = &[SALE_SEED, mint_key.as_ref(), &bump];
        transfer_checked(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.sale_vault.to_account_info(),
            ctx.accounts.rlya_mint.to_account_info(),
            ctx.accounts.recipient_rlya_account.to_account_info(),
            ctx.accounts.sale.to_account_info(),
            rlya_amount,
            RLYA_DECIMALS,
            Some(&[seeds]),
        )?;

        let sale = &mut ctx.accounts.sale;
        sale.total_sold = new_total;
        sale.manual_sold = sale
            .manual_sold
            .checked_add(rlya_amount)
            .ok_or(SaleError::MathOverflow)?;
        ctx.accounts.prelaunch_metrics.manual_rlya_delivered = next_manual_rlya;

        let receipt = &mut ctx.accounts.delivery_receipt;
        receipt.recipient = ctx.accounts.recipient.key();
        receipt.rlya_amount = rlya_amount;
        receipt.staking_bonus_amount = 0;
        receipt.gross_usdc_amount = 0;
        receipt.referral_usdc_amount = 0;
        receipt.delivered_at = Clock::get()?.unix_timestamp;
        receipt.staked = false;
        receipt.bump = ctx.bumps.delivery_receipt;

        let price_after = current_price(sale)?;
        emit!(ManualSaleRecorded {
            recipient: ctx.accounts.recipient.key(),
            rlya_amount,
            total_sold: sale.total_sold,
            price_before_micro_usdc: price_before,
            price_after_micro_usdc: price_after,
        });
        Ok(())
    }

    pub fn close_sale(ctx: Context<AdminSale>) -> Result<()> {
        require!(
            ctx.accounts.sale.status == SaleStatus::Active as u8
                || ctx.accounts.sale.status == SaleStatus::Paused as u8,
            SaleError::InvalidState
        );
        ctx.accounts.sale.status = SaleStatus::Closed as u8;
        emit!(SaleStatusChanged {
            status: ctx.accounts.sale.status,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// After permanent sale close, returns unallocated base-sale inventory and any
    /// unused staking-bonus reserve to the configured treasury RLYA account.
    pub fn withdraw_unsold(ctx: Context<WithdrawUnsold>) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Closed as u8, SaleError::InvalidState);
        let base_amount = ctx.accounts.sale_vault.amount;
        let staking_bonus_amount = ctx.accounts.staking_bonus_vault.amount;
        if base_amount == 0 && staking_bonus_amount == 0 {
            return Ok(());
        }
        let mint_key = ctx.accounts.rlya_mint.key();
        let bump = [ctx.accounts.sale.bump];
        let seeds: &[&[u8]] = &[SALE_SEED, mint_key.as_ref(), &bump];
        if base_amount > 0 {
            transfer_checked(
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.sale_vault.to_account_info(),
                ctx.accounts.rlya_mint.to_account_info(),
                ctx.accounts.treasury_rlya_account.to_account_info(),
                ctx.accounts.sale.to_account_info(),
                base_amount,
                RLYA_DECIMALS,
                Some(&[seeds]),
            )?;
        }
        if staking_bonus_amount > 0 {
            transfer_checked(
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.staking_bonus_vault.to_account_info(),
                ctx.accounts.rlya_mint.to_account_info(),
                ctx.accounts.treasury_rlya_account.to_account_info(),
                ctx.accounts.sale.to_account_info(),
                staking_bonus_amount,
                RLYA_DECIMALS,
                Some(&[seeds]),
            )?;
        }
        emit!(UnsoldWithdrawn {
            base_amount,
            staking_bonus_amount,
        });
        Ok(())
    }

    pub fn release_founder(ctx: Context<ReleaseFounder>) -> Result<()> {
        require!(
            !ctx.accounts.founder_lock.released,
            SaleError::FounderAlreadyReleased
        );
        let now = Clock::get()?.unix_timestamp;
        require!(
            ctx.accounts.founder_lock.unlock_at > 0 && now >= ctx.accounts.founder_lock.unlock_at,
            SaleError::FounderStillLocked
        );
        require!(
            ctx.accounts.founder_vault.amount >= FOUNDER_AMOUNT,
            SaleError::FounderVaultFundingMismatch
        );

        let mint_key = ctx.accounts.rlya_mint.key();
        let bump = [ctx.accounts.founder_lock.bump];
        let seeds: &[&[u8]] = &[FOUNDER_LOCK_SEED, mint_key.as_ref(), &bump];
        transfer_checked(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.founder_vault.to_account_info(),
            ctx.accounts.rlya_mint.to_account_info(),
            ctx.accounts.founder_rlya_account.to_account_info(),
            ctx.accounts.founder_lock.to_account_info(),
            FOUNDER_AMOUNT,
            RLYA_DECIMALS,
            Some(&[seeds]),
        )?;
        ctx.accounts.founder_lock.released = true;
        emit!(FounderReleased {
            founder: ctx.accounts.founder.key(),
            amount: FOUNDER_AMOUNT,
            timestamp: now,
        });
        Ok(())
    }
}

fn current_price(sale: &Sale) -> Result<u64> {
    let step = sale
        .total_sold
        .checked_div(sale.step_size_base_units)
        .ok_or(SaleError::InvalidStep)?;
    let increase = step
        .checked_mul(sale.step_increment_micro_usdc)
        .ok_or(SaleError::MathOverflow)?;
    sale.base_price_micro_usdc
        .checked_add(increase)
        .ok_or(error!(SaleError::MathOverflow))
}

fn staking_bonus_for(rlya_amount: u64) -> Result<u64> {
    let value = (rlya_amount as u128)
        .checked_mul(STAKING_BONUS_BPS as u128)
        .ok_or(SaleError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(SaleError::MathOverflow)?;
    u64::try_from(value).map_err(|_| error!(SaleError::MathOverflow))
}

fn require_release_elapsed(sale: &Sale, delay_seconds: i64) -> Result<i64> {
    require!(sale.public_launch_at > 0, SaleError::PublicLaunchNotMarked);
    let release_at = sale
        .public_launch_at
        .checked_add(delay_seconds)
        .ok_or(SaleError::MathOverflow)?;
    let now = Clock::get()?.unix_timestamp;
    require!(now >= release_at, SaleError::PresaleReleaseStillLocked);
    Ok(now)
}

/// Piecewise-linear stepped curve. Large purchases may cross multiple price
/// steps; each portion is priced at the step it consumes.
fn quote_allocation(sale: &Sale, usdc_amount: u64) -> Result<u64> {
    let mut remaining_usdc = usdc_amount as u128;
    let mut progress = sale.total_sold as u128;
    let cap = sale.presale_cap as u128;
    let step_size = sale.step_size_base_units as u128;
    let base = sale.base_price_micro_usdc as u128;
    let increment = sale.step_increment_micro_usdc as u128;
    let mut allocation: u128 = 0;
    let mut loops: u16 = 0;

    while remaining_usdc > 0 {
        require!(progress < cap, SaleError::PresaleSoldOut);
        loops = loops.checked_add(1).ok_or(SaleError::MathOverflow)?;
        require!(loops <= 512, SaleError::TooManyPriceSteps);

        let step_index = progress
            .checked_div(step_size)
            .ok_or(SaleError::InvalidStep)?;
        let price = base
            .checked_add(
                step_index
                    .checked_mul(increment)
                    .ok_or(SaleError::MathOverflow)?,
            )
            .ok_or(SaleError::MathOverflow)?;
        let next_boundary = ((step_index + 1)
            .checked_mul(step_size)
            .ok_or(SaleError::MathOverflow)?)
        .min(cap);
        let available = next_boundary
            .checked_sub(progress)
            .ok_or(SaleError::MathOverflow)?;
        let cost_to_fill = ceil_div(
            available
                .checked_mul(price)
                .ok_or(SaleError::MathOverflow)?,
            RLYA_UNIT,
        )?;

        if remaining_usdc >= cost_to_fill {
            allocation = allocation
                .checked_add(available)
                .ok_or(SaleError::MathOverflow)?;
            progress = progress
                .checked_add(available)
                .ok_or(SaleError::MathOverflow)?;
            remaining_usdc = remaining_usdc
                .checked_sub(cost_to_fill)
                .ok_or(SaleError::MathOverflow)?;
        } else {
            let part = remaining_usdc
                .checked_mul(RLYA_UNIT)
                .ok_or(SaleError::MathOverflow)?
                .checked_div(price)
                .ok_or(SaleError::InvalidPrice)?;
            require!(part > 0, SaleError::PurchaseTooSmall);
            require!(part <= available, SaleError::MathOverflow);
            allocation = allocation
                .checked_add(part)
                .ok_or(SaleError::MathOverflow)?;
            progress = progress.checked_add(part).ok_or(SaleError::MathOverflow)?;
            remaining_usdc = 0;
        }
    }

    require!(progress <= cap, SaleError::PresaleSoldOut);
    u64::try_from(allocation).map_err(|_| error!(SaleError::MathOverflow))
}

fn ceil_div(n: u128, d: u128) -> Result<u128> {
    require!(d > 0, SaleError::MathOverflow);
    Ok(n.checked_add(d - 1).ok_or(SaleError::MathOverflow)? / d)
}

fn transfer_checked<'info>(
    _token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer_seeds: Option<&[&[&[u8]]]>,
) -> Result<()> {
    let accounts = TransferChecked {
        from,
        mint,
        to,
        authority,
    };
    let cpi = CpiContext::new(Token::id(), accounts);
    match signer_seeds {
        Some(seeds) => token::transfer_checked(cpi.with_signer(seeds), amount, decimals),
        None => token::transfer_checked(cpi, amount, decimals),
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: stored treasury identity; token accounts are constrained later.
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: stored founder identity; founder release later requires this signer.
    pub founder: UncheckedAccount<'info>,
    pub rlya_mint: Account<'info, Mint>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = admin,
        space = Sale::SPACE,
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub sale: Account<'info, Sale>,
    #[account(
        init,
        payer = admin,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [SALE_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub sale_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = admin,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [STAKING_BONUS_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub staking_bonus_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = admin,
        space = FounderLock::SPACE,
        seeds = [FOUNDER_LOCK_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub founder_lock: Account<'info, FounderLock>,
    #[account(
        init,
        payer = admin,
        token::mint = rlya_mint,
        token::authority = founder_lock,
        seeds = [FOUNDER_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub founder_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Activate<'info> {
    pub admin: Signer<'info>,
    pub rlya_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = admin,
        has_one = rlya_mint
    )]
    pub sale: Account<'info, Sale>,
    #[account(
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [SALE_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub sale_vault: Account<'info, TokenAccount>,
    #[account(
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [STAKING_BONUS_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub staking_bonus_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [FOUNDER_LOCK_SEED, rlya_mint.key().as_ref()],
        bump = founder_lock.bump,
        has_one = rlya_mint
    )]
    pub founder_lock: Account<'info, FounderLock>,
    #[account(
        token::mint = rlya_mint,
        token::authority = founder_lock,
        seeds = [FOUNDER_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub founder_vault: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct MarkPublicLaunch<'info> {
    pub admin: Signer<'info>,
    pub rlya_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = admin,
        has_one = rlya_mint
    )]
    pub sale: Account<'info, Sale>,
    #[account(
        mut,
        seeds = [FOUNDER_LOCK_SEED, rlya_mint.key().as_ref()],
        bump = founder_lock.bump,
        has_one = rlya_mint
    )]
    pub founder_lock: Account<'info, FounderLock>,
}

#[derive(Accounts)]
pub struct AdminSale<'info> {
    pub admin: Signer<'info>,
    pub rlya_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = admin,
        has_one = rlya_mint
    )]
    pub sale: Account<'info, Sale>,
}

#[derive(Accounts)]
pub struct RegisterReferral<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: public referral beneficiary.
    pub referrer: UncheckedAccount<'info>,
    #[account(
        init,
        payer = buyer,
        space = ReferralAttribution::SPACE,
        seeds = [REFERRAL_SEED, buyer.key().as_ref()],
        bump
    )]
    pub referral_attribution: Account<'info, ReferralAttribution>,
    /// CHECK: deterministic referrer attribution PDA, inspected only if program-owned.
    #[account(seeds = [REFERRAL_SEED, referrer.key().as_ref()], bump)]
    pub referrer_attribution: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: buyer referral PDA; if program-owned, direct buying is blocked.
    #[account(seeds = [REFERRAL_SEED, buyer.key().as_ref()], bump)]
    pub referral_attribution: UncheckedAccount<'info>,
    pub rlya_mint: Box<Account<'info, Mint>>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = rlya_mint,
        has_one = usdc_mint,
        has_one = treasury
    )]
    pub sale: Box<Account<'info, Sale>>,
    /// CHECK: constrained by sale.has_one and treasury token-account owner.
    pub treasury: UncheckedAccount<'info>,
    #[account(mut, constraint = buyer_usdc_account.mint == usdc_mint.key(), constraint = buyer_usdc_account.owner == buyer.key())]
    pub buyer_usdc_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = treasury_usdc_account.mint == usdc_mint.key(), constraint = treasury_usdc_account.owner == treasury.key())]
    pub treasury_usdc_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = buyer_rlya_account.mint == rlya_mint.key(), constraint = buyer_rlya_account.owner == buyer.key())]
    pub buyer_rlya_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [SALE_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub sale_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BuyWithReferral<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: public referrer identity; token-account ownership is constrained.
    pub referrer: UncheckedAccount<'info>,
    #[account(
        seeds = [REFERRAL_SEED, buyer.key().as_ref()],
        bump = referral_attribution.bump,
        has_one = buyer,
        has_one = referrer
    )]
    pub referral_attribution: Box<Account<'info, ReferralAttribution>>,
    pub rlya_mint: Box<Account<'info, Mint>>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = rlya_mint,
        has_one = usdc_mint,
        has_one = treasury
    )]
    pub sale: Box<Account<'info, Sale>>,
    /// CHECK: constrained by sale.has_one and treasury token-account owner.
    pub treasury: UncheckedAccount<'info>,
    #[account(mut, constraint = buyer_usdc_account.mint == usdc_mint.key(), constraint = buyer_usdc_account.owner == buyer.key())]
    pub buyer_usdc_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = treasury_usdc_account.mint == usdc_mint.key(), constraint = treasury_usdc_account.owner == treasury.key())]
    pub treasury_usdc_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = referrer_usdc_account.mint == usdc_mint.key(), constraint = referrer_usdc_account.owner == referrer.key())]
    pub referrer_usdc_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = buyer_rlya_account.mint == rlya_mint.key(), constraint = buyer_rlya_account.owner == buyer.key())]
    pub buyer_rlya_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [SALE_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub sale_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ManualSale<'info> {
    pub admin: Signer<'info>,
    /// CHECK: owner of recipient RLYA token account.
    pub recipient: UncheckedAccount<'info>,
    pub rlya_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = admin,
        has_one = rlya_mint
    )]
    pub sale: Account<'info, Sale>,
    #[account(
        mut,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [SALE_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub sale_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = recipient_rlya_account.mint == rlya_mint.key(), constraint = recipient_rlya_account.owner == recipient.key())]
    pub recipient_rlya_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializePrelaunchMetrics<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub rlya_mint: Account<'info, Mint>,
    #[account(
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = admin,
        has_one = rlya_mint
    )]
    pub sale: Account<'info, Sale>,
    #[account(
        init,
        payer = admin,
        space = PrelaunchMetrics::SPACE,
        seeds = [PRELAUNCH_METRICS_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub prelaunch_metrics: Account<'info, PrelaunchMetrics>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ImportPrelaunchReferral<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: pre-launch buyer identity from final delivery manifest.
    pub buyer: UncheckedAccount<'info>,
    /// CHECK: locked pre-launch referral beneficiary.
    pub referrer: UncheckedAccount<'info>,
    pub rlya_mint: Account<'info, Mint>,
    #[account(
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = admin,
        has_one = rlya_mint
    )]
    pub sale: Account<'info, Sale>,
    #[account(
        init,
        payer = admin,
        space = ReferralAttribution::SPACE,
        seeds = [REFERRAL_SEED, buyer.key().as_ref()],
        bump
    )]
    pub referral_attribution: Account<'info, ReferralAttribution>,
    /// CHECK: deterministic attribution for referrer; inspected if program-owned.
    #[account(seeds = [REFERRAL_SEED, referrer.key().as_ref()], bump)]
    pub referrer_attribution: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeliverPrelaunch<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: owner of destination RLYA token account.
    pub recipient: UncheckedAccount<'info>,
    pub rlya_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = admin,
        has_one = rlya_mint
    )]
    pub sale: Box<Account<'info, Sale>>,
    #[account(
        mut,
        seeds = [PRELAUNCH_METRICS_SEED, rlya_mint.key().as_ref()],
        bump = prelaunch_metrics.bump,
        has_one = rlya_mint
    )]
    pub prelaunch_metrics: Box<Account<'info, PrelaunchMetrics>>,
    #[account(
        mut,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [SALE_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub sale_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [STAKING_BONUS_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub staking_bonus_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = recipient_rlya_account.mint == rlya_mint.key(), constraint = recipient_rlya_account.owner == recipient.key())]
    pub recipient_rlya_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = admin,
        space = PrelaunchDeliveryReceipt::SPACE,
        seeds = [PRELAUNCH_DELIVERY_SEED, rlya_mint.key().as_ref(), recipient.key().as_ref()],
        bump
    )]
    pub delivery_receipt: Account<'info, PrelaunchDeliveryReceipt>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeliverPrelaunchManual<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: owner of destination RLYA token account.
    pub recipient: UncheckedAccount<'info>,
    pub rlya_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = admin,
        has_one = rlya_mint
    )]
    pub sale: Box<Account<'info, Sale>>,
    #[account(
        mut,
        seeds = [PRELAUNCH_METRICS_SEED, rlya_mint.key().as_ref()],
        bump = prelaunch_metrics.bump,
        has_one = rlya_mint
    )]
    pub prelaunch_metrics: Box<Account<'info, PrelaunchMetrics>>,
    #[account(
        mut,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [SALE_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub sale_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = recipient_rlya_account.mint == rlya_mint.key(), constraint = recipient_rlya_account.owner == recipient.key())]
    pub recipient_rlya_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = admin,
        space = PrelaunchDeliveryReceipt::SPACE,
        seeds = [PRELAUNCH_MANUAL_DELIVERY_SEED, rlya_mint.key().as_ref(), recipient.key().as_ref()],
        bump
    )]
    pub delivery_receipt: Account<'info, PrelaunchDeliveryReceipt>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawUnsold<'info> {
    pub admin: Signer<'info>,
    pub rlya_mint: Account<'info, Mint>,
    #[account(
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = admin,
        has_one = rlya_mint,
        has_one = treasury
    )]
    pub sale: Account<'info, Sale>,
    /// CHECK: owner constrained on treasury token account.
    pub treasury: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [SALE_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub sale_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [STAKING_BONUS_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub staking_bonus_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = treasury_rlya_account.mint == rlya_mint.key(), constraint = treasury_rlya_account.owner == treasury.key())]
    pub treasury_rlya_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReleaseFounder<'info> {
    #[account(mut)]
    pub founder: Signer<'info>,
    pub rlya_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [FOUNDER_LOCK_SEED, rlya_mint.key().as_ref()],
        bump = founder_lock.bump,
        has_one = founder,
        has_one = rlya_mint
    )]
    pub founder_lock: Account<'info, FounderLock>,
    #[account(
        mut,
        token::mint = rlya_mint,
        token::authority = founder_lock,
        seeds = [FOUNDER_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub founder_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = founder_rlya_account.mint == rlya_mint.key(), constraint = founder_rlya_account.owner == founder.key())]
    pub founder_rlya_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Sale {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub founder: Pubkey,
    pub rlya_mint: Pubkey,
    pub usdc_mint: Pubkey,
    pub presale_cap: u64,
    pub base_price_micro_usdc: u64,
    pub step_size_base_units: u64,
    pub step_increment_micro_usdc: u64,
    pub referral_bps: u64,
    pub total_sold: u64,
    pub manual_sold: u64,
    pub total_usdc_raised: u64,
    pub total_referral_usdc_paid: u64,
    pub started_at: i64,
    pub public_launch_at: i64,
    pub status: u8,
    pub bump: u8,
}
impl Sale {
    pub const SPACE: usize = 8 + (32 * 5) + (8 * 11) + 2 + 32;
}

#[account]
pub struct ReferralAttribution {
    pub buyer: Pubkey,
    pub referrer: Pubkey,
    pub bump: u8,
}
impl ReferralAttribution {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 16;
}

#[account]
pub struct PrelaunchMetrics {
    pub rlya_mint: Pubkey,
    pub manifest_sha256: [u8; 32],
    pub expected_web_rlya: u64,
    pub expected_manual_rlya: u64,
    pub expected_staking_bonus: u64,
    pub expected_gross_usdc: u64,
    pub expected_referral_usdc: u64,
    pub web_rlya_delivered: u64,
    pub manual_rlya_delivered: u64,
    pub staking_bonus_delivered: u64,
    pub gross_usdc_imported: u64,
    pub referral_usdc_imported: u64,
    pub bump: u8,
}
impl PrelaunchMetrics {
    pub const SPACE: usize = 8 + 32 + 32 + (8 * 10) + 1 + 16;
}

#[account]
pub struct PrelaunchDeliveryReceipt {
    pub recipient: Pubkey,
    pub rlya_amount: u64,
    pub staking_bonus_amount: u64,
    pub gross_usdc_amount: u64,
    pub referral_usdc_amount: u64,
    pub delivered_at: i64,
    pub staked: bool,
    pub bump: u8,
}
impl PrelaunchDeliveryReceipt {
    pub const SPACE: usize = 8 + 32 + (8 * 5) + 1 + 1 + 16;
}

#[account]
pub struct FounderLock {
    pub founder: Pubkey,
    pub rlya_mint: Pubkey,
    pub amount: u64,
    pub unlock_at: i64,
    pub released: bool,
    pub bump: u8,
}
impl FounderLock {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1 + 16;
}

#[repr(u8)]
pub enum SaleStatus {
    Draft = 0,
    Active = 1,
    Paused = 2,
    Closed = 3,
}

#[event]
pub struct SaleInitialized {
    pub sale: Pubkey,
    pub rlya_mint: Pubkey,
    pub presale_cap: u64,
    pub staking_bonus_reserve: u64,
    pub founder_amount: u64,
    pub base_price_micro_usdc: u64,
    pub step_size_base_units: u64,
    pub step_increment_micro_usdc: u64,
    pub referral_bps: u64,
    pub staking_bonus_bps: u64,
}
#[event]
pub struct SaleStatusChanged {
    pub status: u8,
    pub timestamp: i64,
}
#[event]
pub struct PublicLaunchMarked {
    pub timestamp: i64,
    pub founder_unlock_at: i64,
    pub standard_presale_release_at: i64,
    pub staked_presale_release_at: i64,
}
#[event]
pub struct ReferralRegistered {
    pub buyer: Pubkey,
    pub referrer: Pubkey,
}
#[event]
pub struct PurchaseCompleted {
    pub buyer: Pubkey,
    pub usdc_amount: u64,
    pub rlya_amount: u64,
    pub total_sold: u64,
    pub price_before_micro_usdc: u64,
    pub price_after_micro_usdc: u64,
}
#[event]
pub struct ReferralPurchaseCompleted {
    pub buyer: Pubkey,
    pub referrer: Pubkey,
    pub usdc_amount: u64,
    pub referral_usdc_amount: u64,
    pub rlya_amount: u64,
    pub total_sold: u64,
    pub price_before_micro_usdc: u64,
    pub price_after_micro_usdc: u64,
}
#[event]
pub struct ManualSaleRecorded {
    pub recipient: Pubkey,
    pub rlya_amount: u64,
    pub total_sold: u64,
    pub price_before_micro_usdc: u64,
    pub price_after_micro_usdc: u64,
}
#[event]
pub struct PrelaunchMetricsInitialized {
    pub account: Pubkey,
    pub rlya_mint: Pubkey,
    pub manifest_sha256: [u8; 32],
    pub expected_web_rlya: u64,
    pub expected_manual_rlya: u64,
    pub expected_staking_bonus: u64,
    pub expected_gross_usdc: u64,
    pub expected_referral_usdc: u64,
}
#[event]
pub struct PrelaunchDelivered {
    pub recipient: Pubkey,
    pub rlya_amount: u64,
    pub staking_bonus_amount: u64,
    pub staked: bool,
    pub gross_usdc_amount: u64,
    pub referral_usdc_amount: u64,
    pub total_sold: u64,
    pub web_rlya_delivered: u64,
    pub staking_bonus_delivered: u64,
    pub price_before_micro_usdc: u64,
    pub price_after_micro_usdc: u64,
}
#[event]
pub struct UnsoldWithdrawn {
    pub base_amount: u64,
    pub staking_bonus_amount: u64,
}
#[event]
pub struct FounderReleased {
    pub founder: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum SaleError {
    #[msg("wrong token decimals")]
    WrongDecimals,
    #[msg("only the current RLYA mint authority may initialize the sale")]
    InitializerIsNotMintAuthority,
    #[msg("invalid price")]
    InvalidPrice,
    #[msg("invalid price step")]
    InvalidStep,
    #[msg("invalid amount")]
    InvalidAmount,
    #[msg("math overflow")]
    MathOverflow,
    #[msg("invalid sale state")]
    InvalidState,
    #[msg("the RLYA mint supply does not equal the 839M hard cap")]
    HardCapMismatch,
    #[msg("mint authority must be permanently revoked before activation")]
    MintAuthorityStillActive,
    #[msg("freeze authority must be permanently revoked before activation")]
    FreezeAuthorityStillActive,
    #[msg("base presale vault is not funded with exactly 288M RLYA")]
    SaleVaultFundingMismatch,
    #[msg("staking bonus vault is not funded with exactly 14.4M RLYA")]
    StakingBonusVaultFundingMismatch,
    #[msg("founder vault is not funded with exactly 83.9M RLYA")]
    FounderVaultFundingMismatch,
    #[msg("purchase is below the 1 USDC minimum or too small for one RLYA base unit")]
    PurchaseTooSmall,
    #[msg("on-chain quote is below the buyer minimum; refresh price and retry")]
    SlippageExceeded,
    #[msg("presale base allocation is sold out")]
    PresaleSoldOut,
    #[msg("base presale vault is underfunded")]
    SaleVaultUnderfunded,
    #[msg("staking bonus vault is underfunded")]
    StakingBonusVaultUnderfunded,
    #[msg("purchase would cross too many pricing steps")]
    TooManyPriceSteps,
    #[msg("public RLYA launch has not been marked on-chain")]
    PublicLaunchNotMarked,
    #[msg("public RLYA launch has already been marked")]
    PublicLaunchAlreadyMarked,
    #[msg("this presale allocation is still inside its post-launch release lock")]
    PresaleReleaseStillLocked,
    #[msg("founder allocation is still locked")]
    FounderStillLocked,
    #[msg("founder allocation has already been released")]
    FounderAlreadyReleased,
    #[msg("buyer cannot refer their own wallet")]
    SelfReferral,
    #[msg("referral reward is invalid for this purchase")]
    InvalidReferralReward,
    #[msg("referral rate differs from the fixed protocol rate")]
    InvalidReferralRate,
    #[msg("this buyer wallet already has a referral attribution and must use it")]
    ReferralRequired,
    #[msg("direct two-wallet circular referrals are not allowed")]
    CircularReferral,
    #[msg("pre-launch delivery does not match the committed final manifest totals")]
    PrelaunchCommitmentMismatch,
    #[msg("staking bonus delivery does not match the committed fixed-reserve totals")]
    StakingBonusCommitmentMismatch,
}
