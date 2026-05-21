# ================================================================
#  setup-first-time.ps1 — Configuração inicial (rode UMA VEZ)
#  AI Agentic CRM | Milvolts LTDA
#
#  Execute este script com:
#    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#    .\setup-first-time.ps1
# ================================================================

param(
    [string]$GitHubUser  = "",   # seu usuário do GitHub ex: "wagnertvs"
    [string]$GitHubToken = "",   # Personal Access Token (repo scope)
    [string]$RepoName    = "ai-agentic-crm"
)

Write-Host "`n╔══════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║   🛠️  AI Agentic CRM — Setup Inicial            ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════╝`n" -ForegroundColor Magenta

# ── PASSO 1: Login CLASP com ads.deyvid@gmail.com ───────────────
Write-Host "━━━ [1/3] CLASP — Login Google Apps Script ━━━" -ForegroundColor Cyan
Write-Host "Abrirá uma janela do navegador." -ForegroundColor DarkGray
Write-Host "Certifique-se de entrar com: ads.deyvid@gmail.com`n" -ForegroundColor Yellow

$respClasp = Read-Host "Pressione ENTER para iniciar o login do CLASP (ou 'pular' para ignorar)"
if ($respClasp -ne "pular") {
    clasp login
    Write-Host "`n✅ CLASP autenticado!" -ForegroundColor Green
} else {
    Write-Host "⚠️  CLASP pulado." -ForegroundColor Yellow
}

# ── PASSO 2: Teste do CLASP push ────────────────────────────────
Write-Host "`n━━━ [2/3] Testando conexao com Apps Script ━━━" -ForegroundColor Cyan
$testPush = Read-Host "Testar clasp push agora? (s/N)"
if ($testPush -eq "s" -or $testPush -eq "S") {
    Write-Host "Executando clasp push --force ..." -ForegroundColor DarkGray
    clasp push --force
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ clasp push OK!" -ForegroundColor Green
    } else {
        Write-Host "❌ clasp push falhou. Verifique a conta logada." -ForegroundColor Red
    }
}

# ── PASSO 3: GitHub ─────────────────────────────────────────────
Write-Host "`n━━━ [3/3] Configurando GitHub ━━━" -ForegroundColor Cyan

if (-not $GitHubUser) {
    $GitHubUser = Read-Host "Seu usuario do GitHub (ex: wagnertvs)"
}

# Verifica se remote já existe
$remoteExiste = git remote get-url origin 2>$null
if ($remoteExiste) {
    Write-Host "✅ Remote 'origin' ja configurado: $remoteExiste" -ForegroundColor Green
} else {
    # Cria repo via API do GitHub se token fornecido
    if (-not $GitHubToken) {
        $GitHubToken = Read-Host "GitHub Personal Access Token (repo scope) — ENTER para pular criacao automatica"
    }

    if ($GitHubToken) {
        Write-Host "Criando repositorio '$RepoName' no GitHub..." -ForegroundColor DarkGray

        $body = @{
            name        = $RepoName
            description = "AI-Powered Agentic CRM — WhatsApp Sales Pipeline Automation with Google Apps Script + GPT Maker AI"
            private     = $false
            has_issues  = $true
            has_wiki    = $false
        } | ConvertTo-Json

        $headers = @{
            "Authorization" = "token $GitHubToken"
            "Accept"        = "application/vnd.github.v3+json"
            "User-Agent"    = "AI-Agentic-CRM-Setup"
        }

        try {
            $resp = Invoke-RestMethod -Uri "https://api.github.com/user/repos" `
                -Method Post -Body $body -Headers $headers -ContentType "application/json"
            Write-Host "✅ Repositorio criado: $($resp.html_url)" -ForegroundColor Green
            git remote add origin "https://github.com/$GitHubUser/$RepoName.git"
        } catch {
            Write-Host "❌ Erro ao criar repo: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "   Crie manualmente em: https://github.com/new" -ForegroundColor Yellow
            Write-Host "   Nome sugerido: $RepoName" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Adicione o remote manualmente apos criar o repo em github.com/new:" -ForegroundColor Yellow
        Write-Host "   git remote add origin https://github.com/$GitHubUser/$RepoName.git" -ForegroundColor DarkYellow
    }
}

# Push inicial
$doPush = Read-Host "`nFazer push inicial para o GitHub? (s/N)"
if ($doPush -eq "s" -or $doPush -eq "S") {
    git push -u origin main
    if ($LASTEXITCODE -eq 0) {
        $remoteUrl = git remote get-url origin 2>$null
        Write-Host "`n✅ Repositorio publicado!" -ForegroundColor Green
        Write-Host "   $remoteUrl" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Push falhou. Verifique o token ou a URL do remote." -ForegroundColor Red
    }
}

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "✅  Setup completo! Proximos passos:" -ForegroundColor Green
Write-Host "   • Deploy completo:  .\deploy.ps1 -Message 'feat: ...'"  -ForegroundColor Cyan
Write-Host "   • Apenas CLASP:     .\deploy.ps1 -SomenteClasp"         -ForegroundColor Cyan
Write-Host "   • Apenas GitHub:    .\deploy.ps1 -SomenteGitHub"        -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor DarkGray
