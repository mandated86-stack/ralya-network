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

# A normal GitHub Download ZIP is supported. If this is a real git checkout we
# additionally require a clean tree and record its exact commit.
$GitAvailable = [bool](Get-Command git -ErrorAction SilentlyContinue)
$IsGitCheckout = $GitAvailable -and (Test-Path (Join-Path $Root '.git'))
if ($IsGitCheckout) {
  $Dirty = (& git status --porcelain | Out-String).Trim()
  if ($Dirty) { throw 'Start from a clean git working tree before generating the production Program ID.' }
  $BaseCommit = (& git rev-parse HEAD | Out-String).Trim()
} else {
  $BaseCommit = 'github-download-zip-main'
  Write-Host 'No .git directory detected. Running in GitHub Download ZIP mode.'
}

# Run the same repository invariant/source audit before any production key is
# generated or any Mainnet transaction is considered.
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

  $ProgramId = (& solana-keygen pubkey $ProgramKeypair | Out-String).Trim()
  $UpgradeAuthority = (& solana-keygen pubkey $UpgradeKeypair | Out-String).Trim()
  $Deployer = (& solana address | Out-String).Trim()

  Write-Host ''
  Write-Host 'RALYA MAINNET OWNER CHECKPOINT'
  Write-Host "Deployer wallet:       $Deployer"
  Write-Host "Permanent Program ID:  $ProgramId"
  Write-Host "Upgrade authority:     $UpgradeAuthority"
  Write-Host "Private key directory: $SecretsDir"
  Write-Host ''
  Write-Host 'Back up both JSON key files offline. Never upload them to GitHub, cloud storage, chat, or email.'
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

  & solana config set --url mainnet-beta | Out-Null
  $ConfigText = (& solana config get | Out-String)
  if ($ConfigText -notmatch 'mainnet') { throw 'Solana CLI is not pointed at Mainnet.' }
  $RentText = (& solana rent $Bytes | Out-String).Trim()
  $BalanceText = (& solana balance | Out-String).Trim()

  Write-Host ''
  Write-Host "Compiled program bytes: $Bytes"
  Write-Host "Compiled SHA-256: $LocalSha256"
  Write-Host "Mainnet program rent estimate: $RentText"
  Write-Host "Deployer balance: $BalanceText"
  Write-Host "Program ID to be deployed: $ProgramId"
  Write-Host 'If the wallet is not sufficiently funded, do not confirm. The source files will restore automatically and these same permanent local keys will be reused after funding.'
  Write-Host ''
  $Confirm = Read-Host 'Type DEPLOY-RLYA-MAINNET to broadcast the real Mainnet deployment'
  if ($Confirm -ne 'DEPLOY-RLYA-MAINNET') { Write-Host 'Stopped before broadcasting.'; return }

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
  $PublicRecord = @"
RALYA MAINNET PROGRAM DEPLOYMENT
Program ID: $ProgramId
Upgrade authority: $UpgradeAuthority
Deployer public wallet: $Deployer
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
  Write-Host 'Return only RALYA_MAINNET_PROGRAM_PUBLIC.txt to ChatGPT. Never send either JSON key file.'
} finally {
  if ($DumpFile) { Remove-Item -Force -ErrorAction SilentlyContinue $DumpFile }
  if ($PatchApplied -and -not $KeepPatch) {
    Copy-Item -Force $LibBackup $LibPath
    Copy-Item -Force $AnchorBackup $AnchorPath
    Write-Host 'Restored the source files to their clean pre-deployment Program ID state. Production keys remain safely local for a retry.'
  }
  Remove-Item -Force -ErrorAction SilentlyContinue $LibBackup,$AnchorBackup
}
