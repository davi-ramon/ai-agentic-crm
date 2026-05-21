# ================================================================
#  deploy.ps1 — Deploy automatico: CLASP + GitHub
#  AI Agentic CRM | Milvolts LTDA
#
#  USO (sem interacao, zero prompts):
#    .\deploy.ps1
#    .\deploy.ps1 -Message "feat: nova feature"
#    .\deploy.ps1 -SomenteGitHub -Message "docs: atualiza readme"
#    .\deploy.ps1 -SomenteClasp
# ================================================================

param(
    [string]$Message     = "",
    [switch]$SomenteGitHub,
    [switch]$SomenteClasp
)

# ── Carrega credenciais do arquivo local (gitignored) ────────────
$SECRETS_FILE = Join-Path $PSScriptRoot ".secrets.ps1"
if (-not (Test-Path $SECRETS_FILE)) {
    Write-Host "ERRO: .secrets.ps1 nao encontrado em $PSScriptRoot" -ForegroundColor Red
    Write-Host "Execute configure.ps1 para criar o arquivo de credenciais." -ForegroundColor Yellow
    exit 1
}
. $SECRETS_FILE

# ── Deployment ID fixo (Apps Script) ────────────────────────────
$DEPLOYMENT_ID = "AKfycbxK1lQm3ZwnXRdUqdDN_9URR8IrrTchZCYmtF6THn8"

# ── Mensagem padrao com timestamp ────────────────────────────────
if (-not $Message) {
    $Message = "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

# ── Helpers visuais ──────────────────────────────────────────────
function OK   { param([string]$t) Write-Host "  [OK] $t" -ForegroundColor Green }
function FAIL { param([string]$t) Write-Host "  [ERRO] $t" -ForegroundColor Red; $script:errors++ }
function STEP { param([string]$t) Write-Host "`n>> $t" -ForegroundColor Cyan }
function INFO { param([string]$t) Write-Host "     $t" -ForegroundColor DarkGray }

$script:errors = 0

Write-Host ""
Write-Host "================================================" -ForegroundColor Magenta
Write-Host "  AI Agentic CRM - Auto Deploy" -ForegroundColor Magenta
Write-Host "  $Message" -ForegroundColor DarkGray
Write-Host "================================================" -ForegroundColor Magenta

# ================================================================
#  BLOCO 1 — CLASP (Google Apps Script)
# ================================================================
if (-not $SomenteGitHub) {

    STEP "Enviando codigo para o Google Apps Script..."

    clasp push --force 2>&1 | ForEach-Object { INFO $_ }

    if ($LASTEXITCODE -ne 0) {
        FAIL "clasp push falhou."
        INFO "Verifique: clasp login (conta ads.deyvid@gmail.com)"
    } else {
        OK "Codigo enviado ao Apps Script."

        STEP "Criando nova versao de implantacao..."

        clasp deploy --deploymentId $DEPLOYMENT_ID --description $Message 2>&1 | ForEach-Object { INFO $_ }

        if ($LASTEXITCODE -ne 0) {
            FAIL "clasp deploy falhou."
        } else {
            OK "Versao publicada."
            INFO "URL producao : https://script.google.com/macros/s/$DEPLOYMENT_ID/exec"
            INFO "URL dev/teste: https://script.google.com/macros/s/$DEPLOYMENT_ID/dev"
        }
    }
}

# ================================================================
#  BLOCO 2 — GITHUB (totalmente automatico via token)
# ================================================================
if (-not $SomenteClasp) {

    STEP "Preparando commit para o GitHub..."

    # Garante que nome/email do autor estao configurados localmente
    git config user.name  $GIT_AUTHOR_NAME
    git config user.email $GIT_AUTHOR_EMAIL

    # Verifica se ha mudancas para commitar
    $changed = git status --porcelain
    if (-not $changed) {
        OK "Nenhuma alteracao nova para o GitHub."
    } else {
        # Stage de todos os arquivos (respeitando .gitignore — config.gs e .secrets.ps1 serao ignorados)
        git add .

        git commit -m $Message
        if ($LASTEXITCODE -ne 0) {
            FAIL "git commit falhou."
        } else {
            OK "Commit criado: $Message"

            STEP "Fazendo push para GitHub ($GITHUB_USER/$GITHUB_REPO)..."

            # Usa token no URL para autenticar sem prompt (nao salva no git config)
            $remoteComToken = "https://$($GITHUB_TOKEN)@github.com/$GITHUB_USER/$GITHUB_REPO.git"
            $remotePublico  = "https://github.com/$GITHUB_USER/$GITHUB_REPO.git"

            git remote set-url origin $remoteComToken

            git push origin $GITHUB_BRANCH 2>&1 | ForEach-Object { INFO $_ }
            $pushCode = $LASTEXITCODE

            # Remove o token da URL imediatamente apos o push
            git remote set-url origin $remotePublico

            if ($pushCode -ne 0) {
                FAIL "git push falhou."
                INFO "Verifique se o repo existe: https://github.com/$GITHUB_USER/$GITHUB_REPO"
            } else {
                OK "Push concluido!"
                INFO "Repositorio: https://github.com/$GITHUB_USER/$GITHUB_REPO"
            }
        }
    }
}

# ================================================================
#  RESUMO
# ================================================================
Write-Host ""
Write-Host "================================================" -ForegroundColor DarkGray
if ($script:errors -eq 0) {
    Write-Host "  DEPLOY COMPLETO - sem erros." -ForegroundColor Green
} else {
    Write-Host "  DEPLOY com $($script:errors) erro(s). Veja acima." -ForegroundColor Yellow
}
Write-Host "================================================" -ForegroundColor DarkGray
Write-Host ""
