param(
    [Parameter(Mandatory)]
    [ValidateSet('Install', 'InstallDjango', 'Upgrade', 'UpgradeDjango')]
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

# compose/.env is the Python source of truth (also synced into setup-python and the Dockerfiles' base).
function Get-PythonVersion {
    $match = Select-String -Path 'compose/.env' -Pattern '^PYTHON_VERSION:\s*(\d+\.\d+\.\d+)\s*$' | Select-Object -First 1
    if (-not $match) { throw 'compose/.env must define PYTHON_VERSION as a stable X.Y.Z release.' }
    return $match.Matches[0].Groups[1].Value
}

function Assert-HostPython {
    param([string]$Version)

    $minor = ($Version -split '\.')[0..1] -join '.'
    $check = "import sys; print(sys.executable, sys.version); sys.exit(0 if '%d.%d' % sys.version_info[:2] == '$minor' else 'Python $minor is required.')"
    Invoke-CheckedCommand python @('-c', $check)
    & python -c 'import sys; sys.exit(0 if sys.prefix != sys.base_prefix else 1)'
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'python is not running in a virtualenv; packages will be installed into this interpreter globally.'
    }
}

function Install-HashedPip {
    Write-Host 'Installing hash-verified pip 26.3...'
    Invoke-CheckedCommand python @(
        '-m', 'pip', 'install', '--upgrade', '--require-hashes', '--only-binary=:all:', '--no-deps',
        '--constraint', '.github/requirements/pip.in', '--requirement', '.github/requirements/pip.txt'
    )
}

Push-Location (Join-Path $PSScriptRoot '../..')
try {
    $pythonVersion = Get-PythonVersion
    if ($Action -eq 'Install') {
        Assert-HostPython $pythonVersion
        Install-HashedPip
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
    } elseif ($Action -eq 'InstallDjango') {
        Assert-HostPython $pythonVersion
        Install-HashedPip
        # Exact pins from both runtime locks, without Pyroscope (no Windows wheels). Not hash-checked: host
        # platforms add packages the Linux inventory lacks (Django's tzdata on Windows).
        $root = 'services/python/django/gunicorn'
        $requirements = New-TemporaryFile
        try {
            Get-Content "$root/WSGI/requirements.txt", "$root/ASGI/requirements.txt" |
                Where-Object { $_ -notmatch 'pyroscope' } | Set-Content $requirements.FullName
            Invoke-CheckedCommand python @(
                '-m', 'pip', 'install', '--editable', "$root/common", '--requirement', $requirements.FullName,
                '--requirement', "$root/WSGI/requirements-dev.txt", '--requirement', "$root/ASGI/requirements-dev.txt"
            )
        } finally {
            Remove-Item $requirements.FullName -Force -ErrorAction SilentlyContinue
        }
        Invoke-CheckedCommand python @('-m', 'pip', 'check')
    } else {
        # Bash code is a single Docker argument; only the required trees are mounted.
        $bootstrap = @'
set -euo pipefail
echo 'Installing hash-verified pip 26.3...'
python -m pip install --upgrade --require-hashes --only-binary=:all: --no-deps --requirement .github/requirements/pip.in
python -m pip install --require-hashes --only-binary=:all: --constraint .github/requirements/lock-compiler.in --requirement .github/requirements/lock-compiler.txt

'@
        if ($Action -eq 'Upgrade') {
            $containerCommand = $bootstrap + "bash .github/requirements/update-lock.sh --upgrade`n"
        } else {
            # Same invocation as runtimeLockCompileArgs in scripts/versions/python-lock-relay.mjs, plus --upgrade
            # (omitted from the header). Linux output keeps the committed form the Renovate relay reproduces.
            $containerCommand = $bootstrap + @'
for variant in WSGI ASGI; do
  python -m piptools compile --upgrade --strip-extras --pip-args='--only-binary :all:' \
    --output-file="services/python/django/gunicorn/$variant/requirements.txt" \
    "services/python/django/gunicorn/$variant/requirements.in"
done
bash .github/requirements/update-lock.sh
'@
        }
        # Same base as the Django Dockerfiles, so locks resolve for the Python patch release CI and images use.
        $image = "python:$pythonVersion-slim-bookworm"
        Write-Host "Compiling in $image..."
        Invoke-CheckedCommand docker @(
            'run', '--rm',
            '--env', 'PIP_ROOT_USER_ACTION=ignore', '--env', 'PIP_DISABLE_PIP_VERSION_CHECK=1',
            '--mount', "type=bind,source=$($PWD.Path)/.github/requirements,target=/workspace/.github/requirements",
            '--mount', "type=bind,source=$($PWD.Path)/services/python/django/gunicorn,target=/workspace/services/python/django/gunicorn",
            '--workdir', '/workspace', $image, 'bash', '-c',
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
