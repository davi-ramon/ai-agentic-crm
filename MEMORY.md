# MEMORY.md — CRM Milvolts LTDA
> Documento de contexto completo para continuidade do projeto em qualquer sessão ou IA.
> Última atualização: 07/06/2026 — v46

---

## 1. VISÃO GERAL DO PROJETO

**Sistema:** CRM + Chat integrado ao WhatsApp para a Milvolts LTDA (loja de autopeças).
**Stack:** Google Apps Script (backend + frontend) → Google Sheets (banco de dados) → Firebase Hosting (proxy iframe) → GPT Maker IA (atendimento WhatsApp via Z-API).
**Repositório:** https://github.com/davi-ramon/ai-agentic-crm
**App em produção:** https://crm-milvolts.web.app

---

## 2. IDs CRÍTICOS E PERMANENTES

| Item | Valor |
|---|---|
| **GAS Script ID** | `1a3e5pPEZtd5DGCgZ81lUSBqoOinuCL-SVB8L7gMTI2Svh7t8DqtXugfz` |
| **Deployment ID (FIXO — NUNCA mudar)** | `AKfycbx3f9I7H8Rgf8eHLKkstVtIEPXTZHfaNVkuSKUX0WSGubP5wvZz1J72onQpNh6E8mw` |
| **URL WebApp GAS (IMUTÁVEL)** | `https://script.google.com/macros/s/AKfycbx3f9I7H8Rgf8eHLKkstVtIEPXTZHfaNVkuSKUX0WSGubP5wvZz1J72onQpNh6E8mw/exec` |
| **Firebase Project ID** | `crm-milvolts` |
| **Firebase URL** | `https://crm-milvolts.web.app` |
| **GitHub User** | `davi-ramon` |
| **GitHub Repo** | `ai-agentic-crm` |
| **GitHub Branch** | `main` |
| **Git Author** | `Wagner Tavares <ads.deyvid@gmail.com>` |
| **Versão atual** | v46 — @48 no GAS |

> ⚠️ O Spreadsheet ID, tokens de API e senhas ficam **somente** em Script Properties (PropertiesService). Nunca em código nem no GitHub.

---

## 3. ESTRUTURA DE ARQUIVOS

```
C:\dev\crm-milvolts\
├── MEMORY.md                    ← este arquivo (comitar no GitHub, não deployar)
├── README.md                    ← documentação pública
├── .clasp.json                  ← scriptId GAS (pode comitar)
├── .claspignore                 ← exclui *.md, firebase-hosting, *.ps1, etc.
├── .gitignore                   ← exclui config.gs, .secrets.ps1, *.xlsx, etc.
│
├── ⚠️ config.gs                 ← GITIGNORED — contém valores reais (use config.example.gs)
├── ⚠️ .secrets.ps1              ← GITIGNORED — token GitHub e credenciais de deploy
│
├── config.example.gs            ← template público (sem valores reais)
├── deploy.ps1                   ← script de deploy automatizado (clasp + git)
├── setup-first-time.ps1         ← setup inicial do ambiente
│
├── ── GAS — Backend ───────────────────────────────────────
├── codigo.gs                    ← doGet (serve index.html) + doPost (roteador webhooks)
├── planilha.gs                  ← CRUD Google Sheets (adicionarLinhaCRM, editarCampoCRM, etc.)
├── dashboard_servidor.gs        ← funções chamadas pelo frontend via google.script.run
├── automacao_devolver.gs        ← Rota A: conferir_pecas | Rota B: transferir_para_humano
├── automacao_etapas.gs          ← automação de etapas do funil
├── automacao_followup.gs        ← follow-up automático de leads
├── automacao_monitoramento.gs   ← monitoramento de pipeline e alertas
├── automacao_thaynan.gs         ← configurações do agente Thaynan IA
├── servicos.gs                  ← chamadas externas: GPT Maker, Telegram, Drive, Z-API
├── auth.gs                      ← autenticação por token, controle de sessão
├── followup_queue.gs            ← fila de follow-up
├── pdv.gs                       ← PDV (ponto de venda)
├── pwa.gs                       ← PWA manifest e service worker helpers
├── testes.gs                    ← funções de teste (rodar manualmente no GAS)
├── appsscript.json              ← manifest do GAS (runtime V8, scopes OAuth)
│
├── ── Frontend ─────────────────────────────────────────────
├── index.html                   ← SPA completo (~390KB): Kanban CRM + Chat + Modal
├── login.html                   ← tela de login
│
├── ── Firebase Hosting ─────────────────────────────────────
├── firebase-hosting/
│   ├── .firebaserc              ← projeto: crm-milvolts
│   ├── firebase.json            ← public: "public"
│   └── public/
│       └── index.html           ← iframe apontando para URL do GAS WebApp
│
├── ── Intenções GPT Maker ──────────────────────────────────
└── agent_intentions/
    ├── Conferir peças.json      ← versão original (estrutura de referência)
    ├── Conferir pecas v2.json   ← versão nova com campos de veículo separados ← USAR ESTE
    └── response_testes/
        └── exemplo_retorno_api_output.json ← exemplo de payload do webhook
```

