$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$brand = Join-Path $root "icons\brand"
$res = Join-Path $root "android\app\src\main\res"
$icons = Join-Path $root "icons"

function Load-Bitmap([string]$path) {
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $ms = New-Object System.IO.MemoryStream(,$bytes)
  return New-Object System.Drawing.Bitmap($ms)
}

function New-Gfx([System.Drawing.Bitmap]$bmp) {
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  return $g
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $dir = Split-Path $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Resize-Square([System.Drawing.Image]$src, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $bmp.SetResolution(72, 72)
  $g = New-Gfx $bmp
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  return $bmp
}

function Crop-NonWhite([System.Drawing.Bitmap]$src, [int]$threshold = 248) {
  $minX = $src.Width; $minY = $src.Height; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $src.Height; $y++) {
    for ($x = 0; $x -lt $src.Width; $x++) {
      $p = $src.GetPixel($x, $y)
      if ($p.R -lt $threshold -or $p.G -lt $threshold -or $p.B -lt $threshold) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  if ($maxX -lt 0) { return $src.Clone() }
  $pad = [Math]::Max(8, [int](($maxX - $minX + 1) * 0.08))
  $x0 = [Math]::Max(0, $minX - $pad)
  $y0 = [Math]::Max(0, $minY - $pad)
  $x1 = [Math]::Min($src.Width - 1, $maxX + $pad)
  $y1 = [Math]::Min($src.Height - 1, $maxY + $pad)
  $w = $x1 - $x0 + 1
  $h = $y1 - $y0 + 1
  $side = [Math]::Max($w, $h)
  $out = New-Object System.Drawing.Bitmap($side, $side)
  $g = New-Gfx $out
  $g.Clear([System.Drawing.Color]::White)
  $dx = [int](($side - $w) / 2)
  $dy = [int](($side - $h) / 2)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle($dx, $dy, $w, $h)), (New-Object System.Drawing.Rectangle($x0, $y0, $w, $h)), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  return $out
}

$icon = Load-Bitmap (Join-Path $brand "icon.png")
$adaptive = Load-Bitmap (Join-Path $brand "adaptive.png")
$splashSrc = Load-Bitmap (Join-Path $brand "splash.png")
$splashLogo = Crop-NonWhite $splashSrc

$launcher = @{
  "mipmap-mdpi" = 48
  "mipmap-hdpi" = 72
  "mipmap-xhdpi" = 96
  "mipmap-xxhdpi" = 144
  "mipmap-xxxhdpi" = 192
}
$foreground = @{
  "mipmap-mdpi" = 108
  "mipmap-hdpi" = 162
  "mipmap-xhdpi" = 216
  "mipmap-xxhdpi" = 324
  "mipmap-xxxhdpi" = 432
}
$logoDp = @{
  "drawable-mdpi" = 80
  "drawable-hdpi" = 120
  "drawable-xhdpi" = 160
  "drawable-xxhdpi" = 240
  "drawable-xxxhdpi" = 320
}

foreach ($folder in $launcher.Keys) {
  $bmp = Resize-Square $icon $launcher[$folder]
  Save-Png $bmp (Join-Path $res "$folder\ic_launcher.png")
  Save-Png $bmp (Join-Path $res "$folder\ic_launcher_round.png")
  $bmp.Dispose()
}

foreach ($folder in $foreground.Keys) {
  $bmp = Resize-Square $adaptive $foreground[$folder]
  Save-Png $bmp (Join-Path $res "$folder\ic_launcher_foreground.png")
  $bmp.Dispose()
}

Get-ChildItem $res -Recurse -Filter "splash.png" | Remove-Item -Force

foreach ($folder in $logoDp.Keys) {
  $bmp = Resize-Square $splashLogo $logoDp[$folder]
  Save-Png $bmp (Join-Path $res "$folder\splash_logo.png")
  $bmp.Dispose()
}

$pwa192 = Resize-Square $icon 192
Save-Png $pwa192 (Join-Path $icons "icon-192.png")
$pwa192.Dispose()
$pwa512 = Resize-Square $icon 512
Save-Png $pwa512 (Join-Path $icons "icon-512.png")
$pwa512.Dispose()

$icon.Dispose()
$adaptive.Dispose()
$splashSrc.Dispose()
$splashLogo.Dispose()

Write-Host "Android brand assets applied"
