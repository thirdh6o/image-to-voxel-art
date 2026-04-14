Add-Type -AssemblyName System.Drawing

$buildDir = Join-Path $PSScriptRoot '..\build'
$pngPath = Join-Path $buildDir 'icon.png'
$icoPath = Join-Path $buildDir 'icon.ico'

[System.IO.Directory]::CreateDirectory((Resolve-Path $buildDir)) | Out-Null

$size = 256
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

$rect = New-Object System.Drawing.RectangleF 12, 12, 232, 232
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush `
  (New-Object System.Drawing.PointF 0, 0), `
  (New-Object System.Drawing.PointF 256, 256), `
  ([System.Drawing.Color]::FromArgb(255, 250, 246, 236)), `
  ([System.Drawing.Color]::FromArgb(255, 237, 244, 255))

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 54
$d = $radius * 2
$path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
$path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
$path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
$path.CloseFigure()
$graphics.FillPath($bgBrush, $path)

$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(36, 26, 35, 56)), 2
$graphics.DrawPath($borderPen, $path)

$shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(24, 30, 64, 120))

function Draw-Cube {
  param(
    [System.Drawing.Graphics]$G,
    [float]$X,
    [float]$Y,
    [float]$W,
    [float]$H,
    [System.Drawing.Color]$TopColor,
    [System.Drawing.Color]$LeftColor,
    [System.Drawing.Color]$RightColor
  )

  $top = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF ($X), ($Y + $H * 0.25)),
    (New-Object System.Drawing.PointF ($X + $W * 0.5), ($Y)),
    (New-Object System.Drawing.PointF ($X + $W), ($Y + $H * 0.25)),
    (New-Object System.Drawing.PointF ($X + $W * 0.5), ($Y + $H * 0.5))
  )
  $left = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF ($X), ($Y + $H * 0.25)),
    (New-Object System.Drawing.PointF ($X + $W * 0.5), ($Y + $H * 0.5)),
    (New-Object System.Drawing.PointF ($X + $W * 0.5), ($Y + $H)),
    (New-Object System.Drawing.PointF ($X), ($Y + $H * 0.75))
  )
  $right = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF ($X + $W * 0.5), ($Y + $H * 0.5)),
    (New-Object System.Drawing.PointF ($X + $W), ($Y + $H * 0.25)),
    (New-Object System.Drawing.PointF ($X + $W), ($Y + $H * 0.75)),
    (New-Object System.Drawing.PointF ($X + $W * 0.5), ($Y + $H))
  )

  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(30, 34, 58), 4)
  $G.FillPolygon((New-Object System.Drawing.SolidBrush $leftColor), $left)
  $G.FillPolygon((New-Object System.Drawing.SolidBrush $rightColor), $right)
  $G.FillPolygon((New-Object System.Drawing.SolidBrush $TopColor), $top)
  $G.DrawPolygon($pen, $left)
  $G.DrawPolygon($pen, $right)
  $G.DrawPolygon($pen, $top)
  $pen.Dispose()
}

Draw-Cube $graphics 58 116 82 78 `
  ([System.Drawing.Color]::FromArgb(255, 255, 214, 120)) `
  ([System.Drawing.Color]::FromArgb(255, 235, 160, 72)) `
  ([System.Drawing.Color]::FromArgb(255, 252, 181, 78))

Draw-Cube $graphics 104 84 82 78 `
  ([System.Drawing.Color]::FromArgb(255, 160, 219, 255)) `
  ([System.Drawing.Color]::FromArgb(255, 75, 167, 236)) `
  ([System.Drawing.Color]::FromArgb(255, 114, 190, 248))

Draw-Cube $graphics 150 116 82 78 `
  ([System.Drawing.Color]::FromArgb(255, 175, 240, 201)) `
  ([System.Drawing.Color]::FromArgb(255, 62, 174, 116)) `
  ([System.Drawing.Color]::FromArgb(255, 98, 205, 147))

$badgeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 255, 255, 255))
$graphics.FillEllipse($shadowBrush, 176, 34, 42, 42)
$graphics.FillEllipse($badgeBrush, 170, 28, 42, 42)
$badgePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(36, 26, 35, 56)), 2
$graphics.DrawEllipse($badgePen, 170, 28, 42, 42)

$font = New-Object System.Drawing.Font('Segoe UI', 17, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(32, 86, 216))
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('V', $font, $textBrush, (New-Object System.Drawing.RectangleF 170, 28, 42, 42), $format)

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$iconBitmap = New-Object System.Drawing.Bitmap $bitmap, 256, 256
$iconHandle = $iconBitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Dispose()

[System.Runtime.InteropServices.Marshal]::Release($iconHandle) | Out-Null
$icon.Dispose()
$iconBitmap.Dispose()
$font.Dispose()
$textBrush.Dispose()
$format.Dispose()
$badgePen.Dispose()
$badgeBrush.Dispose()
$shadowBrush.Dispose()
$borderPen.Dispose()
$bgBrush.Dispose()
$path.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
