# ================================================================
#  deploy.ps1 — Deploy automatizado: CLASP + GitHub
#  AI Agentic CRM | Milvolts LTDA
#
#  USO:
#    .\deploy.ps1                         # usa timestamp como mensagem
#    .\deploy.ps1 -Message "feat: PDV sync com IA"
#    .\deploy.ps1 -SomenteGitHub          # só push GitHub, sem CLASP
#    .\deploy.ps1 -SomenteClasp           # só push CLASP, sem GitHub
#
# ================================================================

param(
    [string]$Message      = "",
    [switch]$SomenteGitHub,
    [switch]$SomenteClasp,
    [switch]$Silencioso
)

$DEPLOYMENT_ID = "AKfycbxK1lQm3ZwnXRdUqdDN_9URR8IrrTchZCYmtF6THn8"
$BRANCH        = "main"

# ── Gera mensagem padrão com timestamp ──────────────────────────
if (-not $Message) {
    $Message = "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm') — auto-deploy"
}

function Write-Step { param([string]$Icon, [string]$Text, [string]$Color = "Cyan")
    Write-Host "`n$Icon  $Text" -ForegroundColor $Color
}
function Write-Ok   { param([string]$Text) Write-Host "   ✅ $Text" -ForegroundColor Green }
function Write-Fail { param([string]$Text) Write-Host "   ❌ $Text" -ForegroundColor Red }
function Write-Warn { param([string]$Text) Write-Host "   ⚠️  $Text" -ForegroundColor Yellow }

Write-Host "`n╔══════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║   🚀  AI Agentic CRM — Auto Deploy      ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host "   Mensagem : $Message" -ForegroundColor DarkGray
Write-Host "   Branch   : $BRANCH" -ForegroundColor DarkGray
Write-Host "   Deploy ID: $DEPLOYMENT_ID" -ForegroundColor DarkGray

$ErrorsFound = 0

# ════════════════════════════════════════════════════════════════
#  BLOCO 1 — CLASP (Google Apps Script)
# ════════════════════════════════════════════════════════════════
if (-not $SomenteGitHub) {

    Write-Step "📤" "Enviando código para o Google Apps Script (clasp push)..."

    clasp push --force
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "clasp push falhou (código $LASTEXITCODE)."
        Write-Warn "Verifique se você está autenticado: clasp login"
        $ErrorsFound++
    } else {
        Write-Ok "Código enviado com sucesso."
    }

    if ($ErrorsFound -eq 0) {
        Write-Step "📦" "Criando nova versão de implantação (clasp deploy)..."

        clasp deploy --deploymentId $DEPLOYMENT_ID --description $Message
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "clasp deploy falhou."
            $ErrorsFound++
        } else {
            Write-Ok "Versão implantada em producao."
            Write-Host "   🌐 URL: https://script.google.com/macros/s/$DEPLOYMENT_ID/exec" -ForegroundColor DarkCyan
        }
    }
}

# ════════════════════════════════════════════════════════════════
#  BLOCO 2 — GITHUB
# ════════════════════════════════════════════════════════════════
if (-not $SomenteClasp) {

    Write-Step "🐙" "Preparando commit para o GitHub..."

    # Verifica se remote existe
    $remoteUrl = git remote get-url origin 2>$null
    if (-not $remoteUrl) {
        Write-Warn "Remote 'origin' nao configurado."
        Write-Host "   Execute uma vez:" -ForegroundColor Yellow
        Write-Host "   git remote add origin https://github.com/SEU_USUARIO/ai-agentic-crm.git" -ForegroundColor DarkYellow
    } else {
        # Adiciona todos os arquivos (respeitando .gitignore)
        git add .

        # Verifica se há algo para commitar
        $status = git status --porcelain
        if (-not $status) {
            Write-Warn "Nenhuma alteracao para commitar no GitHub."
        } else {
            git commit -m $Message
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "git commit falhou."
                $ErrorsFound++
            } else {
                Write-Ok "Commit criado: $Message"

                git push origin $BRANCH
                if ($LASTEXITCODE -ne 0) {
                    Write-Fail "git push falhou. Tente: git push --set-upstream origin $BRANCH"
                    $ErrorsFound++
                } else {
                    Write-Ok "Push para GitHub concluido."
                }
            }
        }
    }
}

# ════════════════════════════════════════════════════════════════
#  RESUMO FINAL
# ════════════════════════════════════════════════════════════════
Write-Host "`n──────────────────────────────────────────" -ForegroundColor DarkGray
if ($ErrorsFound -eq 0) {
    Write-Host "✅  Deploy completo sem erros!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Deploy concluido com $ErrorsFound erro(s). Verifique acima." -ForegroundColor Yellow
}
Write-Host "──────────────────────────────────────────`n" -ForegroundColor DarkGray
