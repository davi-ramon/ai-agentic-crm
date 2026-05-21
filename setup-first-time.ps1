# ================================================================
#  setup-first-time.ps1 — Configuracao inicial (rode UMA VEZ)
#  AI Agentic CRM | Milvolts LTDA
#
#  Como rodar (no Windows PowerShell):
#    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#    .\setup-first-time.ps1 -GitHubUser "davi-ramon"
# ================================================================

param(
    [string]$GitHubUser  = "",
    [string]$GitHubToken = "",
    [string]$RepoName    = "ai-agentic-crm"
)

Write-Host ""
Write-Host "==================================================" -ForegroundColor Magenta
Write-Host "   AI Agentic CRM - Setup Inicial" -ForegroundColor Magenta
Write-Host "==================================================" -ForegroundColor Magenta
Write-Host ""

# ================================================================
#  PASSO 1 — Login CLASP (Google Apps Script)
# ================================================================
Write-Host "[1/3] CLASP - Login Google Apps Script" -ForegroundColor Cyan
Write-Host "  Vai abrir o navegador. Entre com: ads.deyvid@gmail.com" -ForegroundColor Yellow
Write-Host ""

$respClasp = Read-Host "  Pressione ENTER para abrir o login (ou digite 'pular')"

if ($respClasp -ne "pular") {
    clasp login
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK - CLASP autenticado!" -ForegroundColor Green
    } else {
        Write-Host "  AVISO - Verifique se o login foi concluido no navegador." -ForegroundColor Yellow
    }
} else {
    Write-Host "  Pulado." -ForegroundColor Yellow
}

# ================================================================
#  PASSO 2 — Testar CLASP push (envia codigo ao Apps Script)
# ================================================================
Write-Host ""
Write-Host "[2/3] Testando envio de codigo para o Apps Script" -ForegroundColor Cyan

$testPush = Read-Host "  Testar clasp push agora? (s/N)"

if ($testPush -eq "s" -or $testPush -eq "S") {
    Write-Host "  Enviando arquivos..." -ForegroundColor DarkGray
    clasp push --force
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK - Codigo enviado ao Apps Script!" -ForegroundColor Green
    } else {
        Write-Host "  ERRO - clasp push falhou. Verifique a conta logada." -ForegroundColor Red
    }
}

# ================================================================
#  PASSO 3 — GitHub
# ================================================================
Write-Host ""
Write-Host "[3/3] Configurando GitHub" -ForegroundColor Cyan

if (-not $GitHubUser) {
    $GitHubUser = Read-Host "  Seu usuario do GitHub (ex: davi-ramon)"
}

# Verifica se remote ja existe
$remoteExiste = git remote get-url origin 2>$null