---

## 4. REGRAS DE DEPLOY — CRÍTICO

### ⚠️ NUNCA criar nova implantação (deployment). SEMPRE atualizar a existente.

```powershell
# 1. Envia código ao GAS
clasp push

# 2. Atualiza VERSÃO do deployment FIXO (não cria novo)
clasp deploy --deploymentId "AKfycbx3f9I7H8Rgf8eHLKkstVtIEPXTZHfaNVkuSKUX0WSGubP5wvZz1J72onQpNh6E8mw" --description "vXX — descrição"

# 3. Commit e push para GitHub
git add <arquivos>
git commit -m "feat/fix: descrição"
git push

# 4. Firebase (somente se index.html do firebase-hosting/public/ mudar)
Set-Location "C:\dev\crm-milvolts\firebase-hosting"
firebase deploy --only hosting
Set-Location "C:\dev\crm-milvolts"
```

### Ou use o script automatizado:
```powershell
.\deploy.ps1 -Message "vXX — descrição"
```

### Por que o Deployment ID não pode mudar:
- `firebase-hosting/public/index.html` tem o iframe apontando para a URL do GAS
- O GPT Maker (webhook das intenções) aponta para a mesma URL
- Mudar o ID = mudar a URL = tudo quebra sem atualizar Firebase + GPT Maker + outros clientes

---

## 5. SCRIPT PROPERTIES (GAS) — Chaves necessárias

Configure em: GAS Editor → Configurações do projeto → Propriedades do script

| Chave | Descrição |
|---|---|
| `spreadsheet_id` | ID do Google Sheets (banco de dados) |
| `GPTMAKER_API_KEY` | Token da API GPT Maker v2 |
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram |
| `TELEGRAM_CHAT_ID` | ID do grupo/chat Telegram para notificações |
| `AUTH_SECRET` | Segredo para geração de tokens de sessão |
| `ADMIN_EMAIL` | Email do admin (para requireAuth) |

> Nunca colocar esses valores em código ou commitar. Só em Script Properties.

---

## 6. BANCO DE DADOS (Google Sheets)

### Aba CRM (principal)
- ~707+ linhas, 21 colunas fixas + colunas dinâmicas criadas automaticamente
- Chave primária: **Protocolo** (coluna 6 — formato `YYYYMMDDHHMMSS`)

| Col | Nome interno | Descrição |
|---|---|---|
| 1 | estagio_funil | Status do card no Kanban |
| 2 | valor | Valor da oportunidade (R$) |
| 3 | responsavel | Vendedor responsável |
| 4 | chat_id | ID do chat no GPT Maker |
| 5 | prioridade | Baixo / Média / Alta |
| 6 | protocolo | **PK** — gerado pela IA |
| 7 | oportunidade_nome | Nome do card |
| 8 | recipient | Número WhatsApp do cliente |
| 9 | obs | Observações |
| 10 | agente | Fixo: "Thaynan IA" |
| 11 | canal | Canal de entrada |
| 12 | produto | Peça / produto |
| 13 | (interno) | |
| 14 | valor_peca | Valor estimado da peça |
| 15 | tarefa | Título da tarefa |
| 16 | data_tarefa | Data/hora da tarefa |
| 17 | atendente | Nome do atendente |
| 18 | status_tarefa | to_do / doing / done |
| 19 | (vazio) | ID da Oportunidade — nunca implementado |
| 20 | transfPara | Transferido para |
| 21 | origem | orgânico / anuncio / Desconhecido |

