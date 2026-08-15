#!/usr/bin/env python3
from pathlib import Path

path = Path('programs/rlya_sale/src/lib.rs')
text = path.read_text(encoding='utf-8')
if 'expected_web_rlya' in text and 'manifest_sha256' in text and 'manual_rlya_delivered' in text:
    print('RALYA_MANIFEST_COMMITMENT_PATCH=ALREADY_APPLIED')
    raise SystemExit(0)

start = text.index('    pub fn initialize_prelaunch_metrics(')
end = text.index('    /// Imports a referral attribution', start)
new_init = r'''    pub fn initialize_prelaunch_metrics(
        ctx: Context<InitializePrelaunchMetrics>,
        manifest_sha256: [u8; 32],
        expected_web_rlya: u64,
        expected_manual_rlya: u64,
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
            expected_referral_usdc <= expected_gross_usdc,
            SaleError::PrelaunchCommitmentMismatch
        );
        let metrics = &mut ctx.accounts.prelaunch_metrics;
        metrics.rlya_mint = ctx.accounts.rlya_mint.key();
        metrics.manifest_sha256 = manifest_sha256;
        metrics.expected_web_rlya = expected_web_rlya;
        metrics.expected_manual_rlya = expected_manual_rlya;
        metrics.expected_gross_usdc = expected_gross_usdc;
        metrics.expected_referral_usdc = expected_referral_usdc;
        metrics.web_rlya_delivered = 0;
        metrics.manual_rlya_delivered = 0;
        metrics.gross_usdc_imported = 0;
        metrics.referral_usdc_imported = 0;
        metrics.bump = ctx.bumps.prelaunch_metrics;
        emit!(PrelaunchMetricsInitialized {
            account: metrics.key(),
            rlya_mint: metrics.rlya_mint,
            manifest_sha256,
            expected_web_rlya,
            expected_manual_rlya,
            expected_gross_usdc,
            expected_referral_usdc,
        });
        Ok(())
    }

'''
text = text[:start] + new_init + text[end:]

needle = '''        require!(
            referral_usdc_amount <= gross_usdc_amount,
            SaleError::InvalidReferralReward
        );

        let price_before = current_price(&ctx.accounts.sale)?;
'''
replacement = '''        require!(
            referral_usdc_amount <= gross_usdc_amount,
            SaleError::InvalidReferralReward
        );
        let next_web_rlya = ctx
            .accounts
            .prelaunch_metrics
            .web_rlya_delivered
            .checked_add(rlya_amount)
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
            next_gross_usdc <= ctx.accounts.prelaunch_metrics.expected_gross_usdc,
            SaleError::PrelaunchCommitmentMismatch
        );
        require!(
            next_referral_usdc <= ctx.accounts.prelaunch_metrics.expected_referral_usdc,
            SaleError::PrelaunchCommitmentMismatch
        );

        let price_before = current_price(&ctx.accounts.sale)?;
'''
if needle not in text:
    raise SystemExit('deliver_prelaunch guard marker not found')
text = text.replace(needle, replacement, 1)

old = '''        let metrics = &mut ctx.accounts.prelaunch_metrics;
        metrics.web_rlya_delivered = metrics
            .web_rlya_delivered
            .checked_add(rlya_amount)
            .ok_or(SaleError::MathOverflow)?;
        metrics.gross_usdc_imported = metrics
            .gross_usdc_imported
            .checked_add(gross_usdc_amount)
            .ok_or(SaleError::MathOverflow)?;
        metrics.referral_usdc_imported = metrics
            .referral_usdc_imported
            .checked_add(referral_usdc_amount)
            .ok_or(SaleError::MathOverflow)?;
'''
new = '''        let metrics = &mut ctx.accounts.prelaunch_metrics;
        metrics.web_rlya_delivered = next_web_rlya;
        metrics.gross_usdc_imported = next_gross_usdc;
        metrics.referral_usdc_imported = next_referral_usdc;
'''
if old not in text:
    raise SystemExit('deliver_prelaunch metrics marker not found')
text = text.replace(old, new, 1)

