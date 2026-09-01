param(
    [string]$Root = (Join-Path $PSScriptRoot '..\flutter\web\js\dist'),
    [int]$Port = 8080,
    [string]$BindAddress = 'localhost'
)

$ErrorActionPreference = 'Stop'
$rootPath = [System.IO.Path]::GetFullPath((Resolve-Path $Root).Path)

if (-not (Test-Path (Join-Path $rootPath 'index.html'))) {
    throw "index.html was not found under: $rootPath"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://$BindAddress`:$Port/")
$listener.Start()

$mimeTypes = @{
    '.css' = 'text/css; charset=utf-8'
    '.gif' = 'image/gif'
    '.html' = 'text/html; charset=utf-8'
    '.ico' = 'image/x-icon'
    '.js' = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png' = 'image/png'
    '.svg' = 'image/svg+xml'
    '.wasm' = 'application/wasm'
    '.webp' = 'image/webp'
}

Write-Host "Serving $rootPath"
Write-Host "Open http://$BindAddress`:$Port/"
Write-Host 'Press Ctrl+C to stop.'

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $response = $context.Response

        try {
            $relativePath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($relativePath)) {
                $relativePath = 'index.html'
            }

            $candidate = [System.IO.Path]::GetFullPath((Join-Path $rootPath ($relativePath -replace '/', '\')))
            $rootWithSeparator = $rootPath.TrimEnd('\') + '\'

            if (-not $candidate.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase) -and $candidate -ne $rootPath) {
                $response.StatusCode = 403
                $body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
            } elseif (Test-Path $candidate -PathType Leaf) {
                $body = [System.IO.File]::ReadAllBytes($candidate)
                $extension = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
                if ($mimeTypes.ContainsKey($extension)) {
                    $response.ContentType = $mimeTypes[$extension]
                } else {
                    $response.ContentType = 'application/octet-stream'
                }
                $response.StatusCode = 200
            } else {
                # Vite output is a single-page app; fall back to its entry point.
                $body = [System.IO.File]::ReadAllBytes((Join-Path $rootPath 'index.html'))
                $response.ContentType = $mimeTypes['.html']
                $response.StatusCode = 200
            }

            $response.ContentLength64 = $body.Length
            $response.OutputStream.Write($body, 0, $body.Length)
        } catch {
            $response.StatusCode = 500
            $body = [System.Text.Encoding]::UTF8.GetBytes($_.Exception.Message)
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.ContentLength64 = $body.Length
            $response.OutputStream.Write($body, 0, $body.Length)
        } finally {
            $response.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
