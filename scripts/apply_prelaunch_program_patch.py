#!/usr/bin/env python3
from pathlib import Path

path = Path('programs/rlya_sale/src/lib.rs')
text = path.read_text(encoding='utf-8')

if 'pub struct PrelaunchMetrics' in text and 'pub fn deliver_prelaunch' in text:
    print('RALYA_PRELAUNCH_PROGRAM_PATCH=ALREADY_APPLIED')
    raise SystemExit(0)

old = 'const REFERRAL_SEED: &[u8] = b"referral";\n'
new = old + 'const PRELAUNCH_METRICS_SEED: &[u8] = b"prelaunch_metrics";\n'
if old not in text:
    raise SystemExit('missing referral seed marker')
text = text.replace(old, new, 1)

marker = '''    pub fn close_sale(ctx: Context<AdminSale>) -> Result<()> {
'''
insert = r'''    /// Creates a separate reconciliation account for RLYA allocated before the
    /// public token launch. Keeping these counters outside `Sale` preserves the
    /// already-tested sale-account layout while making pre-launch website
    /// allocations distinguishable from genuine manual/off-site allocations.
    pub fn initialize_prelaunch_metrics(ctx: Context<InitializePrelaunchMetrics>) -> Result<()> {
        require!(
            ctx.accounts.sale.status == SaleStatus::Draft as u8
                || ctx.accounts.sale.status == SaleStatus::Paused as u8,
            SaleError::InvalidState
        );
        let metrics = &mut ctx.accounts.prelaunch_metrics;
        metrics.rlya_mint = ctx.accounts.rlya_mint.key();
        metrics.web_rlya_delivered = 0;
        metrics.gross_usdc_imported = 0;
        metrics.referral_usdc_imported = 0;
        metrics.bump = ctx.bumps.prelaunch_metrics;
        emit!(PrelaunchMetricsInitialized {
            account: metrics.key(),
            rlya_mint: metrics.rlya_mint,
        });
        Ok(())
    }

    /// Imports a referral attribution that was locked by the verified pre-launch
    /// USDC ledger. This is owner-funded because the buyer should not have to
    /// sign another setup transaction on distribution day.
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

    /// Delivers RLYA that was already purchased through the verified pre-launch
    /// USDC ledger. No USDC moves here: the original Mainnet USDC transaction is
    /// the payment evidence. The imported gross/referral amounts reconcile the
    /// production Sale counters exactly once while RLYA leaves the official sale
    /// vault and advances the same total_sold price curve.
    pub fn deliver_prelaunch(
        ctx: Context<DeliverPrelaunch>,
        rlya_amount: u64,
        gross_usdc_amount: u64,
        referral_usdc_amount: u64,
    ) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Paused as u8, SaleError::InvalidState);
        require!(rlya_amount > 0, SaleError::InvalidAmount);
        require!(gross_usdc_amount >= MIN_PURCHASE_USDC, SaleError::PurchaseTooSmall);
        require!(referral_usdc_amount <= gross_usdc_amount, SaleError::InvalidReferralReward);

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
        sale.total_usdc_raised = sale.total_usdc_raised
            .checked_add(gross_usdc_amount)
            .ok_or(SaleError::MathOverflow)?;
        sale.total_referral_usdc_paid = sale.total_referral_usdc_paid
            .checked_add(referral_usdc_amount)
            .ok_or(SaleError::MathOverflow)?;

        let metrics = &mut ctx.accounts.prelaunch_metrics;
        metrics.web_rlya_delivered = metrics.web_rlya_delivered
            .checked_add(rlya_amount)
            .ok_or(SaleError::MathOverflow)?;
        metrics.gross_usdc_imported = metrics.gross_usdc_imported
            .checked_add(gross_usdc_amount)
            .ok_or(SaleError::MathOverflow)?;
        metrics.referral_usdc_imported = metrics.referral_usdc_imported
            .checked_add(referral_usdc_amount)
            .ok_or(SaleError::MathOverflow)?;

        let price_after = current_price(sale)?;
        emit!(PrelaunchDelivered {
            recipient: ctx.accounts.recipient.key(),
            rlya_amount,
            gross_usdc_amount,
            referral_usdc_amount,
            total_sold: sale.total_sold,
            web_rlya_delivered: metrics.web_rlya_delivered,
            price_before_micro_usdc: price_before,
            price_after_micro_usdc: price_after,
        });
        Ok(())
    }

'''
if marker not in text:
    raise SystemExit('missing close_sale marker')
text = text.replace(marker, insert + marker, 1)

marker = '''#[derive(Accounts)]
pub struct WithdrawUnsold<'info> {
'''
insert = r'''#[derive(Accounts)]
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
    /// CHECK: pre-launch buyer identity from the signed delivery manifest.
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
    /// CHECK: deterministic attribution for the referrer; inspected only if program-owned.
    #[account(seeds = [REFERRAL_SEED, referrer.key().as_ref()], bump)]
    pub referrer_attribution: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeliverPrelaunch<'info> {
    pub admin: Signer<'info>,
    /// CHECK: owner of the destination RLYA token account.
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
        seeds = [PRELAUNCH_METRICS_SEED, rlya_mint.key().as_ref()],
        bump = prelaunch_metrics.bump,
        has_one = rlya_mint
    )]
    pub prelaunch_metrics: Account<'info, PrelaunchMetrics>,
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

'''
if marker not in text:
    raise SystemExit('missing WithdrawUnsold context marker')
text = text.replace(marker, insert + marker, 1)

marker = '''#[account]
pub struct FounderLock {
'''
insert = r'''#[account]
pub struct PrelaunchMetrics {
    pub rlya_mint: Pubkey,
    pub web_rlya_delivered: u64,
    pub gross_usdc_imported: u64,
    pub referral_usdc_imported: u64,
    pub bump: u8,
}
impl PrelaunchMetrics {
    pub const SPACE: usize = 8 + 32 + (8 * 3) + 1 + 16;
}

'''
if marker not in text:
    raise SystemExit('missing FounderLock account marker')
text = text.replace(marker, insert + marker, 1)

marker = '''#[event]
pub struct UnsoldWithdrawn { pub amount: u64 }
'''
insert = r'''#[event]
pub struct PrelaunchMetricsInitialized {
    pub account: Pubkey,
    pub rlya_mint: Pubkey,
}
#[event]
pub struct PrelaunchDelivered {
    pub recipient: Pubkey,
    pub rlya_amount: u64,
    pub gross_usdc_amount: u64,
    pub referral_usdc_amount: u64,
    pub total_sold: u64,
    pub web_rlya_delivered: u64,
    pub price_before_micro_usdc: u64,
    pub price_after_micro_usdc: u64,
}
'''
if marker not in text:
    raise SystemExit('missing event marker')
text = text.replace(marker, insert + marker, 1)

path.write_text(text, encoding='utf-8')
print('RALYA_PRELAUNCH_PROGRAM_PATCH=APPLIED')