needle = '''        require!(
            ctx.accounts.sale_vault.amount >= rlya_amount,
            SaleError::SaleVaultUnderfunded
        );

        let mint_key = ctx.accounts.rlya_mint.key();
'''
# First occurrence belongs to manual_sale, second to deliver_prelaunch, third to deliver_prelaunch_manual.
positions=[]
pos=0
while True:
    p=text.find(needle,pos)
    if p<0: break
    positions.append(p); pos=p+1
if len(positions) < 3:
    raise SystemExit('could not find deliver_prelaunch_manual vault marker')
p=positions[2]
insert = '''        require!(
            ctx.accounts.sale_vault.amount >= rlya_amount,
            SaleError::SaleVaultUnderfunded
        );
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
'''
text = text[:p] + insert + text[p+len(needle):]

needle = '''        sale.manual_sold = sale
            .manual_sold
            .checked_add(rlya_amount)
            .ok_or(SaleError::MathOverflow)?;
        let receipt = &mut ctx.accounts.delivery_receipt;
'''
replacement = '''        sale.manual_sold = sale
            .manual_sold
            .checked_add(rlya_amount)
            .ok_or(SaleError::MathOverflow)?;
        ctx.accounts.prelaunch_metrics.manual_rlya_delivered = next_manual_rlya;
        let receipt = &mut ctx.accounts.delivery_receipt;
'''
# Replace the last occurrence so ordinary manual_sale remains unchanged.
idx = text.rfind(needle)
if idx < 0:
    raise SystemExit('deliver_prelaunch_manual counter marker not found')
text = text[:idx] + replacement + text[idx+len(needle):]

needle = '''    pub sale: Account<'info, Sale>,
    #[account(
        mut,
        token::mint = rlya_mint,
        token::authority = sale,
        seeds = [SALE_VAULT_SEED, rlya_mint.key().as_ref()],
        bump
    )]
    pub sale_vault: Account<'info, TokenAccount>,
'''
# Find the occurrence inside DeliverPrelaunchManual specifically.
ctx_start = text.index("pub struct DeliverPrelaunchManual<'info>")
ctx_pos = text.index(needle, ctx_start)
ctx_repl = '''    pub sale: Account<'info, Sale>,
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
'''
text = text[:ctx_pos] + ctx_repl + text[ctx_pos+len(needle):]

old = '''#[account]
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
new = '''#[account]
pub struct PrelaunchMetrics {
    pub rlya_mint: Pubkey,
    pub manifest_sha256: [u8; 32],
    pub expected_web_rlya: u64,
    pub expected_manual_rlya: u64,
    pub expected_gross_usdc: u64,
    pub expected_referral_usdc: u64,
    pub web_rlya_delivered: u64,
    pub manual_rlya_delivered: u64,
    pub gross_usdc_imported: u64,
    pub referral_usdc_imported: u64,
    pub bump: u8,
}
impl PrelaunchMetrics {
    pub const SPACE: usize = 8 + 32 + 32 + (8 * 8) + 1 + 16;
}
'''
if old not in text:
    raise SystemExit('PrelaunchMetrics struct marker not found')
text = text.replace(old,new,1)

old = '''pub struct PrelaunchMetricsInitialized {
    pub account: Pubkey,
    pub rlya_mint: Pubkey,
}
'''
new = '''pub struct PrelaunchMetricsInitialized {
    pub account: Pubkey,
    pub rlya_mint: Pubkey,
    pub manifest_sha256: [u8; 32],
    pub expected_web_rlya: u64,
    pub expected_manual_rlya: u64,
    pub expected_gross_usdc: u64,
    pub expected_referral_usdc: u64,
}
'''
if old not in text:
    raise SystemExit('PrelaunchMetricsInitialized event marker not found')
text = text.replace(old,new,1)

needle = '''    #[msg("direct two-wallet circular referrals are not allowed")]
    CircularReferral,
'''
replacement = '''    #[msg("direct two-wallet circular referrals are not allowed")]
    CircularReferral,
    #[msg("pre-launch delivery does not match the committed final manifest totals")]
    PrelaunchCommitmentMismatch,
'''
if needle not in text:
    raise SystemExit('error enum marker not found')
text = text.replace(needle,replacement,1)

path.write_text(text,encoding='utf-8')
print('RALYA_MANIFEST_COMMITMENT_PATCH=APPLIED')