### Colunas dinâmicas (criadas automaticamente por `_colByHeader`)
Ficha do cliente: `email`, `genero`, `nascimento`, `cargo`, `empresa`, `cidade`, `estado`, `anotacoesCliente`
Veículo: `marca_veiculo`, `modelo_veiculo`, `ano_veiculo`, `motorizacao_veiculo`

### Outras abas
- **PDV** — ponto de venda, tem colunas Marca/Modelo/Motorização/Ano já estruturadas
- **Logs** — auditoria de ações
- **Transferencias** — histórico de transferências para humano

---

## 7. ARQUITETURA DO SISTEMA

```
WhatsApp (cliente)
    │
    ▼
GPT Maker (Thaynan IA)
    │ webhook POST → GAS URL
    ▼
doPost(e) em codigo.gs
    │
    ├── conferir_pecas → rotaConferirPecas() em automacao_devolver.gs
    │       ├── adicionarLinhaCRM() → Sheets
    │       ├── gptMakerStartHuman() → GPT Maker API
    │       ├── gptMakerEnviarMensagem() → WhatsApp (resumo cotação)
    │       └── telegramEnviarMensagem() → Grupo Telegram
    │
    └── transferir_para_humano → rotaTransferenciaHumano()
            ├── adicionarLinhaTransferencias() → Sheets
            └── telegramEnviarMensagem()

Operador (navegador)
    │ abre https://crm-milvolts.web.app
    ▼
Firebase Hosting → index.html (iframe)
    │
    ▼
GAS WebApp (doGet) → index.html (SPA completo)
    │ google.script.run.*
    ▼
dashboard_servidor.gs → Sheets / GPT Maker API / Drive
```

---

## 8. APIs EXTERNAS

### GPT Maker API v2
- Base URL: `https://api.gptmaker.ai/v2`
- Auth: `Authorization: Bearer <GPTMAKER_API_KEY>`
- Endpoints usados:
  - `POST /chat/{chatId}/send-message` — enviar mensagem/imagem/áudio
  - `POST /chat/{chatId}/start-human` — assumir atendimento
  - `GET /contacts` — buscar contato
- **Regra crítica:** campo `message` é REQUIRED mesmo em envios de mídia. Enviar `message: " "` (espaço) se não houver texto.

### Google Drive
- Upload de imagens/áudios via `DriveApp.createFile()`
- Permissão pública: `DriveApp.Access.ANYONE_WITH_LINK`
- URL de acesso direto (não redireciona para login):
  `https://drive.usercontent.google.com/download?id=FILE_ID&export=download&authuser=0`
- ⚠️ NÃO usar `drive.google.com/uc?export=view&id=...` (redireciona, bloqueado por WhatsApp/Z-API)

### Telegram Bot
- Usado para notificações internas da equipe
- `telegramEnviarMensagem(chatId, mensagem, 'HTML')`

---

## 9. INTENÇÃO "CONFERIR PEÇAS" — GPT Maker

### Versão atual (v2 — importar `Conferir pecas v2.json` no GPT Maker)
Campos de veículo **separados** (não mais um campo combinado):

| Campo | Descrição | Exemplo |
|---|---|---|
| `peca` | Peça(s) desejada(s) | `"Amortecedor dianteiro"` |
| `marca_veiculo` | Fabricante/marca | `"Toyota"` |
| `modelo_veiculo` | Modelo (sem marca/ano) | `"Hilux"` |
| `ano_veiculo` | Ano de fabricação | `"2021"` |
| `motorizacao_veiculo` | Motorização | `"2.8 diesel"` |
| `valor_peca` | Valor estimado (IA define) | `"1200"` |
| `categoria_peca` | Categoria da peça | `"suspensão"` |
| `atendente` | Fixo: "Thaynan" | `"Thaynan"` |
| `obs` | Observações do lead | |
| `prioridade` | Baixo/Média/Alta | |
| `oportunidade_nome` | Nome sugerido para o card | |
| `tarefa` | Tarefa para o humano | |
| `data_tarefa` | Formato `YYYY-MM-DDTHH:MM:SS.MMM-0300` | |
| `status_tarefa` | to_do / doing / done | |
| `protocolo` | Gerado pela IA (data+hora) | |
| `origem` | orgânico / anuncio / Desconhecido | |

