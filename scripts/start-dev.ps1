[CmdletBinding()]
param(
  [switch]$SkipDatabase
)

$ErrorActionPreference = 'Stop'
$backendPort = 3000
$frontendPort = 3001
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw 'pnpm was not found. Install pnpm 11.10.0 first.'
}

if (-not (Test-Path -LiteralPath 'node_modules')) {
  Write-Host 'Dependencies not found. Running pnpm install...' -ForegroundColor Yellow
  pnpm install
}

$backendEnv = Join-Path $repoRoot 'apps/server-elysia/.env'
if (-not (Test-Path -LiteralPath $backendEnv)) {
  Copy-Item -LiteralPath (Join-Path $repoRoot '.env.example') -Destination $backendEnv
  Write-Host 'Created apps/server-elysia/.env from .env.example.' -ForegroundColor Yellow
}

if (-not $SkipDatabase) {
  Write-Host 'Generating Prisma Client...' -ForegroundColor Cyan
  pnpm db:generate
  Write-Host 'Applying SQLite migrations...' -ForegroundColor Cyan
  pnpm db:migrate:deploy
  Write-Host 'Initializing demo data when the database is empty...' -ForegroundColor Cyan
  pnpm --filter @repo/server-elysia seed
}

$env:PORT = [string]$backendPort
$env:CORS_ORIGIN = "http://localhost:$frontendPort,http://127.0.0.1:$frontendPort"
$env:VITE_API_ORIGIN = "http://localhost:$backendPort"
$env:VITE_BACKEND_URL = "http://localhost:$backendPort"

Write-Host ''
Write-Host 'Starting full-stack development services:' -ForegroundColor Green
Write-Host "  Backend:  http://localhost:$backendPort"
Write-Host "  Frontend: http://localhost:$frontendPort/login"
Write-Host "  Swagger:  http://localhost:$backendPort/api/docs"
Write-Host '  Press Ctrl+C to stop both services.' -ForegroundColor DarkGray
Write-Host ''

pnpm dev
