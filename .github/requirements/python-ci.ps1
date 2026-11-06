param(
    [Parameter(Mandatory)]
    [ValidateSet('Install', 'Upgrade')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'
# Check native exit codes explicitly, independent of the caller's preferences.
$PSNativeCommandUseErrorActionPreference = $false
$resultCode = 1

function Invoke-CheckedCommand {
    param([string]$Executable, [string[]]$Arguments)

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        $script:resultCode = $LASTEXITCODE
        throw "$Executable failed with exit code $LASTEXITCODE."
    }
}

Push-Location (Join-Path $PSScriptRoot '../..')
try {
    if ($Action -eq 'Install') {
        Invoke-CheckedCommand python @('-c', 'import sys; print(sys.executable, sys.version); sys.exit(0 if sys.version_info[:2] == (3, 13) else "Python 3.13 is required.")')
        Write-Host 'Installing hash-verified pip 26.3...'
        Invoke-CheckedCommand python @(
            '-m', 'pip', 'install', '--upgrade', '--require-hashes', '--only-binary=:all:', '--no-deps',
            '--constraint', '.github/requirements/pip.in', '--requirement', '.github/requirements/pip.txt'
        )
        Invoke-CheckedCommand python @(
            '-m', 'pip', 'install', '--require-hashes', '--only-binary=:all:',
            '--constraint', '.github/requirements/lock-compiler.in', '--requirement', '.github/requirements/lock-compiler.txt'
        )
        Invoke-CheckedCommand python @(
            '-m', 'pip', 'install', '--require-hashes', '--only-binary=:all:',
            '--constraint', '.github/requirements/python-ci.txt',
            '--requirement', '.github/requirements/build.in', '--requirement', '.github/requirements/coverage.in',
            '--requirement', '.github/requirements/qodana.in'
        )
        Invoke-CheckedCommand python @('-m', 'pip', 'check')
    } else {
        # Bash code is a single Docker argument; only the required trees are mounted.
        $containerCommand = @'
set -euo pipefail
echo 'Installing hash-verified pip 26.3...'
python -m pip install --upgrade --require-hashes --only-binary=:all: --no-deps --requirement .github/requirements/pip.in
python -m pip install --require-hashes --only-binary=:all: --constraint .github/requirements/lock-compiler.in --requirement .github/requirements/lock-compiler.txt
bash .github/requirements/update-lock.sh --upgrade
'@
        Invoke-CheckedCommand docker @(
            'run', '--rm',
            '--mount', "type=bind,source=$($PWD.Path)/.github/requirements,target=/workspace/.github/requirements",
            '--mount', "type=bind,source=$($PWD.Path)/services/python/django/gunicorn,target=/workspace/services/python/django/gunicorn",
            '--workdir', '/workspace', 'python:3.13.18-slim-bookworm', 'bash', '-c',
            $containerCommand.Replace("`r`n", "`n")
        )
    }
    $resultCode = 0
} finally {
    Pop-Location
    $global:LASTEXITCODE = $resultCode
    Write-Host "Python CI $Action finished with exit code $resultCode."
}

# No exit here: IntelliJ starts pwsh with -NoExit so results remain visible.
