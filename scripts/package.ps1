param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $repoRoot
try {
  & npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'Unit/audit checks failed; packaging stopped.' }
  & npm.cmd run test:ui
  if ($LASTEXITCODE -ne 0) { throw 'Browser checks failed; packaging stopped.' }
} finally { Pop-Location }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path ([IO.Directory]::GetParent($repoRoot).FullName) 'DeepSeek-Sidebar-Release' }
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'DeepSeek-Chrome-Sidebar\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$files = @(Get-ChildItem -LiteralPath $repoRoot -Recurse -File | Where-Object {
  $relative = $_.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
  $relative -notmatch '^(node_modules|\.git|dist|coverage|test-results|playwright-report)/' -and
  $relative -notmatch '^DeepSeek-Chrome-Sidebar-tests/.*\.png$' -and
  $relative -notmatch '\.(zip|log|pdf|pem|key)$' -and
  $_.Name -notmatch '^\.env($|\.)'
})
function Write-Zip([string]$target, [object[]]$items, [string]$prefix = '') {
  if (Test-Path -LiteralPath $target) { throw "Output already exists; move it aside or choose another output directory: $target" }
  $archive = [IO.Compression.ZipFile]::Open($target, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($item in $items) {
      $relative = $item.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $item.FullName, ($prefix + $relative), [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { $archive.Dispose() }
}
$sourceZip = Join-Path $outputRoot "DeepSeek-Sidebar-source-v$version.zip"
$extensionZip = Join-Path $outputRoot "DeepSeek-Chrome-Sidebar-v$version.zip"
Write-Zip $sourceZip $files 'deepseek-chrome-sidebar/'
$runtimeFiles = @($files | Where-Object {
  $relative = $_.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
  $relative -match '^DeepSeek-Chrome-Sidebar/' -or
  $relative -in @('README.md','LICENSE','PRIVACY.md','THIRD_PARTY_NOTICES.md','CHANGELOG.md','SECURITY.md')
})
Write-Zip $extensionZip $runtimeFiles
$hashes = Get-FileHash -LiteralPath $sourceZip, $extensionZip -Algorithm SHA256
$lines = @($hashes | ForEach-Object { $_.Hash.ToLowerInvariant() + '  ' + [IO.Path]::GetFileName($_.Path) })
[IO.File]::WriteAllLines((Join-Path $outputRoot "SHA256SUMS-v$version.txt"), $lines, [Text.UTF8Encoding]::new($false))
$hashes | Select-Object Hash, Path
