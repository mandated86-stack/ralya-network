#!/usr/bin/env python3
from pathlib import Path

path = Path('programs/rlya_sale/src/lib.rs')
text = path.read_text(encoding='utf-8')
if 'pub struct PrelaunchDeliveryReceipt' in text and 'pub fn deliver_prelaunch_manual' in text:
    print('RALYA_PRELAUNCH_RECEIPT_PATCH=ALREADY_APPLIED')
    raise SystemExit(0)

old = 'const PRELAUNCH_METRICS_SEED: &[u8] = b"prelaunch_metrics";\n'
new = old + 'const PRELAUNCH_DELIVERY_SEED: &[u8] = b"prelaunch_delivery";\nconst PRELAUNCH_MANUAL_DELIVERY_SEED: &[u8] = b"prelaunch_manual_delivery";\n'
if old not in text:
    raise SystemExit('missing prelaunch metrics seed marker')
text = text.replace(old, new, 1)

# Populate the web-delivery receipt immediately before the event.
old = '''        let price_after = current_price(sale)?;\n        emit!(PrelaunchDelivered {\n'''
new = '''        let receipt = &mut ctx.accounts.delivery_receipt;\n        receipt.recipient = ctx.accounts.recipient.key();\n        receipt.rlya_amount = rlya_amount;\n        receipt.gross_usdc_amount = gross_usdc_amount;\n        receipt.referral_usdc_amount = referral_usdc_amount;\n        receipt.delivered_at = Clock::get()?.unix_timestamp;\n        receipt.bump = ctx.bumps.delivery_receipt;\n\n        let price_after = current_price(sale)?;\n        emit!(PrelaunchDelivered {\n'''
if old not in text:
    raise SystemExit('missing prelaunch delivery event marker')
text = text.replace(old, new, 1)

# Add the private/off-site prelaunch delivery instruction before close_sale.
marker = '''    pub fn close_sale(ctx: Context<AdminSale>) -> Result<()> {\n'''
insert = r'''    /// Idempotent delivery for genuine private/off-site allocations recorded
    /// before public launch. It advances the existing manual_sold counter, but a
    /// deterministic receipt PDA prevents the same wallet allocation from being
    /// delivered twice by the distribution tool.
    pub fn deliver_prelaunch_manual(
        ctx: Context<DeliverPrelaunchManual>,
        rlya_amount: u64,
    ) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Paused as u8, SaleError::InvalidState);
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
        sale.manual_sold = sale.manual_sold
            .checked_add(rlya_amount)
            .ok_or(SaleError::MathOverflow)?;
        let receipt = &mut ctx.accounts.delivery_receipt;
        receipt.recipient = ctx.accounts.recipient.key();
        receipt.rlya_amount = rlya_amount;
        receipt.gross_usdc_amount = 0;
        receipt.referral_usdc_amount = 0;
        receipt.delivered_at = Clock::get()?.unix_timestamp;
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

'''
if marker not in text:
    raise SystemExit('missing close_sale marker')
text = text.replace(marker, insert + marker, 1)

# Make the web-delivery admin a payer and add receipt + system accounts.
old = '''pub struct DeliverPrelaunch<'info> {\n    pub admin: Signer<'info>,\n'''
new = '''pub struct DeliverPrelaunch<'info> {\n    #[account(mut)]\n    pub admin: Signer<'info>,\n'''
if old not in text:
    raise SystemExit('missing DeliverPrelaunch admin marker')
text = text.replace(old, new, 1)

old = '''    #[account(mut, constraint = recipient_rlya_account.mint == rlya_mint.key(), constraint = recipient_rlya_account.owner == recipient.key())]\n    pub recipient_rlya_account: Account<'info, TokenAccount>,\n    pub token_program: Program<'info, Token>,\n}\n\n#[derive(Accounts)]\npub struct WithdrawUnsold<'info> {\n'''
new = '''    #[account(mut, constraint = recipient_rlya_account.mint == rlya_mint.key(), constraint = recipient_rlya_account.owner == recipient.key())]\n    pub recipient_rlya_account: Account<'info, TokenAccount>,\n    #[account(\n        init,\n        payer = admin,\n        space = PrelaunchDeliveryReceipt::SPACE,\n        seeds = [PRELAUNCH_DELIVERY_SEED, rlya_mint.key().as_ref(), recipient.key().as_ref()],\n        bump\n    )]\n    pub delivery_receipt: Account<'info, PrelaunchDeliveryReceipt>,\n    pub token_program: Program<'info, Token>,\n    pub system_program: Program<'info, System>,\n}\n\n#[derive(Accounts)]\npub struct DeliverPrelaunchManual<'info> {\n    #[account(mut)]\n    pub admin: Signer<'info>,\n    /// CHECK: owner of the destination RLYA account.\n    pub recipient: UncheckedAccount<'info>,\n    pub rlya_mint: Account<'info, Mint>,\n    #[account(\n        mut,\n        seeds = [SALE_SEED, rlya_mint.key().as_ref()],\n        bump = sale.bump,\n        has_one = admin,\n        has_one = rlya_mint\n    )]\n    pub sale: Account<'info, Sale>,\n    #[account(\n        mut,\n        token::mint = rlya_mint,\n        token::authority = sale,\n        seeds = [SALE_VAULT_SEED, rlya_mint.key().as_ref()],\n        bump\n    )]\n    pub sale_vault: Account<'info, TokenAccount>,\n    #[account(mut, constraint = recipient_rlya_account.mint == rlya_mint.key(), constraint = recipient_rlya_account.owner == recipient.key())]\n    pub recipient_rlya_account: Account<'info, TokenAccount>,\n    #[account(\n        init,\n        payer = admin,\n        space = PrelaunchDeliveryReceipt::SPACE,\n        seeds = [PRELAUNCH_MANUAL_DELIVERY_SEED, rlya_mint.key().as_ref(), recipient.key().as_ref()],\n        bump\n    )]\n    pub delivery_receipt: Account<'info, PrelaunchDeliveryReceipt>,\n    pub token_program: Program<'info, Token>,\n    pub system_program: Program<'info, System>,\n}\n\n#[derive(Accounts)]\npub struct WithdrawUnsold<'info> {\n'''
if old not in text:
    raise SystemExit('missing DeliverPrelaunch tail marker')
text = text.replace(old, new, 1)

marker = '''#[account]\npub struct FounderLock {\n'''
insert = r'''#[account]
pub struct PrelaunchDeliveryReceipt {
    pub recipient: Pubkey,
    pub rlya_amount: u64,
    pub gross_usdc_amount: u64,
    pub referral_usdc_amount: u64,
    pub delivered_at: i64,
    pub bump: u8,
}
impl PrelaunchDeliveryReceipt {
    pub const SPACE: usize = 8 + 32 + (8 * 4) + 1 + 16;
}

'''
if marker not in text:
    raise SystemExit('missing FounderLock marker')
text = text.replace(marker, insert + marker, 1)

path.write_text(text, encoding='utf-8')
print('RALYA_PRELAUNCH_RECEIPT_PATCH=APPLIED')
