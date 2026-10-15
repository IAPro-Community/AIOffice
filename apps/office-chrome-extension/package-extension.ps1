param(
  [string]$OutputPath = 'dist/release-assets/AIOffice-Chrome-Extension.zip'
)

$ErrorActionPreference = 'Stop'
$extensionRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $extensionRoot '..\..'))
$outputFullPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  [System.IO.Path]::GetFullPath($OutputPath)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
}
$repoPrefix = $repoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $outputFullPath.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputPath must stay inside the repository: $outputFullPath"
}

$runtimeFiles = @(
  'manifest.json',
  'README.md',
  'activity-kinds.js',
  'agent-identity.js',
  'avatar-fallback.js',
  'avatar-renderer.js',
  'icon-16.png',
  'icon-32.png',
  'icon-48.png',
  'icon-128.png',
  'feed-recovery.js',
  'feed-view.js',
  'host-state.js',
  'notification.svg',
  'service-worker.js',
  'sidepanel.css',
  'sidepanel.html',
  'sidepanel.js'
)

$stageRoot = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) ("aioffice-extension-package-" + [guid]::NewGuid().ToString('N'))))
$tempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $stageRoot.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to stage outside the temporary directory: $stageRoot"
}

try {
  Push-Location $repoRoot
  try {
    & node (Join-Path $extensionRoot 'build-avatar.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Could not build the extension avatar renderer.' }
    & node (Join-Path $extensionRoot 'validate.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Extension validation failed; ZIP was not created.' }
  } finally {
    Pop-Location
  }

  foreach ($file in $runtimeFiles) {
    $source = Join-Path $extensionRoot $file
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw "Required extension runtime file is missing: $file"
    }
  }

  New-Item -ItemType Directory -Path $stageRoot | Out-Null
  foreach ($file in $runtimeFiles) {
    Copy-Item -LiteralPath (Join-Path $extensionRoot $file) -Destination (Join-Path $stageRoot $file)
  }

  $outputDirectory = Split-Path -Parent $outputFullPath
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $outputFullPath -Force

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($outputFullPath)
  try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName })
    foreach ($file in $runtimeFiles) {
      if ($entries -notcontains $file) { throw "ZIP is missing a root-level runtime file: $file" }
    }
    if ($entries | Where-Object { $_ -match '[/\\]' }) {
      throw 'ZIP entries must be at the archive root so Chrome can load the extracted folder directly.'
    }

    $manifestEntry = $archive.GetEntry('manifest.json')
    $manifestReader = [System.IO.StreamReader]::new($manifestEntry.Open())
    try { $manifest = $manifestReader.ReadToEnd() | ConvertFrom-Json } finally { $manifestReader.Dispose() }
    if ($manifest.manifest_version -ne 3) { throw 'The packaged manifest is not Manifest V3.' }
    if (-not $manifest.side_panel.default_path) { throw 'The packaged manifest has no side panel entry point.' }
    foreach ($size in @('16', '32', '48', '128')) {
      $iconPath = $manifest.icons.$size
      if (-not $iconPath -or $manifest.action.default_icon.$size -ne $iconPath) {
        throw "The packaged manifest is missing the AIOffice icon for size $size."
      }
      if ($entries -notcontains $iconPath) { throw "The ZIP is missing the manifest icon: $iconPath" }
    }
  } finally {
    $archive.Dispose()
  }

  Write-Output "Created and verified $outputFullPath"
  Write-Output ("Included {0} root-level extension files." -f $runtimeFiles.Count)
} finally {
  if (Test-Path -LiteralPath $stageRoot -PathType Container) {
    $resolvedStage = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $stageRoot).Path)
    if ($resolvedStage.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedStage).StartsWith('aioffice-extension-package-', [System.StringComparison]::Ordinal)) {
      Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    } else {
      throw "Refusing to remove an unexpected staging path: $resolvedStage"
    }
  }
}
