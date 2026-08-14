$ErrorActionPreference = 'Stop'

if ($env:GITHUB_ACTIONS -or $env:CI) {
  throw 'REFUSING: production program keys must never be generated or used in CI.'
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

foreach ($cmd in @('solana','solana-keygen','cargo','python')) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Missing required command: $cmd" }
}

$SolanaVersionText = (& solana --version | Out-String).Trim()
if ($SolanaVersionText -notmatch '3\.1\.10') {
  throw "RALYA production build expects Solana CLI 3.1.10. Found: $SolanaVersionText"
}

$GitAvailable = [bool](Get-Command git -ErrorAction SilentlyContinue)
$IsGitCheckout = $GitAvailable -and (Test-Path (Join-Path $Root '.git'))
if ($IsGitCheckout) {
  $Dirty = (& git status --porcelain | Out-String).Trim()
  if ($Dirty) { throw 'Start from a clean git working tree before generating production identities.' }
  $BaseCommit = (& git rev-parse HEAD | Out-String).Trim()
} else {
  $BaseCommit = 'github-download-zip-main'
  Write-Host 'No .git directory detected. Running in GitHub Download ZIP mode.'
}

& python scripts/audit_source.py
if ($LASTEXITCODE -ne 0) { throw 'RALYA source/security audit failed. Refusing Mainnet deployment.' }

$PatchApplied = $false
$KeepPatch = $false
$DumpFile = $null
$LibPath = Join-Path $Root 'programs\rlya_sale\src\lib.rs'
$AnchorPath = Join-Path $Root 'Anchor.toml'
$LibBackup = Join-Path $env:TEMP ("ralya-lib-backup-" + [guid]::NewGuid().ToString('N') + '.rs')
$AnchorBackup = Join-Path $env:TEMP ("ralya-anchor-backup-" + [guid]::NewGuid().ToString('N') + '.toml')
Copy-Item -Force $LibPath $LibBackup
Copy-Item -Force $AnchorPath $AnchorBackup

$SecretsDir = if ($env:RALYA_MAINNET_SECRETS_DIR) { $env:RALYA_MAINNET_SECRETS_DIR } else { Join-Path $env:USERPROFILE '.config\solana\ralya-mainnet' }
$ProgramKeypair = Join-Path $SecretsDir 'rlya-program-keypair.json'
$UpgradeKeypair = Join-Path $SecretsDir 'rlya-upgrade-authority.json'
$PayerKeypair = Join-Path $SecretsDir 'rlya-mainnet-payer.json'
New-Item -ItemType Directory -Force -Path $SecretsDir | Out-Null

