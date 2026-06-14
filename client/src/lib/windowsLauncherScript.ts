import type { LaunchLocalResult } from '../api/saveFile';

const escapeWindowsPowerShell = (value: string) => value.replace(/"/g, '`"');

export const buildWindowsScript = (pkg: LaunchLocalResult, backendBase: string, fallbackName?: string) => {
  const escapedSavePath = pkg.emuSavePath?.replace(/"/g, '`"') ?? '';
  const escapedExe = escapeWindowsPowerShell(pkg.exePath);
  const escapedRom = escapeWindowsPowerShell(pkg.romPath || '');
  const escapedSaveDir = escapeWindowsPowerShell(pkg.saveDir);
  const titleIdLow = escapeWindowsPowerShell(pkg.titleIdLow || '');
  const escapedBackend = escapeWindowsPowerShell(backendBase);
  const escapedSaveFileId = escapeWindowsPowerShell(pkg.saveFileId);
  const escapedSyncToken = escapeWindowsPowerShell(pkg.syncToken);
  const baseName = (pkg.fileName || fallbackName || 'save').replace(/\.[^.]+$/, '');
  const gameVersion = pkg.gameVersion;

  const scriptContent = `# pkmanager — 本地启动 Azahar/DeSmuME 脚本
$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "pkmanager Launcher"
trap {
    Write-Host "[ERROR] Unexpected failure: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

function Resolve-AzaharTitleIdLow([string]$titleIdLow, [string]$romPath) {
    if ($titleIdLow) {
        return $titleIdLow.ToUpperInvariant()
    }
    if ($romPath -match 'title[\\\\/]+00040000[\\\\/]+([0-9A-Fa-f]{8})[\\\\/]content') {
        return $Matches[1].ToUpperInvariant()
    }
    return ''
}

function Resolve-AzaharSdmcPath([string]$dataDir) {
    $trimmed = $dataDir.TrimEnd('\\', '/')
    if ($trimmed.EndsWith('sdmc', [System.StringComparison]::OrdinalIgnoreCase)) {
        return $trimmed
    }
    return Join-Path $trimmed 'sdmc'
}

function Normalize-WindowsPath([string]$path) {
    if (-not $path) {
        return $path
    }
    if ($path -match '^[A-Za-z]:[\\\\/]' -or $path -match '^\\\\') {
        return ($path -replace '/', '\\')
    }
    return $path
}

function Quote-ProcessArgument([string]$value) {
    if (-not $value) {
        return $value
    }
    return '"' + $value.Replace('"', '\"') + '"'
}

function Get-BytesSha256Hex([byte[]]$bytes) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '')
    } finally {
        $sha.Dispose()
    }
}

function Get-DesmumeRomSearchTerms([int]$gameVersion) {
    switch ($gameVersion) {
        10 { return @("钻石", "diamond") }
        11 { return @("珍珠", "pearl") }
        12 { return @("白金", "platinum") }
        7  { return @("心金", "heartgold") }
        8  { return @("魂银", "soulsilver") }
        20 { return @("白", "white") }
        21 { return @("黑", "black") }
        22 { return @("白2", "white2") }
        23 { return @("黑2", "black2") }
        default { return @() }
    }
}

function Resolve-DesmumeRomPath([string]$fallbackPath, [string]$saveDir, [string]$exePath, [int]$gameVersion) {
    if ($fallbackPath -and (Test-Path $fallbackPath -ErrorAction SilentlyContinue)) {
        return $fallbackPath
    }

    $terms = Get-DesmumeRomSearchTerms $gameVersion
    $roots = New-Object System.Collections.Generic.List[string]

    $exeDir = Split-Path $exePath -Parent
    if ($exeDir) { $roots.Add($exeDir) }
    if ($saveDir) { $roots.Add($saveDir) }
    $saveParent = if ($saveDir) { Split-Path $saveDir -Parent } else { $null }
    if ($saveParent) { $roots.Add($saveParent) }
    $fallbackParent = if ($fallbackPath) { Split-Path $fallbackPath -Parent } else { $null }
    if ($fallbackParent) { $roots.Add($fallbackParent) }

    $searchRoots = $roots |
        Where-Object { $_ -and (Test-Path $_ -ErrorAction SilentlyContinue) } |
        Select-Object -Unique

    foreach ($root in $searchRoots) {
        try {
            $files = Get-ChildItem -LiteralPath $root -Filter *.nds -File -Recurse -ErrorAction Stop
            foreach ($term in $terms) {
                $match = $files | Where-Object {
                    $_.BaseName.IndexOf($term, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
                } | Sort-Object FullName | Select-Object -First 1
                if ($match) {
                    Write-Host "[pkmanager] Resolved local DeSmuME ROM by search term '$term': $($match.FullName)" -ForegroundColor Green
                    return $match.FullName
                }
            }
        } catch {
            # ignore search failures on inaccessible roots
        }
    }

    if ($fallbackPath) {
        return $fallbackPath
    }
    throw "Unable to resolve a local NDS ROM path for gameVersion=$gameVersion"
}

function Get-BigEndianUInt32([byte[]]$bytes, [int]$offset) {
    return [uint32]((([uint32]$bytes[$offset]) -shl 24) -bor (([uint32]$bytes[$offset + 1]) -shl 16) -bor (([uint32]$bytes[$offset + 2]) -shl 8) -bor ([uint32]$bytes[$offset + 3]))
}

function Get-BigEndianUInt16([byte[]]$bytes, [int]$offset) {
    return [uint16]((([uint16]$bytes[$offset]) -shl 8) -bor ([uint16]$bytes[$offset + 1]))
}

function Get-TmdSignatureSize([uint32]$signatureType) {
    switch ($signatureType) {
        0x10000 { return 0x200 }
        0x10003 { return 0x200 }
        0x10001 { return 0x100 }
        0x10004 { return 0x100 }
        0x10002 { return 0x3C }
        0x10005 { return 0x3C }
        default { throw ("Unknown TMD signature type: 0x{0:X8}" -f $signatureType) }
    }
}

function Resolve-AzaharContentPath([string]$dataDir, [string]$titleIdLow, [string]$fallbackPath) {
    $resolvedTitleIdLow = Resolve-AzaharTitleIdLow $titleIdLow $fallbackPath
    if (-not $resolvedTitleIdLow) {
        if ($fallbackPath) {
            return $fallbackPath
        }
        throw "Missing title id for Azahar content path resolution."
    }

    $contentDir = Join-Path (Resolve-AzaharSdmcPath $dataDir) "Nintendo 3DS"
    $contentDir = Join-Path $contentDir "00000000000000000000000000000000"
    $contentDir = Join-Path $contentDir "00000000000000000000000000000000"
    $contentDir = Join-Path $contentDir "title"
    $contentDir = Join-Path $contentDir "00040000"
    $contentDir = Join-Path $contentDir $resolvedTitleIdLow
    $contentDir = Join-Path $contentDir "content"

    if (-not (Test-Path $contentDir -ErrorAction SilentlyContinue)) {
        if ($fallbackPath -and (Test-Path $fallbackPath -ErrorAction SilentlyContinue)) {
            Write-Host "[WARN] Azahar content directory is not accessible, using backend fallback path." -ForegroundColor Yellow
            return $fallbackPath
        }
        throw "Azahar content directory is not accessible: $contentDir"
    }

    $tmdFile = Get-ChildItem -LiteralPath $contentDir -Filter *.tmd -File -ErrorAction Stop |
        Sort-Object Name |
        Select-Object -First 1
    if (-not $tmdFile) {
        if ($fallbackPath -and (Test-Path $fallbackPath -ErrorAction SilentlyContinue)) {
            Write-Host "[WARN] No TMD file found, using backend fallback path." -ForegroundColor Yellow
            return $fallbackPath
        }
        throw "No TMD file was found in $contentDir"
    }

    try {
        $bytes = [IO.File]::ReadAllBytes($tmdFile.FullName)
        if ($bytes.Length -lt 4) {
            throw "TMD file is too small: $($tmdFile.FullName)"
        }

        $signatureType = Get-BigEndianUInt32 $bytes 0
        $signatureSize = Get-TmdSignatureSize $signatureType
        $bodyStart = [int]([Math]::Ceiling(($signatureSize + 4) / 64.0) * 64)
        $chunkBase = $bodyStart + 0x9C4
        if ($bytes.Length -lt ($chunkBase + 4)) {
            throw "TMD file is truncated: $($tmdFile.FullName)"
        }

        $contentCount = Get-BigEndianUInt16 $bytes ($bodyStart + 0x9E)
        if ($contentCount -lt 1) {
            throw "TMD does not contain launchable content: $($tmdFile.FullName)"
        }

        if ($contentCount -gt 1 -and $bytes.Length -ge ($chunkBase + 0x38)) {
            $secondContentType = Get-BigEndianUInt16 $bytes ($chunkBase + 0x30 + 6)
            if (($secondContentType -band 0x4000) -ne 0) {
                $contentDir = Join-Path $contentDir "00000000"
            }
        }

        $contentId = Get-BigEndianUInt32 $bytes $chunkBase
        return Join-Path $contentDir ("{0:x8}.app" -f $contentId)
    } catch {
        if ($fallbackPath -and (Test-Path $fallbackPath -ErrorAction SilentlyContinue)) {
            Write-Host "[WARN] Failed to parse TMD, using backend fallback path: $($_.Exception.Message)" -ForegroundColor Yellow
            return $fallbackPath
        }
        throw
    }
}

$saveDataBase64 = @"
${pkg.saveDataBase64}
"@

$emuSavePath = "${escapedSavePath}"
$exePath = "${escapedExe}"
$fallbackRomPath = "${escapedRom}"
$saveDir = "${escapedSaveDir}"
$type = "${pkg.type}"
$titleIdLow = "${titleIdLow}"
$backendBase = "${escapedBackend}"
$saveFileId = "${escapedSaveFileId}"
$syncToken = "${escapedSyncToken}"
$romPath = if ($type -eq "azahar") {
    Normalize-WindowsPath (Resolve-AzaharContentPath $saveDir $titleIdLow $fallbackRomPath)
} else {
    Normalize-WindowsPath (Resolve-DesmumeRomPath $fallbackRomPath $saveDir $exePath ${gameVersion})
}
$emuSavePath = if ($type -eq "desmume") {
    $romFileName = [IO.Path]::GetFileNameWithoutExtension($romPath)
    Normalize-WindowsPath (Join-Path $saveDir "$romFileName.dsv")
} else {
    Normalize-WindowsPath $emuSavePath
}
$launchArgs = if ($romPath) { @(Quote-ProcessArgument $romPath) } else { @() }

Write-Host "[pkmanager] Launch package received" -ForegroundColor Green
Write-Host "  Type: $type Gen${pkg.generation}"
if ($titleIdLow) {
    Write-Host "  TID : $titleIdLow"
}
Write-Host "  EXE : $exePath"
Write-Host "  ROM : $romPath"
Write-Host "  SAVE: $emuSavePath"
if ($type -eq "azahar" -and $fallbackRomPath -and $fallbackRomPath -ne $romPath) {
    Write-Host "  NOTE: Resolved Azahar content from TMD instead of backend fallback." -ForegroundColor Yellow
}
if ($saveFileId) {
    Write-Host "  SAVE ID : $saveFileId"
}

$exeDrive = Split-Path $exePath -Qualifier
if ($exeDrive -and -not (Test-Path "$exeDrive\" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Drive is not accessible: $exeDrive" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$romDir = Split-Path $romPath -Parent
if ($romDir -and -not (Test-Path $romDir -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] ROM directory is not accessible: $romDir" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$saveParent = Split-Path $emuSavePath -Parent
if (-not (Test-Path $saveParent -ErrorAction SilentlyContinue)) {
    try {
        New-Item -ItemType Directory -Force -Path $saveParent -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "[ERROR] Failed to create save directory: $saveParent" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

if ($type -eq "azahar") {
    $backupDir = Join-Path $saveDir "pkmanager_backup" | Join-Path -ChildPath $titleIdLow
    $backupFile = Join-Path $backupDir "main.bak"
} else {
    $backupDir = Join-Path $saveDir "pkmanager_backup"
    $backupFile = Join-Path $backupDir "save.dsv.bak"
}
$hadExistingSave = Test-Path $emuSavePath -ErrorAction SilentlyContinue

try {
    New-Item -ItemType Directory -Force -Path $backupDir -ErrorAction Stop | Out-Null
} catch {
    Write-Host "[ERROR] Failed to create backup directory: $backupDir" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$backupReady = $false
if ($hadExistingSave) {
    try {
        Copy-Item $emuSavePath $backupFile -Force -ErrorAction Stop
        $backupReady = $true
        Write-Host "[pkmanager] Existing save backed up" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Backup failed, continuing anyway" -ForegroundColor Yellow
    }
} else {
    Write-Host "[pkmanager] No existing save found"
}

try {
    $saveBytes = [Convert]::FromBase64String(($saveDataBase64 -replace "\s", ""))
    $expectedHash = Get-BytesSha256Hex $saveBytes
    Write-Host "[pkmanager] Save bytes: $($saveBytes.Length)"
    [IO.File]::WriteAllBytes($emuSavePath, $saveBytes)
    $writtenBytes = [IO.File]::ReadAllBytes($emuSavePath)
    $actualHash = Get-BytesSha256Hex $writtenBytes
    if ($writtenBytes.Length -ne $saveBytes.Length -or $actualHash -ne $expectedHash) {
        Write-Host "[ERROR] Save verification failed after write." -ForegroundColor Red
        Write-Host "  Expected: $($saveBytes.Length) bytes, SHA256=$expectedHash" -ForegroundColor Yellow
        Write-Host "  Actual  : $($writtenBytes.Length) bytes, SHA256=$actualHash" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "[pkmanager] Save verify: OK ($actualHash)" -ForegroundColor Green
    Write-Host "[pkmanager] Save injected" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Failed to write save: $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path $exePath -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Emulator executable was not found: $exePath" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[pkmanager] Launching: $exePath $($launchArgs -join ' ')" -ForegroundColor Green
$process = Start-Process -FilePath $exePath -ArgumentList $launchArgs -PassThru
if ($null -eq $process) {
    Write-Host "[ERROR] Emulator process failed to start." -ForegroundColor Red
    Read-Host "Press Enter to close this window"
    exit 1
}
Write-Host "[pkmanager] Emulator launched (PID: $($process.Id)). Waiting for exit..." -ForegroundColor Green
$process.WaitForExit()
Write-Host "[pkmanager] Emulator exited with code $($process.ExitCode)"

if (-not $saveFileId -or -not $syncToken) {
    Write-Host "[WARN] Missing sync token, skipping automatic sync." -ForegroundColor Yellow
} elseif (-not (Test-Path $emuSavePath -ErrorAction SilentlyContinue)) {
    Write-Host "[WARN] Save file was not found after emulator exit, skipping sync: $emuSavePath" -ForegroundColor Yellow
} else {
    $syncUrl = "$backendBase/api/Emulator/sync-save/$saveFileId?token=$([Uri]::EscapeDataString($syncToken))"
    $syncBytes = [IO.File]::ReadAllBytes($emuSavePath)
    Write-Host "[pkmanager] Syncing save back to backend..."
    Write-Host "[pkmanager] Sync bytes: $($syncBytes.Length)"
    Write-Host "[pkmanager] POST $syncUrl"
    try {
        if ($backendBase -match "localhost") {
            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
        }
        $syncResponse = Invoke-RestMethod -Uri $syncUrl -Method Post -ContentType "application/octet-stream" -Body $syncBytes -TimeoutSec 60
        if ($syncResponse.code -eq 0) {
            Write-Host "[pkmanager] Save synced successfully." -ForegroundColor Green
            if ($backupReady -and (Test-Path $backupFile -ErrorAction SilentlyContinue)) {
                try {
                    Copy-Item $backupFile $emuSavePath -Force -ErrorAction Stop
                    Write-Host "[pkmanager] Restored previous local save." -ForegroundColor Green
                } catch {
                    Write-Host "[WARN] Failed to restore previous local save: $($_.Exception.Message)" -ForegroundColor Yellow
                }
            } elseif ($type -eq "desmume" -and -not $hadExistingSave -and (Test-Path $emuSavePath -ErrorAction SilentlyContinue)) {
                try {
                    Remove-Item $emuSavePath -Force -ErrorAction Stop
                    Write-Host "[pkmanager] Removed injected temporary save (first launch)." -ForegroundColor Green
                } catch {
                    Write-Host "[WARN] Failed to clean injected temporary save: $($_.Exception.Message)" -ForegroundColor Yellow
                }
            } else {
                Write-Host "[pkmanager] No previous local save to restore." -ForegroundColor Yellow
            }
        } else {
            Write-Host "[WARN] Backend sync returned non-zero code: $($syncResponse.message)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[WARN] Automatic sync failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Read-Host "Press Enter to close this window"
`;

  return { fileName: `pkmanager_launch_${baseName}.ps1`, scriptContent };
};
