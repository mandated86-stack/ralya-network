use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use anchor_lang::solana_program::program_option::COption;

declare_id!("8rMEhAaQ9gU5y1ejwQtWKsV2kpET3DHjkh9aGxxjuFmn");

const SALE_SEED: &[u8] = b"sale";
const SALE_VAULT_SEED: &[u8] = b"sale_vault";
const FOUNDER_LOCK_SEED: &[u8] = b"founder_lock";
const FOUNDER_VAULT_SEED: &[u8] = b"founder_vault";
const REFERRAL_SEED: &[u8] = b"referral";

const RLYA_DECIMALS: u8 = 9;
const USDC_DECIMALS: u8 = 6;
const RLYA_UNIT: u128 = 1_000_000_000;
const USDC_UNIT: u64 = 1_000_000;
const HARD_CAP: u64 = 839_000_000_000_000_000;
const PRESALE_CAP: u64 = 100_680_000_000_000_000;
const FOUNDER_AMOUNT: u64 = 83_900_000_000_000_000;
const FOUNDER_LOCK_SECONDS: i64 = 365 * 24 * 60 * 60;
const MIN_PURCHASE_USDC: u64 = USDC_UNIT;
const BASE_PRICE_MICRO_USDC: u64 = 3_000;
const STEP_SIZE_RLYA: u64 = 1_000_000;
const STEP_SIZE_BASE_UNITS: u64 = STEP_SIZE_RLYA * 1_000_000_000;
const STEP_INCREMENT_MICRO_USDC: u64 = 50;
const REFERRAL_BPS: u64 = 100;
const BPS_DENOMINATOR: u64 = 10_000;

#[program]
pub mod rlya_sale {
    use super::*;