try {
  if (-not (Test-Path $ProgramKeypair)) {
    Write-Host 'Generating permanent RALYA Program ID locally. This key never leaves this computer.'
    & solana-keygen new --no-bip39-passphrase --force -o $ProgramKeypair | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Program keypair generation failed.' }
  }
  if (-not (Test-Path $UpgradeKeypair)) {
    Write-Host 'Generating dedicated RALYA upgrade authority locally.'
    & solana-keygen new --no-bip39-passphrase --force -o $UpgradeKeypair | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Upgrade-authority generation failed.' }
  }
  if (-not (Test-Path $PayerKeypair)) {
    Write-Host 'Generating dedicated RALYA Mainnet deployment payer locally.'
    & solana-keygen new --no-bip39-passphrase --force -o $PayerKeypair | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Mainnet payer generation failed.' }
  }

  $ProgramId = (& solana-keygen pubkey $ProgramKeypair | Out-String).Trim()
  $UpgradeAuthority = (& solana-keygen pubkey $UpgradeKeypair | Out-String).Trim()
  $Payer = (& solana-keygen pubkey $PayerKeypair | Out-String).Trim()

  Write-Host ''
  Write-Host 'RALYA MAINNET OWNER CHECKPOINT'
  Write-Host "Dedicated fee payer:   $Payer"
  Write-Host "Permanent Program ID:  $ProgramId"
  Write-Host "Upgrade authority:     $UpgradeAuthority"
  Write-Host "Private key directory: $SecretsDir"
  Write-Host ''
  Write-Host 'Back up ALL THREE JSON key files offline:'
  Write-Host '  - rlya-program-keypair.json'
  Write-Host '  - rlya-upgrade-authority.json'
  Write-Host '  - rlya-mainnet-payer.json'
  Write-Host 'Never upload them to GitHub, cloud storage, chat, or email.'
  $Backup = Read-Host 'After making an offline backup, type BACKUP-CONFIRMED'
  if ($Backup -ne 'BACKUP-CONFIRMED') { Write-Host 'Stopped before Mainnet deployment.'; return }

  & python scripts/set_program_id.py $ProgramId
  if ($LASTEXITCODE -ne 0) { throw 'Could not patch the production Program ID.' }
  $PatchApplied = $true

  $BuildLog = Join-Path $env:TEMP 'ralya-mainnet-build.log'
  $BuildOutput = & cargo build-sbf --manifest-path programs/rlya_sale/Cargo.toml 2>&1
  $BuildExit = $LASTEXITCODE
  $BuildOutput | Tee-Object -FilePath $BuildLog | Write-Host
  if ($BuildExit -ne 0) { throw "SBF build failed with exit code $BuildExit" }
  if (Select-String -Path $BuildLog -Pattern 'Stack offset of [0-9]+ exceeded max offset of 4096' -Quiet) {
    throw 'Solana stack-frame limit exceeded. Refusing deployment.'
  }

  $SoFile = Join-Path $Root 'target\deploy\rlya_sale.so'
  if (-not (Test-Path $SoFile)) { throw "Missing compiled program: $SoFile" }
  $Bytes = (Get-Item $SoFile).Length
  $LocalSha256 = (Get-FileHash -Algorithm SHA256 -Path $SoFile).Hash.ToLowerInvariant()

  # Use the dedicated deployment payer as the CLI wallet for this launch. The
  # owner never needs to import a Phantom/Solflare seed into the Solana CLI.
  & solana config set --url mainnet-beta --keypair $PayerKeypair | Out-Null
  $ConfigText = (& solana config get | Out-String)
  if ($ConfigText -notmatch 'mainnet') { throw 'Solana CLI is not pointed at Mainnet.' }
  if ($ConfigText -notmatch [regex]::Escape($PayerKeypair)) { throw 'Solana CLI is not using the dedicated RALYA payer.' }
  $RentText = (& solana rent $Bytes | Out-String).Trim()
  $BalanceLamports = (& solana balance --lamports | Out-String).Trim().Split(' ')[0]

  Write-Host ''
  Write-Host "Compiled program bytes: $Bytes"
  Write-Host "Compiled SHA-256: $LocalSha256"
  Write-Host "Mainnet program rent estimate: $RentText"
  Write-Host "Dedicated payer address: $Payer"
  Write-Host "Dedicated payer balance (lamports): $BalanceLamports"
  Write-Host "Permanent Program ID: $ProgramId"
  Write-Host ''
  Write-Host 'FUNDING CHECKPOINT'
  Write-Host 'Send ONLY real Mainnet SOL to this dedicated public payer address if the balance is insufficient:'
  Write-Host $Payer
  Write-Host 'Use the rent estimate shown above PLUS a reasonable transaction-fee buffer.'
  Write-Host 'Do not send any seed phrase/private key anywhere.'
  Write-Host 'If you need to fund it, stop now. The same three local key files will be reused on the next run.'
  Write-Host ''
  $Confirm = Read-Host 'When the payer is sufficiently funded, type DEPLOY-RLYA-MAINNET to broadcast; anything else stops safely'
  if ($Confirm -ne 'DEPLOY-RLYA-MAINNET') { Write-Host "Stopped before broadcasting. Fund $Payer and rerun this same script."; return }

  $BalanceLamports = (& solana balance --lamports | Out-String).Trim().Split(' ')[0]
  Write-Host "Final payer balance (lamports): $BalanceLamports"

  $DeployOutput = & solana program deploy $SoFile --program-id $ProgramKeypair 2>&1
  $DeployExit = $LASTEXITCODE
  $DeployOutput | Write-Host
  if ($DeployExit -ne 0) { throw "Mainnet program deployment failed with exit code $DeployExit" }
  if (($DeployOutput | Out-String) -notmatch [regex]::Escape($ProgramId)) {
    throw 'Deployment output did not contain the expected Program ID. Verify before continuing.'
  }

  $Info = (& solana program show $ProgramId | Out-String)
  Write-Host $Info
  if ($Info -notmatch [regex]::Escape("Program Id: $ProgramId")) { throw 'Program verification failed.' }
  if ($Info -notmatch [regex]::Escape("Authority: $Payer")) { throw 'Initial program authority is not the dedicated RALYA payer as expected.' }

  $DumpFile = Join-Path $env:TEMP ("ralya-mainnet-dump-" + [guid]::NewGuid().ToString('N') + '.so')
  $DumpOk = $false
  foreach ($attempt in 1..5) {
    & solana program dump $ProgramId $DumpFile 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0 -and (Test-Path $DumpFile) -and (Get-Item $DumpFile).Length -gt 0) { $DumpOk = $true; break }
    Write-Host "Waiting for deployed program visibility before byte verification ($attempt/5)..."
    Start-Sleep -Seconds 2
  }
  if (-not $DumpOk) { throw 'Could not download the deployed Mainnet executable for verification.' }
  $OnchainBytes = (Get-Item $DumpFile).Length
  $OnchainSha256 = (Get-FileHash -Algorithm SHA256 -Path $DumpFile).Hash.ToLowerInvariant()
  if ($Bytes -ne $OnchainBytes) { throw "CRITICAL: deployed executable byte length mismatch. Local=$Bytes, onchain=$OnchainBytes" }
  if ($LocalSha256 -ne $OnchainSha256) { throw "CRITICAL: executable SHA-256 mismatch. Local=$LocalSha256, onchain=$OnchainSha256" }
  Write-Host "MAINNET_EXECUTABLE_BYTE_MATCH=PASS $LocalSha256"

  & solana program set-upgrade-authority $ProgramId --new-upgrade-authority $UpgradeKeypair
  if ($LASTEXITCODE -ne 0) { throw 'Upgrade-authority transfer failed.' }
  $Info = (& solana program show $ProgramId | Out-String)
  Write-Host $Info
  if ($Info -notmatch [regex]::Escape("Authority: $UpgradeAuthority")) { throw 'Upgrade-authority verification failed.' }

  $KeepPatch = $true
  $FinalPayerBalance = (& solana balance --lamports | Out-String).Trim().Split(' ')[0]
  $PublicRecord = @"