if ($remoteExiste) {
    Write-Host "  OK - Remote ja configurado: $remoteExiste" -ForegroundColor Green
} else {
    if (-not $GitHubToken) {
        Write-Host ""
        Write-Host "  Para criar o repositorio automaticamente, preciso de um" -ForegroundColor DarkGray
        Write-Host "  GitHub Personal Access Token com escopo 'repo'." -ForegroundColor DarkGray
        Write-Host "  Crie em: https://github.com/settings/tokens/new" -ForegroundColor DarkGray
        Write-Host "  (Marque apenas a caixa 'repo' e clique Generate token)" -ForegroundColor DarkGray
        Write-Host ""
        $GitHubToken = Read-Host "  Cole o token aqui (ou ENTER para pular e criar manualmente)"
    }

    if ($GitHubToken) {
        Write-Host "  Criando repositorio '$RepoName' no GitHub..." -ForegroundColor DarkGray

        # PowerShell 5.1 - nao pipe hashtable direto ao ConvertTo-Json
        $bodyObj = [ordered]@{
            name        = $RepoName
            description = "AI-Powered Agentic CRM - WhatsApp Sales Pipeline Automation with Google Apps Script + GPT Maker AI"
            private     = $false
            has_issues  = $true
            has_wiki    = $false
        }
        $body = ConvertTo-Json -InputObject $bodyObj

        $headers = @{
            "Authorization" = "token $GitHubToken"
            "Accept"        = "application/vnd.github.v3+json"
            "User-Agent"    = "AI-Agentic-CRM-Setup"
        }

        try {
            $resp = Invoke-RestMethod -Uri "https://api.github.com/user/repos" `
                -Method Post `
                -Body $body `
                -Headers $headers `
                -ContentType "application/json"

            Write-Host "  OK - Repositorio criado: $($resp.html_url)" -ForegroundColor Green
            git remote add origin "https://github.com/$GitHubUser/$RepoName.git"
            Write-Host "  OK - Remote configurado." -ForegroundColor Green

        } catch {
            $msg = $_.Exception.Message
            Write-Host "  ERRO ao criar repo via API: $msg" -ForegroundColor Red
            Write-Host ""
            Write-Host "  Crie manualmente:" -ForegroundColor Yellow
            Write-Host "  1. Abra https://github.com/new" -ForegroundColor Yellow
            Write-Host "  2. Nome do repo: $RepoName" -ForegroundColor Yellow
            Write-Host "  3. Deixe privado ou publico (sua escolha)" -ForegroundColor Yellow
            Write-Host "  4. NAO inicialize com README (ja temos um)" -ForegroundColor Yellow
            Write-Host "  5. Clique Create repository" -ForegroundColor Yellow
            Write-Host "  6. Execute: git remote add origin https://github.com/$GitHubUser/$RepoName.git" -ForegroundColor Yellow
        }
    } else {
        Write-Host ""
        Write-Host "  Crie o repo manualmente:" -ForegroundColor Yellow
        Write-Host "  1. Abra https://github.com/new" -ForegroundColor Yellow
        Write-Host "  2. Nome: $RepoName" -ForegroundColor Yellow
        Write-Host "  3. NAO marque 'Initialize this repository'" -ForegroundColor Yellow
        Write-Host "  4. Clique Create repository" -ForegroundColor Yellow
        Write-Host "  5. Depois execute:" -ForegroundColor Yellow
        Write-Host "     git remote add origin https://github.com/$GitHubUser/$RepoName.git" -ForegroundColor DarkYellow
        Write-Host "     git push -u origin main" -ForegroundColor DarkYellow
    }
}

# Push inicial
$remoteAtual = git remote get-url origin 2>$null
if ($remoteAtual) {
    Write-Host ""
    $doPush = Read-Host "  Fazer push inicial para o GitHub agora? (s/N)"
    if ($doPush -eq "s" -or $doPush -eq "S") {
        git push -u origin main
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  OK - Codigo publicado no GitHub!" -ForegroundColor Green
            Write-Host "  Acesse: https://github.com/$GitHubUser/$RepoName" -ForegroundColor Cyan
        } else {
            Write-Host "  ERRO no push. Tente manualmente: git push -u origin main" -ForegroundColor Red
        }
    }
}

# ================================================================
#  RESUMO FINAL
# ================================================================
Write-Host ""
Write-Host "==================================================" -ForegroundColor DarkGray
Write-Host "  Setup concluido! Para proximos deploys:" -ForegroundColor Green
Write-Host ""
Write-Host "  Deploy completo (CLASP + GitHub):" -ForegroundColor Cyan
Write-Host "    .\deploy.ps1 -Message ""feat: nova feature""" -ForegroundColor White
Write-Host ""
Write-Host "  Apenas CLASP (Apps Script):" -ForegroundColor Cyan
Write-Host "    .\deploy.ps1 -SomenteClasp" -ForegroundColor White
Write-Host ""
Write-Host "  Apenas GitHub:" -ForegroundColor Cyan
Write-Host "    .\deploy.ps1 -SomenteGitHub" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor DarkGray
Write-Host ""