    /// Creates the sale state and the two program-controlled token vaults.
    /// This instruction does not mint any tokens.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        require!(ctx.accounts.rlya_mint.decimals == RLYA_DECIMALS, SaleError::WrongDecimals);
        require!(ctx.accounts.usdc_mint.decimals == USDC_DECIMALS, SaleError::WrongDecimals);
        require!(ctx.accounts.rlya_mint.mint_authority == COption::Some(ctx.accounts.admin.key()), SaleError::InitializerIsNotMintAuthority);
        require!(ctx.accounts.rlya_mint.freeze_authority.is_none(), SaleError::FreezeAuthorityStillActive);

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
            founder_amount: FOUNDER_AMOUNT,
            base_price_micro_usdc: BASE_PRICE_MICRO_USDC,
            step_size_base_units: STEP_SIZE_BASE_UNITS,
            step_increment_micro_usdc: STEP_INCREMENT_MICRO_USDC,
            referral_bps: REFERRAL_BPS,
        });
        Ok(())
    }

    /// Activates the sale only after the complete hard cap exists, mint/freeze
    /// authority are gone, and the presale/founder vaults are fully funded.
    pub fn activate(ctx: Context<Activate>) -> Result<()> {
        let sale = &mut ctx.accounts.sale;
        require!(sale.status == SaleStatus::Draft as u8, SaleError::InvalidState);
        require!(ctx.accounts.rlya_mint.supply == HARD_CAP, SaleError::HardCapMismatch);
        require!(ctx.accounts.rlya_mint.mint_authority.is_none(), SaleError::MintAuthorityStillActive);
        require!(ctx.accounts.rlya_mint.freeze_authority.is_none(), SaleError::FreezeAuthorityStillActive);
        require!(ctx.accounts.sale_vault.amount == PRESALE_CAP, SaleError::SaleVaultFundingMismatch);
        require!(ctx.accounts.founder_vault.amount == FOUNDER_AMOUNT, SaleError::FounderVaultFundingMismatch);

        let now = Clock::get()?.unix_timestamp;
        if sale.started_at == 0 {
            sale.started_at = now;
            ctx.accounts.founder_lock.unlock_at = now
                .checked_add(FOUNDER_LOCK_SECONDS)
                .ok_or(SaleError::MathOverflow)?;
        }
        sale.status = SaleStatus::Active as u8;
        emit!(SaleStatusChanged { status: sale.status, timestamp: now });
        Ok(())
    }

    pub fn pause(ctx: Context<AdminSale>) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Active as u8, SaleError::InvalidState);
        ctx.accounts.sale.status = SaleStatus::Paused as u8;
        emit!(SaleStatusChanged { status: ctx.accounts.sale.status, timestamp: Clock::get()?.unix_timestamp });
        Ok(())
    }

    pub fn resume(ctx: Context<AdminSale>) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Paused as u8, SaleError::InvalidState);
        ctx.accounts.sale.status = SaleStatus::Active as u8;
        emit!(SaleStatusChanged { status: ctx.accounts.sale.status, timestamp: Clock::get()?.unix_timestamp });
        Ok(())
    }

    /// Permanently attributes a buyer wallet to its first referrer. The same
    /// buyer cannot later switch referrers or bypass the referral with a direct
    /// buy. A direct two-wallet referral loop is rejected at registration.
    pub fn register_referral(ctx: Context<RegisterReferral>) -> Result<()> {
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

    /// Buyer pays USDC and receives RLYA atomically in the same transaction.
    /// There is intentionally no refund state or refund instruction.
    pub fn buy(ctx: Context<Buy>, usdc_amount: u64, min_rlya_out: u64) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Active as u8, SaleError::InvalidState);
        require!(usdc_amount >= MIN_PURCHASE_USDC, SaleError::PurchaseTooSmall);
        require!(ctx.accounts.referral_attribution.to_account_info().owner != ctx.program_id, SaleError::ReferralRequired);

        let price_before = current_price(&ctx.accounts.sale)?;
        let allocation = quote_allocation(&ctx.accounts.sale, usdc_amount)?;
        require!(allocation > 0, SaleError::PurchaseTooSmall);
        require!(allocation >= min_rlya_out, SaleError::SlippageExceeded);
        let new_total = ctx.accounts.sale.total_sold
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

        let sale_key = ctx.accounts.rlya_mint.key();
        let bump = [ctx.accounts.sale.bump];
        let seeds: &[&[u8]] = &[SALE_SEED, sale_key.as_ref(), &bump];
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
        sale.total_usdc_raised = sale.total_usdc_raised
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

    /// Referred buyer flow. The buyer receives the same RLYA quote as a direct
    /// purchase and pays the same gross USDC amount. A fixed 1% of gross USDC
    /// is routed to the referrer and the remaining 99% to treasury. No RLYA is
    /// minted for referrals and the referral rate is not owner-editable.
    pub fn buy_with_referral(ctx: Context<BuyWithReferral>, usdc_amount: u64, min_rlya_out: u64) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Active as u8, SaleError::InvalidState);
        require!(usdc_amount >= MIN_PURCHASE_USDC, SaleError::PurchaseTooSmall);
        require!(ctx.accounts.buyer.key() != ctx.accounts.referrer.key(), SaleError::SelfReferral);
        require!(ctx.accounts.sale.referral_bps == REFERRAL_BPS, SaleError::InvalidReferralRate);

        let price_before = current_price(&ctx.accounts.sale)?;
        let allocation = quote_allocation(&ctx.accounts.sale, usdc_amount)?;
        require!(allocation > 0, SaleError::PurchaseTooSmall);
        require!(allocation >= min_rlya_out, SaleError::SlippageExceeded);
        let new_total = ctx.accounts.sale.total_sold
            .checked_add(allocation)
            .ok_or(SaleError::MathOverflow)?;
        require!(new_total <= ctx.accounts.sale.presale_cap, SaleError::PresaleSoldOut);
        require!(ctx.accounts.sale_vault.amount >= allocation, SaleError::SaleVaultUnderfunded);

        let referral_reward_u128 = (usdc_amount as u128)
            .checked_mul(REFERRAL_BPS as u128)
            .ok_or(SaleError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(SaleError::MathOverflow)?;
        let referral_reward = u64::try_from(referral_reward_u128).map_err(|_| error!(SaleError::MathOverflow))?;
        require!(referral_reward > 0 && referral_reward < usdc_amount, SaleError::InvalidReferralReward);
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
        sale.total_usdc_raised = sale.total_usdc_raised
            .checked_add(usdc_amount)
            .ok_or(SaleError::MathOverflow)?;
        sale.total_referral_usdc_paid = sale.total_referral_usdc_paid
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

    /// Owner-only sale for buyers who pay outside the website. RLYA still leaves
    /// the same presale vault on-chain, and the same public price curve advances.
    /// This is the project's "manual lever" without a hidden arbitrary price edit.
    pub fn manual_sale(ctx: Context<ManualSale>, rlya_amount: u64) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Active as u8 || ctx.accounts.sale.status == SaleStatus::Paused as u8, SaleError::InvalidState);
        require!(rlya_amount > 0, SaleError::InvalidAmount);
        let price_before = current_price(&ctx.accounts.sale)?;
        let new_total = ctx.accounts.sale.total_sold
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
        sale.manual_sold = sale.manual_sold.checked_add(rlya_amount).ok_or(SaleError::MathOverflow)?;
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
        require!(ctx.accounts.sale.status == SaleStatus::Active as u8 || ctx.accounts.sale.status == SaleStatus::Paused as u8, SaleError::InvalidState);
        ctx.accounts.sale.status = SaleStatus::Closed as u8;
        emit!(SaleStatusChanged { status: ctx.accounts.sale.status, timestamp: Clock::get()?.unix_timestamp });
        Ok(())
    }

    /// Moves only unsold RLYA after the sale is closed.
    pub fn withdraw_unsold(ctx: Context<WithdrawUnsold>) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Closed as u8, SaleError::InvalidState);
        let amount = ctx.accounts.sale_vault.amount;
        if amount == 0 { return Ok(()); }
        let mint_key = ctx.accounts.rlya_mint.key();
        let bump = [ctx.accounts.sale.bump];
        let seeds: &[&[u8]] = &[SALE_SEED, mint_key.as_ref(), &bump];
        transfer_checked(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.sale_vault.to_account_info(),
            ctx.accounts.rlya_mint.to_account_info(),
            ctx.accounts.treasury_rlya_account.to_account_info(),
            ctx.accounts.sale.to_account_info(),
            amount,
            RLYA_DECIMALS,
            Some(&[seeds]),
        )?;
        emit!(UnsoldWithdrawn { amount });
        Ok(())
    }

    pub fn release_founder(ctx: Context<ReleaseFounder>) -> Result<()> {
        require!(!ctx.accounts.founder_lock.released, SaleError::FounderAlreadyReleased);
        let now = Clock::get()?.unix_timestamp;
        require!(ctx.accounts.founder_lock.unlock_at > 0 && now >= ctx.accounts.founder_lock.unlock_at, SaleError::FounderStillLocked);
        require!(ctx.accounts.founder_vault.amount >= FOUNDER_AMOUNT, SaleError::FounderVaultFundingMismatch);

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
        emit!(FounderReleased { founder: ctx.accounts.founder.key(), amount: FOUNDER_AMOUNT, timestamp: now });
        Ok(())
    }
}