RALYA MAINNET PROGRAM DEPLOYMENT
Program ID: $ProgramId
Upgrade authority: $UpgradeAuthority
Dedicated deployment payer: $Payer
Dedicated payer remaining balance (lamports): $FinalPayerBalance
Source baseline: $BaseCommit
Program bytes: $Bytes
Executable SHA-256: $LocalSha256
On-chain executable SHA-256: $OnchainSha256
Exact downloaded byte match: PASS
Cluster: mainnet-beta
"@
  Set-Content -Path (Join-Path $Root 'RALYA_MAINNET_PROGRAM_PUBLIC.txt') -Value $PublicRecord -Encoding UTF8

  Write-Host ''
  Write-Host 'RALYA_MAINNET_PROGRAM_DEPLOYMENT=PASS'
  Write-Host "PUBLIC Program ID: $ProgramId"
  Write-Host "PUBLIC executable SHA-256: $LocalSha256"
  Write-Host "PUBLIC dedicated payer: $Payer"
  Write-Host 'Return only RALYA_MAINNET_PROGRAM_PUBLIC.txt to ChatGPT.'
  Write-Host 'Never send rlya-program-keypair.json, rlya-upgrade-authority.json, or rlya-mainnet-payer.json.'
} finally {
  if ($DumpFile) { Remove-Item -Force -ErrorAction SilentlyContinue $DumpFile }
  if ($PatchApplied -and -not $KeepPatch) {
    Copy-Item -Force $LibBackup $LibPath
    Copy-Item -Force $AnchorBackup $AnchorPath
    Write-Host 'Restored the source files to their clean pre-deployment Program ID state. Production keys remain safely local for a retry.'
  }
  Remove-Item -Force -ErrorAction SilentlyContinue $LibBackup,$AnchorBackup
}
