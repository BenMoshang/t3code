param(
    [ValidateSet('Setup', 'Sync', 'Check', 'Build', 'Dev', 'Web', 'Status', 'Plan')]
    [string]$Action = 'Status'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$toolchain = Join-Path $repoRoot '.t3\toolchain'
$toolNode = Join-Path $toolchain 'node_modules\node\bin\node.exe'
$bootstrapVp = Join-Path $toolchain 'node_modules\.bin\vp.cmd'
$localVp = Join-Path $repoRoot 'node_modules\.bin\vp.cmd'

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program failed (exit $LASTEXITCODE)."
    }
}

function Use-Toolchain {
    if (-not (Test-Path -LiteralPath $toolNode)) {
        throw 'Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/custom.ps1 Setup'
    }
    $manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
    $actualNode = (& $toolNode --version).TrimStart('v')
    if ($actualNode -ne $manifest.engines.node) {
        throw 'Upstream changed Node requirements. Run scripts/custom.ps1 Setup again.'
    }
    $env:PATH = (Split-Path -Parent $toolNode) + ';' +
        (Join-Path $repoRoot 'node_modules\.bin') + ';' +
        (Join-Path $toolchain 'node_modules\.bin') + ';' + $env:PATH
}

Push-Location $repoRoot
$previousPath = $env:PATH
$previousAutoUpdate = $env:T3CODE_DISABLE_AUTO_UPDATE
try {
    switch ($Action) {
        'Setup' {
            $manifest = Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json
            $vpMatch = [regex]::Match(
                (Get-Content -LiteralPath pnpm-workspace.yaml -Raw),
                '(?m)^  vite-plus: ([0-9.]+)\r?$'
            )
            if (-not $vpMatch.Success) { throw 'Cannot read the pinned Vite+ version.' }
            $manager = $manifest.packageManager
            Invoke-Checked 'npm.cmd' @(
                'install', '--prefix', $toolchain, '--no-audit', '--no-fund',
                '--package-lock=false', '--save-exact',
                "node@$($manifest.engines.node)", $manager, "vite-plus@$($vpMatch.Groups[1].Value)"
            )
            Use-Toolchain
            Invoke-Checked $bootstrapVp @('install', '--frozen-lockfile')
        }
        'Sync' {
            if ((& git branch --show-current) -ne 'my-features') {
                throw 'Switch to my-features before syncing.'
            }
            if (@(& git status --porcelain).Count -gt 0) {
                throw 'Commit or stash your changes before syncing.'
            }
            Invoke-Checked 'git' @('fetch', 'origin', '--no-tags')
            Invoke-Checked 'git' @('fetch', 'upstream', 'main', '--no-tags')
            Invoke-Checked 'git' @('merge', '--ff-only', 'origin/my-features')
            Invoke-Checked 'git' @('switch', 'main')
            try {
                Invoke-Checked 'git' @('merge', '--ff-only', 'upstream/main')
                Invoke-Checked 'git' @('push', 'origin', 'main')
            } finally {
                Invoke-Checked 'git' @('switch', 'my-features')
            }
            & git merge-base --is-ancestor main HEAD
            if ($LASTEXITCODE -eq 0) {
                Write-Host 'my-features already includes the fetched upstream main.'
            } elseif ($LASTEXITCODE -eq 1) {
                $backup = 'backup/my-features-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
                Invoke-Checked 'git' @('branch', $backup)
                & git merge --no-edit main
                if ($LASTEXITCODE -ne 0) {
                    Invoke-Checked 'git' @('merge', '--abort')
                    throw "Upstream conflicts with your features. Merge was aborted; saved $backup."
                }
            } else {
                throw 'Cannot compare main with my-features.'
            }
            Write-Host 'Source synced. Run Setup, Check, and Build, then git push origin my-features.'
        }
        'Status' {
            Invoke-Checked 'git' @('status', '--short', '--branch')
            Invoke-Checked 'git' @('remote', '-v')
            Write-Host "Custom runtime data: $(Join-Path $repoRoot '.t3\custom-home')"
            Write-Host 'Official Nightly keeps its existing updater and data directory.'
        }
        default {
            Use-Toolchain
            if (-not (Test-Path -LiteralPath $localVp)) { throw 'Dependencies are missing. Run Setup.' }
            $env:T3CODE_DISABLE_AUTO_UPDATE = '1'
            switch ($Action) {
                'Check' { Invoke-Checked $localVp @('run', 'check:changed') }
                'Build' { Invoke-Checked $localVp @('run', 'build:desktop') }
                'Dev' {
                    Invoke-Checked $localVp @(
                        'run', 'dev:desktop', '--home-dir',
                        (Join-Path $repoRoot '.t3\custom-home'), '--no-seed'
                    )
                }
                'Web' {
                    Invoke-Checked $localVp @(
                        'run', 'dev', '--home-dir',
                        (Join-Path $repoRoot '.t3\custom-home'), '--no-seed'
                    )
                }
                'Plan' {
                    Invoke-Checked $localVp @(
                        'run', 'dev:desktop', '--home-dir',
                        (Join-Path $repoRoot '.t3\custom-home'), '--no-seed', '--dry-run'
                    )
                }
            }
        }
    }
} finally {
    $env:PATH = $previousPath
    $env:T3CODE_DISABLE_AUTO_UPDATE = $previousAutoUpdate
    Pop-Location
}