fn current_price(sale: &Sale) -> Result<u64> {
    let step = sale.total_sold
        .checked_div(sale.step_size_base_units)
        .ok_or(SaleError::InvalidStep)?;
    let increase = step
        .checked_mul(sale.step_increment_micro_usdc)
        .ok_or(SaleError::MathOverflow)?;
    sale.base_price_micro_usdc
        .checked_add(increase)
        .ok_or(error!(SaleError::MathOverflow))
}

/// Piecewise-linear stepped curve. A large purchase may cross multiple price
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
        require!(loops <= 256, SaleError::TooManyPriceSteps);

        let step_index = progress.checked_div(step_size).ok_or(SaleError::InvalidStep)?;
        let price = base
            .checked_add(step_index.checked_mul(increment).ok_or(SaleError::MathOverflow)?)
            .ok_or(SaleError::MathOverflow)?;
        let next_boundary = ((step_index + 1)
            .checked_mul(step_size)
            .ok_or(SaleError::MathOverflow)?)
            .min(cap);
        let available = next_boundary.checked_sub(progress).ok_or(SaleError::MathOverflow)?;

        let fill_numerator = available.checked_mul(price).ok_or(SaleError::MathOverflow)?;
        let cost_to_fill = ceil_div(fill_numerator, RLYA_UNIT)?;

        if remaining_usdc >= cost_to_fill {
            allocation = allocation.checked_add(available).ok_or(SaleError::MathOverflow)?;
            progress = progress.checked_add(available).ok_or(SaleError::MathOverflow)?;
            remaining_usdc = remaining_usdc.checked_sub(cost_to_fill).ok_or(SaleError::MathOverflow)?;
        } else {
            let part = remaining_usdc
                .checked_mul(RLYA_UNIT)
                .ok_or(SaleError::MathOverflow)?
                .checked_div(price)
                .ok_or(SaleError::InvalidPrice)?;
            require!(part > 0, SaleError::PurchaseTooSmall);
            require!(part <= available, SaleError::MathOverflow);
            allocation = allocation.checked_add(part).ok_or(SaleError::MathOverflow)?;
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
    let accounts = TransferChecked { from, mint, to, authority };
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
    /// CHECK: stored as public treasury identity; token accounts are constrained later.
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: stored as founder identity; release later requires this signer.
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
    /// CHECK: deterministic referrer attribution PDA, inspected only if already program-owned.
    #[account(seeds = [REFERRAL_SEED, referrer.key().as_ref()], bump)]
    pub referrer_attribution: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: the buyer's deterministic referral PDA; if program-owned, direct buying is blocked.
    #[account(seeds = [REFERRAL_SEED, buyer.key().as_ref()], bump)]
    pub referral_attribution: UncheckedAccount<'info>,
    pub rlya_mint: Account<'info, Mint>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = rlya_mint,
        has_one = usdc_mint,
        has_one = treasury
    )]
    pub sale: Account<'info, Sale>,
    /// CHECK: constrained by sale.has_one and treasury token account owner.
    pub treasury: UncheckedAccount<'info>,
    #[account(mut, constraint = buyer_usdc_account.mint == usdc_mint.key(), constraint = buyer_usdc_account.owner == buyer.key())]
    pub buyer_usdc_account: Account<'info, TokenAccount>,
    #[account(mut, constraint = treasury_usdc_account.mint == usdc_mint.key(), constraint = treasury_usdc_account.owner == treasury.key())]
    pub treasury_usdc_account: Account<'info, TokenAccount>,
    #[account(mut, constraint = buyer_rlya_account.mint == rlya_mint.key(), constraint = buyer_rlya_account.owner == buyer.key())]
    pub buyer_rlya_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [SALE_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub sale_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BuyWithReferral<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: public referrer identity; ownership is constrained on the USDC token account.
    pub referrer: UncheckedAccount<'info>,
    #[account(
        seeds = [REFERRAL_SEED, buyer.key().as_ref()],
        bump = referral_attribution.bump,
        has_one = buyer,
        has_one = referrer
    )]
    pub referral_attribution: Account<'info, ReferralAttribution>,
    pub rlya_mint: Account<'info, Mint>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = rlya_mint,
        has_one = usdc_mint,
        has_one = treasury
    )]
    pub sale: Account<'info, Sale>,
    /// CHECK: constrained by sale.has_one and treasury token account owner.
    pub treasury: UncheckedAccount<'info>,
    #[account(mut, constraint = buyer_usdc_account.mint == usdc_mint.key(), constraint = buyer_usdc_account.owner == buyer.key())]
    pub buyer_usdc_account: Account<'info, TokenAccount>,
    #[account(mut, constraint = treasury_usdc_account.mint == usdc_mint.key(), constraint = treasury_usdc_account.owner == treasury.key())]
    pub treasury_usdc_account: Account<'info, TokenAccount>,
    #[account(mut, constraint = referrer_usdc_account.mint == usdc_mint.key(), constraint = referrer_usdc_account.owner == referrer.key())]
    pub referrer_usdc_account: Account<'info, TokenAccount>,
    #[account(mut, constraint = buyer_rlya_account.mint == rlya_mint.key(), constraint = buyer_rlya_account.owner == buyer.key())]
    pub buyer_rlya_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [SALE_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub sale_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ManualSale<'info> {
    pub admin: Signer<'info>,
    /// CHECK: owner of recipient token account.
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
    pub status: u8,
    pub bump: u8,
}
impl Sale {
    pub const SPACE: usize = 8 + (32 * 5) + (8 * 8) + 8 + 1 + 1 + 32;
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
    pub founder_amount: u64,
    pub base_price_micro_usdc: u64,
    pub step_size_base_units: u64,
    pub step_increment_micro_usdc: u64,
    pub referral_bps: u64,
}
#[event]
pub struct SaleStatusChanged { pub status: u8, pub timestamp: i64 }
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
pub struct UnsoldWithdrawn { pub amount: u64 }
#[event]
pub struct FounderReleased { pub founder: Pubkey, pub amount: u64, pub timestamp: i64 }