### Versão antiga (NÃO usar mais)
Campo `modelo` combinava tudo: `"Hillux LTS 2021 motorização 2.4"` — fraco para estruturação.

---

## 10. FEATURES IMPLEMENTADAS

### v44 (image paste + notificações + badges)
- Envio de imagem via Ctrl+V (paste da clipboard) com preview antes de enviar
- Alerta sonoro (Web Audio API beep) para novas mensagens inbound
- Badge de não lidas nos cards do Kanban (vermelho, pulsante, zera ao abrir)
- Menu de ações expandido: exportar conversa (JSON/TXT), bloquear contato (stub), limpar mensagens (stub)

### v45 (fix HTTP 400 + áudio + painel redesenhado)
- Fix: HTTP 400 do GPT Maker — campo `message` é required. Sempre enviar `message: " "`.
- Fix: URL do Google Drive para imagens/áudio (`drive.usercontent.google.com/download?...`)
- Gravação de áudio (MediaRecorder API) com preview antes de enviar
- Painel esquerdo da modal redesenhado em 3 seções colapsáveis: Ficha do Cliente, Veículo, Negociação
- Colunas dinâmicas na planilha (criadas via `_colByHeader` na primeira edição)

### v46 (campos de veículo estruturados + Ficha colapsada)
- Campo `modelo` da intenção dividido em 4: `marca_veiculo`, `modelo_veiculo`, `ano_veiculo`, `motorizacao_veiculo`
- Nomenclatura unificada em todo o sistema (intenção → webhook → planilha → frontend)
- `adicionarLinhaCRM` salva campos de veículo em colunas dinâmicas automaticamente
- Ficha do Cliente colapsada por padrão — mini-header sempre visível (avatar + nome + WhatsApp)
- Seção Veículo mostra dados vindos do webhook automaticamente

---

## 11. FUNÇÕES-CHAVE DO BACKEND