#[error_code]
pub enum SaleError {
    #[msg("wrong token decimals")] WrongDecimals,
    #[msg("only the current RLYA mint authority may initialize the sale")] InitializerIsNotMintAuthority,
    #[msg("invalid price")] InvalidPrice,
    #[msg("invalid price step")] InvalidStep,
    #[msg("invalid amount")] InvalidAmount,
    #[msg("math overflow")] MathOverflow,
    #[msg("invalid sale state")] InvalidState,
    #[msg("the RLYA mint supply does not equal the 839M hard cap")] HardCapMismatch,
    #[msg("mint authority must be permanently revoked before activation")] MintAuthorityStillActive,
    #[msg("freeze authority must be permanently revoked before activation")] FreezeAuthorityStillActive,
    #[msg("presale vault is not funded with the exact presale allocation")] SaleVaultFundingMismatch,
    #[msg("founder vault is not funded with the exact founder allocation")] FounderVaultFundingMismatch,
    #[msg("purchase is below the 1 USDC minimum or too small for one RLYA base unit")] PurchaseTooSmall,
    #[msg("on-chain quote is below the buyer minimum; refresh price and retry")] SlippageExceeded,
    #[msg("presale allocation is sold out")] PresaleSoldOut,
    #[msg("presale vault is underfunded")] SaleVaultUnderfunded,
    #[msg("purchase would cross too many pricing steps")] TooManyPriceSteps,
    #[msg("founder allocation is still locked")] FounderStillLocked,
    #[msg("founder allocation has already been released")] FounderAlreadyReleased,
    #[msg("buyer cannot refer their own wallet")] SelfReferral,
    #[msg("referral reward is invalid for this purchase")] InvalidReferralReward,
    #[msg("referral rate differs from the fixed protocol rate")] InvalidReferralRate,
    #[msg("this buyer wallet already has a referral attribution and must use it")] ReferralRequired,
    #[msg("direct two-wallet circular referrals are not allowed")] CircularReferral,
}