### `planilha.gs`
- `adicionarLinhaCRM(dados, recipient)` — insere linha no CRM + salva campos dinâmicos de veículo
- `editarCampoCRM(protocolo, campos, authToken)` — atualiza campos por protocolo
- `_colByHeader(sheet, headerName)` — encontra coluna por header; cria se não existir (fundo azul #1D4ED8)
- `atualizarStatusCRM(protocolo, novoStatus, authToken)` — muda status do card

### `dashboard_servidor.gs`
- `getDadosCRM(authToken, filtros)` — retorna todos os cards para o Kanban
- `enviarMensagemModal(chatId, mensagem, authToken)` — envia texto no chat
- `enviarImagemModal(chatId, dataUrl, mimeType, authToken)` — upload Drive + envia imagem
- `enviarAudioModal(chatId, dataUrl, mimeType, authToken)` — upload Drive + envia áudio
- `buscarMensagensChat(chatId, page, authToken)` — histórico de mensagens paginado

### `automacao_devolver.gs`
- `rotaConferirPecas(payload, recipient)` — processa novo orçamento: CRM + start-human + mensagem + Telegram
- `rotaTransferenciaHumano(payload)` — processa transferência: planilha + Telegram

### `servicos.gs`
- `gptMakerEnviarMensagem(chatId, texto)` — POST /send-message com texto
- `gptMakerEnviarImagem(chatId, imageUrl, caption)` — envia imagem via URL do Drive
- `gptMakerEnviarAudio(chatId, audioUrl)` — envia áudio via URL do Drive
- `chamarGPTMaker(method, endpoint, payload)` — wrapper autenticado da API

### `auth.gs`
- `requireAuth(authToken, nivel)` — valida token de sessão, retorna dados do usuário
- Níveis: `'admin'`, `'operador'`, `'viewer'`

---

## 12. FRONTEND — PONTOS-CHAVE DO index.html

### Variáveis globais de estado
- `_CS` — Chat State: `{ chatId, seenIds, messages[], page, maxPage, hasMore, pollTimer, pollBusy }`
- `_pendingImg` — imagem pendente antes de enviar: `{ dataUrl, mime, name }`
- `_unread` — badges não lidas: `{ protocolo → count }`
- `_recorder` — gravador de áudio: `{ stream, media, chunks, timer, seconds, blob, mimeType }`

### Funções-chave do frontend
- `openModal(proto)` — abre modal expandida do card (chat + info)
- `mkSec(id, icon, label, openByDefault, innerHtml)` — cria seção colapsável
- `_miToggleSec(btn)` — toggle de seção via `data-sec` + `style.display`
- `svgIcon(name)` — registro de ícones SVG inline
- `_chatAudio()` — inicia gravação de áudio (MediaRecorder)
- `_notifBeep()` — beep sonoro (Web Audio API) para mensagens novas
- `editarCampoCRM(protocolo, campos)` — salva campos editados no modal

### CSS variables (tema escuro)
- `--bg` fundo principal, `--sf2` superfície secundária, `--bd` borda, `--royal` azul royal
- `--txt` texto principal, `--txt3` texto secundário, `--rd` hover state

---

## 13. ERROS JÁ RESOLVIDOS

| Erro | Causa | Solução |
|---|---|---|
| HTTP 400 GPT Maker ao enviar imagem | `message` field required na API | Sempre enviar `message: caption \|\| ' '` |
| Google Drive URL bloqueada no WhatsApp | `drive.google.com/uc?export=view` redireciona p/ login | Usar `drive.usercontent.google.com/download?id=...&export=download&authuser=0` |
| `mkSec` erro de escaping de string JS | `\'` fora de string literal JS | Usar `data-sec` attribute + `onclick="_miToggleSec(this)"` |
| `_miToggleSec` não funcionava | Função definida como `(id)` mas chamada com `(this)` | Mudar assinatura para `(btn)` + `btn.getAttribute('data-sec')` |
| Deploy criava nova implantação | `clasp deploy` sem `--deploymentId` | SEMPRE usar `--deploymentId <ID_FIXO>` |
| Firebase deploy no projeto errado | `firebase deploy -P` sem `cd` no diretório certo | SEMPRE `Set-Location "C:\dev\crm-milvolts\firebase-hosting"` antes |
| Toggle CSS conflito `.closed` | `.mi-sec-body.closed{display:none}` conflitava | Usar `body.style.display` diretamente, sem classe CSS |

---

## 14. WORKFLOW DIÁRIO

```
1. Editar arquivos .gs ou index.html em C:\dev\crm-milvolts\
2. Testar localmente (funções GAS podem ser testadas no editor)
3. Deploy:
   .\deploy.ps1 -Message "feat: descrição da feature"
   (ou manualmente: clasp push → clasp deploy --deploymentId ... → git commit → git push)
4. Se mudar firebase-hosting/public/index.html:
   Set-Location "C:\dev\crm-milvolts\firebase-hosting"
   firebase deploy --only hosting
   Set-Location "C:\dev\crm-milvolts"
5. Verificar em https://crm-milvolts.web.app
```

---

## 15. SEGURANÇA — REGRAS ABSOLUTAS

1. **Tokens, senhas, IDs sensíveis** → SOMENTE em Script Properties (PropertiesService)
2. **`config.gs`** → gitignored. Usar `config.example.gs` como template público
3. **`.secrets.ps1`** → gitignored. Contém token GitHub para deploy automático
4. **`MEMORY.md`** → commitado no GitHub (documentação), mas NÃO deployado:
   - `.claspignore` tem `*.md` → não vai para o GAS
   - `firebase-hosting/public/` não tem MEMORY.md → não vai para o Firebase
5. **Spreadsheet ID** → em Script Properties como `spreadsheet_id`
6. **NUNCA** commitar: `config.gs`, `.secrets.ps1`, `*.xlsx`, `*.env`, `credentials.*`
