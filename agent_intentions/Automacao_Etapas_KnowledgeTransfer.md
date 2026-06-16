# Automação de Etapa — Knowledge Transfer (CRM + GPT Maker + Google Sheets)

> Documento de transferência de conhecimento para replicar **todo** o sistema de
> automação de etapa do CRM Milvolts em outro sistema da mesma base (Google Apps
> Script + Google Sheets + GPT Maker v2 + frontend HTML servido pelo WebApp).
>
> Cobre: **Follow-ups** (imediato e cadenciado), **Webhooks** para endpoints
> externos, **Fluxo visual** (construtor drag-and-drop em canvas infinito),
> a **fila de cadência** (trigger a cada 1 min), o **disparo ao mover card** e
> as **correções críticas** (start-human antes de enviar, idempotência, campos Date).
>
> No fim há um **prompt pronto (≤3.000 caracteres)** para colar em outra sessão.

---

## 1. Visão geral da arquitetura

```
┌─────────────────────── FRONTEND (index.html) ───────────────────────┐
│  Kanban → mover card  ─→  _dispararAuto(stageId, protocolo)          │
│  Painel "⚡ Automações" (drawer #sap) com 3 abas:                     │
│    • 💬 Follow-ups   • 🔗 Webhooks   • ⚙ Fluxo (canvas visual)        │
│  Config por etapa montada em JS (_sapState.data) e persistida via    │
│  google.script.run.salvarStageAutomation(stageId, data, token)       │
└──────────────────────────────────────────────────────────────────────┘
                │ google.script.run
                ▼
┌─────────────────────── BACKEND (Google Apps Script) ────────────────┐
│  automacao_etapas.gs                                                 │
│    getStageAutomation / salvarStageAutomation  (config JSON na aba   │
│      "configs", chave  stage_auto_<stageId>)                         │
│    executarAutomacaoEtapa(stageId, protocolo, token)  ← chamado ao   │
│      mover. Dispara: followups imediatos + enfileira cadenciados +   │
│      webhooks + fluxo visual.                                        │
│    Handlers: _executarMensagemAuto / _executarWebhookAuto /          │
│      _executarFluxo / _executarStep(+email/telegram)                 │
│  followup_queue.gs                                                   │
│    Fila na aba "followup_queue"; triggerFollowUpQueue() roda a cada  │
│      1 min, dispara os pendentes vencidos, para ao responder.        │
│  servicos.gs  (GPT Maker v2)                                         │
│    gptMakerStartHuman / gptMakerEnviarMensagem / gptMakerStopHuman / │
│    gptMakerGerarResposta                                             │
└──────────────────────────────────────────────────────────────────────┘
                │
                ▼  Google Sheets (banco)  +  GPT Maker API (WhatsApp)
```

**Princípios de design**
- Toda config por etapa vive em **uma chave** na aba `configs`: `stage_auto_<stageId>` = JSON.
- O frontend monta o objeto inteiro e envia; o backend só faz `JSON.stringify`/`parse`.
- Follow-up **imediato** roda síncrono no move; **cadenciado** vai para uma fila processada por time-trigger.
- Disparo é **fire-and-forget** no frontend (não bloqueia a UI).

---

## 2. Modelo de dados

### 2.1 Config de automação por etapa (JSON)

Salva em `configs` → chave `stage_auto_<stageId>`:

```json
{
  "followups": [
    {
      "id": "fu_1718000000000",
      "ativo": true,
      "nome": "Follow-up 1",
      "texto": "Oi {{nome_cliente}}, ainda garanto esse preço de {{produto}}!",
      "usar_ia": false,
      "imediato": true,
      "intervalo_minutos": 30,
      "max_ocorrencias": 3,
      "parar_ao_responder": true,
      "reatribuir_ia": true
    }
  ],
  "webhooks": [
    {
      "id": "wh_1718000000000",
      "nome": "Notificar ERP",
      "ativo": true,
      "endpoint": "https://exemplo.com/hook",
      "metodo": "POST",
      "campos": ["nome_cliente", "produto", "valor"],
      "headers": "{\"Authorization\":\"Bearer TOKEN\"}"
    }
  ],
  "fluxo": {
    "nodes": [
      { "id": "trigger_1", "tipo": "trigger", "x": 80,  "y": 80,  "config": {} },
      { "id": "followup_1718...", "tipo": "followup", "x": 80, "y": 200,
        "config": { "texto": "...", "usar_ia": false } }
    ],
    "edges": [ { "id": "e_1718...", "from": "trigger_1", "to": "followup_1718..." } ],
    "viewport": { "x": 40, "y": 40, "scale": 1 }
  }
}
```

**Limites:** até 24 follow-ups e 10 webhooks por etapa.

**Formato legado** (`{mensagem:{...}, webhook:{...}}`) é migrado automaticamente para
`{followups:[], webhooks:[], fluxo:{}}` por `_migrateSapData` (frontend) e tratado
também no backend em `executarAutomacaoEtapa`.

### 2.2 Fila de follow-up (aba `followup_queue`)

```
Colunas: id | card_protocolo | stage_id | fu_id | fu_data_json
         | agendado_para | status | tentativas | ultima_tentativa | criado_em
```

`status`: `pendente` → `enviado` | `erro` | `cancelado_etapa_mudou` |
`cancelado_cliente_respondeu` | `cancelado_manual` | `card_nao_encontrado` | `erro_parse`.

---

## 3. Backend — `automacao_etapas.gs`

### 3.1 Mapa de placeholders → colunas do card

Permite usar `{{chave}}` (e `{chave}`) nos textos. Cada chave canônica tem uma lista
de aliases (nomes possíveis na planilha); usa o primeiro não-vazio.

```javascript
var CARD_PLACEHOLDER_MAP = {
  nome_cliente:     ['Nome do Cliente', 'nome_cliente', 'nome', 'Nome', 'Cliente'],
  whatsapp_cliente: ['WhatsApp', 'whatsapp', 'Telefone', 'telefone', 'recipient', 'Contato'],
  contato_id:       ['Contato', 'contato', 'chat_id', 'contextId'], // chatId GPT Maker (channelId-phone)
  protocolo:        ['Protocolo', 'protocolo'],
  nome_oportunidade:['Nome da Oportunidade', 'nome_oportunidade', 'oportunidade', 'Oportunidade'],
  status:           ['Status', 'status'],
  prioridade:       ['Prioridade', 'prioridade'],
  origem:           ['Origem', 'origem'],
  responsavel:      ['Responsável', 'responsavel'],
  agente:           ['Agente', 'agente'],
  transferido_para: ['Transferido para', 'transfPara', 'transferido_para'],
  canal:            ['Canal', 'canal'],
  observacoes:      ['Observação', 'Observações', 'observacoes', 'obs'],
  produto:          ['Nome do Produto/Serviço', 'produto', 'Produto'],
  quantidade:       ['Qtd.', 'Qtd', 'quantidade', 'Quantidade', 'qtd'],
  preco_unitario:   ['Preço Unit. (R$)', 'Preço Unitário', 'precoUnit', 'preco_unitario'],
  valor:            ['Valor', 'valor'],
  titulo_tarefa:    ['Título da Tarefa', 'titTarefa', 'titulo_tarefa', 'Tarefa'],
  data_tarefa:      ['Data da Tarefa', 'dataTarefa', 'data_tarefa'],
  atribuicao_tarefa:['Atribuição da Tarefa', 'atribuicao', 'atribuicao_tarefa'],
  status_tarefa:    ['Status da Tarefa', 'statusTarefa', 'status_tarefa'],
};
```

### 3.2 CRUD da config

```javascript
function getStageAutomation(stageId, authToken) {
  requireAuth(authToken, 'admin');
  if (!stageId) throw new Error('stageId obrigatório.');
  var raw = getConfigs()['stage_auto_' + stageId];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(e) { return null; }
}

function salvarStageAutomation(stageId, config, authToken) {
  var sessao = requireAuth(authToken, 'admin');
  if (!stageId) throw new Error('stageId obrigatório.');
  if (!config || typeof config !== 'object') throw new Error('config inválida.');
  salvarConfig('stage_auto_' + stageId, JSON.stringify(config));
  registrarLog('stage_auto_salva', 'ok', { stageId: stageId }, '', { usuario: sessao.email });
  return { ok: true };
}
```

### 3.3 Orquestrador — `executarAutomacaoEtapa`

Chamado ao mover o card. Resolve a config, busca o card por protocolo, e dispara:
follow-ups imediatos (síncrono), follow-ups com intervalo (enfileira), webhooks e fluxo.

```javascript
function executarAutomacaoEtapa(stageId, protocolo, authToken) {
  requireAuth(authToken, 'operador');
  if (!stageId || !protocolo) return { ok: false, motivo: 'parametros_invalidos' };

  var raw = getConfigs()['stage_auto_' + stageId];
  if (!raw) return { ok: true, motivo: 'sem_automacao_configurada' };
  var cfg; try { cfg = JSON.parse(raw); } catch(e) { return { ok:false, motivo:'config_invalida' }; }

  var card = _buscarCardPorProtocolo(protocolo);
  if (!card) return { ok: false, motivo: 'card_nao_encontrado' };

  var resultados = [], erros = [];

  // migração de formato legado
  var followups = cfg.followups || [];
  var webhooks  = cfg.webhooks  || [];
  if (!followups.length && cfg.mensagem && cfg.mensagem.ativa && cfg.mensagem.texto)
    followups = [{ ativo:true, texto:cfg.mensagem.texto, usar_ia:!!cfg.mensagem.usar_ia, imediato:true }];
  if (!webhooks.length && cfg.webhook && cfg.webhook.ativo && cfg.webhook.endpoint)
    webhooks = [cfg.webhook];

  // A) follow-ups imediatos
  followups.forEach(function(fu, i) {
    if (!fu.ativo || !fu.texto || !fu.imediato) return;
    var r = _executarMensagemAuto(card, fu, stageId);
    resultados.push({ tipo:'followup_imediato', idx:i, resultado:r });
    if (!r.ok) erros.push('followup['+i+']: '+r.motivo);
  });

  // B) follow-ups com intervalo → fila
  if (followups.some(function(fu){ return fu.ativo && !fu.imediato; })) {
    try { resultados.push({ tipo:'followup_enfileirado',
            resultado:_enqueueFollowUpsInternal(stageId, protocolo, cfg) }); }
    catch(e){ erros.push('followup_queue: '+e.message); }
  }

  // C) webhooks
  webhooks.forEach(function(wh, i) {
    if (!wh.ativo || !wh.endpoint) return;
    var r = _executarWebhookAuto(card, wh, stageId);
    resultados.push({ tipo:'webhook', idx:i, resultado:r });
    if (!r.ok) erros.push('webhook['+i+']: '+r.motivo);
  });

  // D) fluxo visual (>1 nó porque trigger está no index 0)
  var fluxoNodes = cfg.fluxo && cfg.fluxo.nodes ? cfg.fluxo.nodes : (Array.isArray(cfg.fluxo)?cfg.fluxo:[]);
  if (fluxoNodes.length > 1) {
    var rF = _executarFluxo(card, fluxoNodes, stageId);
    resultados.push({ tipo:'fluxo', resultado:rF });
    if (!rF.ok) erros.push('fluxo: '+rF.motivo);
  }

  registrarLog('auto_etapa_executada', erros.length?'parcial':'ok',
    { stageId:stageId, protocolo:protocolo, resultados:resultados }, protocolo);
  return { ok: erros.length === 0, resultados: resultados, erros: erros };
}
```

### 3.4 Handler de mensagem — **com a correção crítica (start-human)**

> ⚠️ **A lição mais importante do projeto.** O endpoint `POST /chat/{chatId}/send-message`
> do GPT Maker só envia como **atendente humano** se o chat estiver em **modo humano**.
> Sem chamar `start-human` ANTES, o GPT Maker trata a mensagem como **inbound
> (cliente→agente)**, podendo aparecer no lado errado e/ou criar um novo chat.
> O caminho `usar_ia` usa `/agent/{id}/conversation`, que já sai como o agente — esse
> NÃO leva start-human.

```javascript
function _executarMensagemAuto(card, cfg, stageId) {
  try {
    var gm = getGPTMakerConfig_();
    if (!gm.apiKey)    return { ok:false, motivo:'gptmaker_api_key_nao_configurado' };
    if (!gm.channelId) return { ok:false, motivo:'gptmaker_channel_id_nao_configurado' };

    var chatId = _buildChatId(card, gm.channelId);
    if (!chatId) return { ok:false, motivo:'telefone_nao_encontrado_no_card' };

    var texto = _substituirPlaceholders(cfg.texto, card);

    if (cfg.usar_ia) {
      // IA gera e ENVIA via /agent/{id}/conversation — já sai como o agente; sem start-human.
      gptMakerGerarResposta(chatId, texto);
    } else {
      // Envio direto: assumir o atendimento ANTES de enviar (senão vira inbound/novo chat).
      try { gptMakerStartHuman(chatId); } catch(eSh) { /* segue com envio */ }
      gptMakerEnviarMensagem(chatId, texto);
    }

    // Reatribuir para a IA = stop-human (devolve ao bot). NÃO finaliza o atendimento.
    if (cfg.reatribuir_ia === true) {
      try { gptMakerStopHuman(chatId); } catch(eIa) { /* mensagem já foi */ }
    }
    return { ok: true };
  } catch(e) { return { ok:false, motivo:e.message }; }
}
```

### 3.5 Handler de webhook

Monta um body rico com todos os campos do card (ou só os de `cfg.campos`), faz o
`UrlFetchApp.fetch` com método/headers configurados, valida HTTP 2xx.

```javascript
function _executarWebhookAuto(card, cfg, stageId) {
  try {
    if (!cfg.endpoint) return { ok:false, motivo:'endpoint_vazio' };
    var filtro = cfg.campos && cfg.campos.length ? cfg.campos : null;
    var _campo = function(k){ return filtro && filtro.indexOf(k)===-1 ? '' : String(_getCardField(card,k)||''); };

    var body = { etapa: stageId, timestamp: new Date().toISOString() };
    ['nome_cliente','whatsapp_cliente','contato_id','protocolo','nome_oportunidade',
     'status','prioridade','origem','responsavel','agente','transferido_para','canal',
     'observacoes','produto','quantidade','preco_unitario','valor','titulo_tarefa',
     'data_tarefa','atribuicao_tarefa','status_tarefa'
    ].forEach(function(k){ body[k] = _campo(k); });

    var options = { method:(cfg.metodo||'POST').toLowerCase(), contentType:'application/json',
                    payload:JSON.stringify(body), muteHttpExceptions:true };
    if (cfg.headers) { try { options.headers = JSON.parse(cfg.headers); } catch(_){} }

    var resp = UrlFetchApp.fetch(cfg.endpoint, options);
    var code = resp.getResponseCode();
    if (code < 200 || code >= 300)
      return { ok:false, motivo:'http_'+code, response:resp.getContentText().substring(0,200) };
    return { ok:true, http:code };
  } catch(e){ return { ok:false, motivo:e.message }; }
}
```

### 3.6 Fluxo visual — execução sequencial

`_executarFluxo` percorre os nós (ignorando `trigger`, `wait`, `condicao` na execução
síncrona) e despacha por tipo via `_executarStep`:

```javascript
function _executarStep(card, step, stageId) {
  switch(step.tipo) {
    case 'mensagem_gpt':
    case 'followup':  return _executarMensagemAuto(card, step.config||{}, stageId);
    case 'telegram':  return _executarStepTelegram(card, step.config||{}, stageId);
    case 'webhook':   return _executarWebhookAuto(card, step.config||{}, stageId);
    case 'email':     return _executarStepEmail(card, step.config||{}, stageId);
    case 'mover_card':return { ok:true, motivo:'mover_card_ignorado_em_entry' };
    case 'wait':      return { ok:true, motivo:'wait_ignorado_execucao_sincrona' };
    case 'condicao':  return { ok:true, motivo:'condicao_ignorada_execucao_sincrona' };
    default:          return { ok:false, motivo:'tipo_desconhecido: '+step.tipo };
  }
}
```

> **Nota:** `wait` e `condicao` são desenhados no canvas mas tratados como no-op na
> execução síncrona (o agendamento real de espera é feito pela fila de follow-up).
> É um bom ponto de evolução futura.

### 3.7 Helpers

```javascript
function _buscarCardPorProtocolo(protocolo) {
  var dados = getDadosCRM();
  for (var i=0;i<dados.length;i++)
    if (String(dados[i].protocolo || dados[i]['Protocolo'] || '') === String(protocolo)) return dados[i];
  return null;
}

function _substituirPlaceholders(texto, card) {
  var r = String(texto||'');
  Object.keys(CARD_PLACEHOLDER_MAP).forEach(function(key){
    var v = _getCardField(card, key); var safe = (v!=null)?String(v):'';
    r = r.replace(new RegExp('\\{\\{'+key+'\\}\\}','g'), safe)
         .replace(new RegExp('\\{'+key+'\\}','g'), safe);
  });
  return r;
}

function _getCardField(card, key) {
  var aliases = CARD_PLACEHOLDER_MAP[key] || [key];
  for (var i=0;i<aliases.length;i++){ var v=card[aliases[i]]; if (v!=null && v!=='') return v; }
  return '';
}

// Resolve chatId: usa a coluna "Contato" se parecer um chatId (channelId-phone);
// senão reconstrói channelId + '-' + dígitos do telefone.
function _buildChatId(card, channelId) {
  var contato = String(card['Contato'] || card.contato || '').trim();
  if (contato && contato.indexOf('-') > 10 && contato.length > 15) return contato;
  var phone = card['WhatsApp']||card.whatsapp||card['Telefone']||card.telefone||
              card['recipient']||card.recipient||card['Phone']||card.phone||'';
  var digits = String(phone).replace(/\D/g,'');
  if (digits.length < 8) return null;
  return channelId + '-' + digits;
}
```

---

## 4. Backend — `followup_queue.gs` (cadência)

### 4.1 Enfileirar (chamado ao mover o card / dentro do orquestrador)

```javascript
function _enqueueFollowUpsInternal(stageId, protocolo, autoConfig) {
  if (!autoConfig || !autoConfig.followups || !autoConfig.followups.length) return { enfileirados:0 };
  var sheet = _fqEnsureSheet(); var now = new Date(); var count = 0;
  autoConfig.followups.forEach(function(fu){
    if (!fu.ativo || fu.imediato) return;
    var intervaloMs = (fu.intervalo_minutos||30)*60*1000;
    var maxOc = fu.max_ocorrencias||1;
    for (var occ=1; occ<=maxOc; occ++) {
      var agendadoPara = new Date(now.getTime() + intervaloMs*occ);
      sheet.appendRow([ 'fq_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        protocolo, stageId, fu.id||('fu_'+occ), JSON.stringify(fu),
        agendadoPara.toISOString(), 'pendente', 0, '', now.toISOString() ]);
      count++;
    }
  });
  return { enfileirados: count };
}
```

> Existe também `enqueueFollowUps(...authToken)` (versão chamável do frontend com
> `requireAuth`). A interna é usada dentro de `executarAutomacaoEtapa` para evitar
> revalidar token.

### 4.2 Processador — trigger a cada 1 minuto

```javascript
function triggerFollowUpQueue() {
  var sheet = _fqEnsureSheet();
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  var now = new Date(), h = data[0];
  var iStatus=h.indexOf('status'), iAgenda=h.indexOf('agendado_para'),
      iProto=h.indexOf('card_protocolo'), iStage=h.indexOf('stage_id'),
      iFuData=h.indexOf('fu_data_json'), iTent=h.indexOf('tentativas'),
      iUltima=h.indexOf('ultima_tentativa');
  var processed = 0;

  for (var r=1; r<data.length && processed<30; r++) {
    if (data[r][iStatus] !== 'pendente') continue;
    if (new Date(data[r][iAgenda]) > now) continue;          // ainda não venceu

    var protocolo=String(data[r][iProto]), stageId=String(data[r][iStage]);
    var fuData; try { fuData = JSON.parse(data[r][iFuData]); }
    catch(e){ _fqSetStatus(sheet, r+1, 'erro_parse'); continue; }

    var card = _buscarCardPorProtocolo(protocolo);
    if (!card) { _fqSetStatus(sheet, r+1, 'card_nao_encontrado'); continue; }

    // cancela se o card saiu da etapa
    var etapaAtual = card.etapa || card['Etapa'] || card.stage || '';
    if (etapaAtual && etapaAtual !== stageId) { _fqSetStatus(sheet, r+1, 'cancelado_etapa_mudou'); continue; }

    // stop-on-reply: se o cliente respondeu, cancela a fila inteira do protocolo
    if (fuData.parar_ao_responder && _fqClienteRespondeu(protocolo, stageId)) {
      _fqCancelarTodosCard(sheet, data, protocolo, 'cancelado_cliente_respondeu'); break;
    }

    var resultado = _executarMensagemAuto(card, fuData, stageId);
    _fqSetCellByRow(sheet, r+1, iStatus, resultado.ok?'enviado':'erro');
    _fqSetCellByRow(sheet, r+1, iTent,   (parseInt(data[r][iTent])||0)+1);
    _fqSetCellByRow(sheet, r+1, iUltima, now.toISOString());
    processed++; Utilities.sleep(300); // respeita rate limit
  }
}
```

### 4.3 Setup do trigger (1 min) + parada manual + testes

```javascript
function setupFollowUpQueueTrigger() {            // chamar 1x
  var t = ScriptApp.getProjectTriggers();
  for (var i=0;i<t.length;i++) if (t[i].getHandlerFunction()==='triggerFollowUpQueue') return 'trigger_ja_existe';
  ScriptApp.newTrigger('triggerFollowUpQueue').timeBased().everyMinutes(1).create();
  return 'trigger_criado';
}
function pararFollowUpsCard(protocolo, authToken) { // chamar quando card ganho/perdido
  requireAuth(authToken, 'operador');
  var sheet=_fqEnsureSheet(), data=sheet.getDataRange().getValues();
  return { ok:true, cancelados:_fqCancelarTodosCard(sheet, data, protocolo, 'cancelado_manual') };
}
function testarFollowUpDireto(stageId, fuData, phone, authToken) { /* monta mockCard + _executarMensagemAuto */ }
function testarWebhookDireto(stageId, whData, authToken)         { /* monta mockCard + _executarWebhookAuto */ }
```

> **`_fqClienteRespondeu` é um stub** (retorna `false`). Para ativar o stop-on-reply
> real, consultar `GET /chat/{chatId}/messages` no GPT Maker e verificar se há
> mensagem `role:'user'` após o timestamp do último follow-up enviado.

---

## 5. Backend — funções GPT Maker v2 usadas (`servicos.gs`)

```javascript
function gptMakerStartHuman(chatId)  { return chamarGPTMaker('PUT', '/chat/'+chatId+'/start-human', null); }
function gptMakerStopHuman(chatId)   { return chamarGPTMaker('PUT', '/chat/'+chatId+'/stop-human',  null); }
function gptMakerEnviarMensagem(chatId, mensagem) {
  return chamarGPTMaker('POST', '/chat/'+chatId+'/send-message', { message:mensagem, replyMessageId:'' });
}
function gptMakerGerarResposta(contextId, instrucao) {  // IA gera E envia
  var gm = getGPTMakerConfig_();
  return chamarGPTMaker('POST', '/agent/'+gm.agentId+'/conversation',
    { contextId:String(contextId), prompt:String(instrucao) });
}
```

- `chamarGPTMaker` injeta o header `Authorization: Bearer <token>`. O token e os IDs
  (`channelId`, `agentId`, `workspaceId`) ficam em **Script Properties** — nunca no código.
- `message` é **obrigatório** no `/send-message` (mesmo para mídia → usar `' '`).

---

## 6. Frontend — painel "⚡ Automações" (`index.html`)

### 6.1 HTML do drawer (`#sap`)

```html
<div id="sap">
  <div class="sap-hd">
    <div class="sap-title" id="sap-title">⚡ Automações — Etapa</div>
    <button class="sap-close" onclick="closeSapPanel()">✕</button>
  </div>
  <div class="sap-tabs">
    <div class="sap-tab active" id="sap-tab-fu"   onclick="sapTab('fu')">💬 Follow-ups</div>
    <div class="sap-tab"        id="sap-tab-wh"   onclick="sapTab('wh')">🔗 Webhooks</div>
    <div class="sap-tab"        id="sap-tab-flow" onclick="sapTab('flow')">⚙ Fluxo</div>
  </div>
  <div class="sap-body" id="sap-body">…</div>
  <div class="sap-footer">
    <button onclick="salvarAutomacaoEtapa(this)">💾 Salvar automações</button>
    <button onclick="testarAutomacaoEtapa()">🧪 Testar</button>
  </div>
</div>
```

### 6.2 CSS essencial (drawer + canvas)

```css
#sap{position:fixed;right:0;top:0;bottom:0;width:390px;background:var(--surface);
  border-left:1px solid var(--bd);z-index:560;display:flex;flex-direction:column;
  transform:translateX(100%);visibility:hidden;
  transition:transform .26s cubic-bezier(.4,0,.2,1),visibility 0s linear .26s;}
#sap.open{transform:translateX(0);visibility:visible;transition:transform .26s cubic-bezier(.4,0,.2,1),visibility 0s;}
.sap-tabs{display:flex;border-bottom:1px solid var(--bd);} 
.sap-tab{padding:9px 0;font-size:.72rem;font-weight:600;cursor:pointer;color:var(--txt3);
  border-bottom:2px solid transparent;flex:1;text-align:center;}
.sap-tab.active{color:var(--royal);border-bottom-color:var(--royal);}
.sap-body{padding:14px 18px;overflow-y:auto;flex:1;}
.sap-footer{padding:12px 18px;border-top:1px solid var(--bd);display:flex;gap:8px;}
.sap-ta{width:100%;resize:vertical;min-height:86px;font-size:.75rem;padding:8px 10px;
  border-radius:var(--r);border:1px solid var(--bd);background:var(--sf2);}
.sap-in{width:100%;font-size:.75rem;padding:7px 10px;border-radius:var(--r);
  border:1px solid var(--bd);background:var(--sf2);}
.sap-var{font-size:.64rem;padding:3px 7px;border-radius:99px;background:var(--rd);
  color:var(--royal);cursor:pointer;border:1px solid var(--rg);font-family:monospace;}
.sap-list-card{background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);
  padding:10px 12px;margin-bottom:7px;cursor:pointer;}
.sap-badge.on{background:var(--green);color:#fff;} .sap-badge.off{background:var(--bd);color:var(--txt3);}
.sap-add-btn{width:100%;padding:9px;border-radius:var(--r);border:1px dashed var(--bd);
  background:none;cursor:pointer;font-size:.72rem;color:var(--txt3);}

/* FLOW CANVAS */
#flow-outer{width:100%;height:370px;background:var(--sf2);border:1px solid var(--bd);
  border-radius:var(--r);position:relative;overflow:hidden;cursor:grab;user-select:none;}
#flow-outer.panning{cursor:grabbing;}
#flow-inner{position:absolute;width:3200px;height:2000px;transform-origin:0 0;}
#flow-svg{position:absolute;inset:0;pointer-events:none;overflow:visible;}
.fn{position:absolute;min-width:140px;background:var(--surface);border:1.5px solid var(--bd);
  border-radius:var(--rl);padding:9px 11px 12px;cursor:grab;font-size:.72rem;}
.fn.selected{border-color:var(--royal);box-shadow:0 0 0 2px var(--rg);}
.fn-port{width:10px;height:10px;border-radius:50%;border:2px solid var(--surface);
  position:absolute;cursor:crosshair;}
.fn-port-out{bottom:-5px;left:50%;transform:translateX(-50%);}
.fn-port-in{top:-5px;left:50%;transform:translateX(-50%);}
.flow-tools{position:absolute;bottom:9px;right:9px;display:flex;gap:5px;z-index:10;}
.flow-tb-btn{min-width:28px;height:28px;border-radius:6px;border:1px solid var(--bd);
  background:var(--surface);cursor:pointer;}
#flow-cfg-pop{position:fixed;z-index:700;background:var(--surface);border:1px solid var(--bd);
  border-radius:var(--rl);padding:14px 16px;min-width:230px;max-width:275px;}
```

### 6.3 Estado, constantes e migração

```javascript
var _sapState    = { stageId:'', tab:'fu', data:null };
var _sapEditView = null; // {type:'fu'|'wh', idx:N} — null = lista
var CARD_VARS = [ {k:'nome_cliente',l:'👤 Nome'},{k:'produto',l:'📦 Produto'},
  {k:'valor',l:'💰 Valor'},{k:'protocolo',l:'🔖 Protocolo'},{k:'responsavel',l:'👷 Responsável'},
  {k:'agente',l:'🤖 Agente'},{k:'status',l:'📊 Status'},{k:'prioridade',l:'⚡ Prioridade'},
  {k:'canal',l:'📡 Canal'},{k:'origem',l:'🔍 Origem'},{k:'observacoes',l:'📝 Obs'},{k:'tarefa',l:'✅ Tarefa'} ];
var FLOW_NODE_DEFS = [
  {tipo:'trigger', icon:'⚡',label:'Entra na etapa',  color:'#6366F1'},
  {tipo:'followup',icon:'💬',label:'Enviar Follow-up',color:'#0EA5E9'},
  {tipo:'wait',    icon:'⏱',label:'Aguardar',         color:'#F59E0B'},
  {tipo:'webhook', icon:'🔗',label:'Chamar Webhook',   color:'#8B5CF6'},
  {tipo:'telegram',icon:'📨',label:'Telegram',         color:'#3B82F6'},
  {tipo:'email',   icon:'✉', label:'Enviar E-mail',    color:'#EC4899'},
  {tipo:'condicao',icon:'🔀',label:'Condição',         color:'#F97316'} ];

function _sapDefaultData(){ return { followups:[], webhooks:[], fluxo:{nodes:[],edges:[],viewport:{x:0,y:0,scale:1}} }; }
function _migrateSapData(old){ /* converte {mensagem,webhook} legado → {followups[],webhooks[],fluxo} */ }
```

### 6.4 Abrir/fechar/abas

```javascript
function openSapPanel(stageId) {
  _sapState = { stageId:stageId, tab:'fu', data:null }; _sapEditView=null;
  document.getElementById('sap-title').textContent = '⚡ Automações — ' + (label||stageId);
  document.getElementById('sap').classList.add('open');
  _renderSapBody();
  google.script.run
    .withSuccessHandler(function(cfg){ _sapState.data=_migrateSapData(cfg); _renderSapBody(); })
    .withFailureHandler(function(){ _sapState.data=_sapDefaultData(); _renderSapBody(); })
    .getStageAutomation(stageId, S.authToken);
}
function closeSapPanel(){ document.getElementById('sap').classList.remove('open'); }
function sapTab(tab){ _sapState.tab=tab; _sapEditView=null; /* atualiza .active */ _renderSapBody(); }
function _renderSapBody(){
  var body=document.getElementById('sap-body');
  if (_sapState.tab==='fu')   return _sapEditView&&_sapEditView.type==='fu' ? _renderFuEditForm(body,_sapEditView.idx) : _renderFuList(body);
  if (_sapState.tab==='wh')   return _sapEditView&&_sapEditView.type==='wh' ? _renderWhEditForm(body,_sapEditView.idx) : _renderWhList(body);
  if (_sapState.tab==='flow') return _renderFlowTab(body);
}
```

### 6.5 Follow-ups — lista + formulário

- `_renderFuList` desenha cards clicáveis (nome, badge ativo, timing ⚡imediato ou ⏱Xmin×N).
- `_sapAddFu` cria com defaults (`imediato: idx===0`, `intervalo_minutos:30`, `max_ocorrencias:3`, `parar_ao_responder:true`). Limite 24.
- `_renderFuEditForm` campos: nome, status, **textarea com chips de variáveis** (`_sapInsertVarFu`), checkbox "Usar IA", bloco de cadência (`⚡ imediato` ↔ intervalo/repetições/parar-ao-responder) e checkbox **"🤖 Reatribuir conversa para a IA"** (`reatribuir_ia`).
- `_sapSaveFu` valida intervalo 5–60 e repetições 1–24; grava no `_sapState.data` (não persiste ainda).
- `_sapTestarFu` pede um número e chama `testarFollowUpDireto`.

### 6.6 Webhooks — lista + formulário

- `_renderWhList` / `_sapAddWh` (limite 10) / `_renderWhEditForm`: nome, status, método (POST/GET/PUT), endpoint, **checkboxes de campos** (todos por padrão; botões Todos/Nenhum), headers (JSON opcional).
- `_sapSaveWh` coleta `.sap-wh-campo:checked`. `_sapTestarWh` salva e chama `testarWebhookDireto`.

### 6.7 Construtor de fluxo visual (canvas infinito)

```javascript
var _flow = { pan:{x:40,y:40}, scale:1, dragging:null, panning:false,
              panStart:{}, connecting:null, selected:null, docBound:false };

function _renderFlowTab(body){ /* monta #flow-outer > #flow-inner > #flow-svg + toolbar (zoom/fit/add) */ _flowInit(); }

function _flowInit(){
  var f = _sapState.data.fluxo || (_sapState.data.fluxo={nodes:[],edges:[],viewport:{x:40,y:40,scale:1}});
  if (!f.nodes.find(n=>n.tipo==='trigger')) f.nodes.unshift({id:'trigger_1',tipo:'trigger',x:80,y:80,config:{}});
  _flow.pan={x:f.viewport.x,y:f.viewport.y}; _flow.scale=f.viewport.scale||1;
  _flowRender(); _flowBindCanvasEvents();
  if (!_flow.docBound){ _flow.docBound=true;
    document.addEventListener('mousemove',_flowOnDocMove);
    document.addEventListener('mouseup',_flowOnDocUp); }
}
```

Pontos-chave do canvas:
- **Render** (`_flowRender`): aplica `translate(panX,panY) scale(s)` no `#flow-inner`; desenha cada nó (`.fn`) com porta **out** (embaixo) e **in** (em cima), e as **edges** como `path` Bézier SVG com seta.
- **Pan**: mousedown no fundo → `_flow.panning`; move atualiza `_flow.pan`.
- **Drag de nó**: mousedown em `.fn` → `_flow.dragging`; move atualiza `node.x/y` (dividido por `scale`).
- **Conectar**: mousedown numa porta `out` arma `_flow.connecting=nodeId`; mouseup/мousedown numa porta `in` de outro nó cria a edge `{from,to}` (evita duplicar).
- **Zoom** (`_flowZoom`): roda do mouse ou botões; escala 0.25–2.5 ancorada no cursor.
- **Fit** (`_flowFitView`): reposiciona o pan para o nó mais ao topo-esquerda.
- **Add** (`_flowAddNode`): cria nó do tipo do `<select>`, posiciona abaixo do último e auto-conecta.
- **Config do nó** (`_flowOpenCfg`/`_flowSaveNodeCfg`): popover `#flow-cfg-pop` com campos por tipo
  (followup→texto+IA, wait→minutos, webhook→endpoint, telegram→texto, email→para+assunto, condicao→select).
- **Del** (`_flowDelNode`): remove o nó e todas as edges ligadas (trigger não pode ser removido).

### 6.8 Coletar, salvar e disparar

```javascript
function _sapCollect(){
  if (_sapState.data&&_sapState.data.fluxo)
    _sapState.data.fluxo.viewport={x:_flow.pan.x,y:_flow.pan.y,scale:_flow.scale};
  return _sapState.data || _sapDefaultData();
}
function salvarAutomacaoEtapa(btn){
  google.script.run
    .withSuccessHandler(function(){ toast('Automações salvas!','ok'); })
    .withFailureHandler(function(e){ toast('Erro ao salvar: '+e.message,'erro'); })
    .salvarStageAutomation(_sapState.stageId, _sapCollect(), S.authToken);
}

// Disparo ao mover o card (fire-and-forget) — chamado em quickActK, quickNavK e no drop do kanban:
function _dispararAuto(stageId, protocolo){
  google.script.run
    .withSuccessHandler(function(res){ /* log */ })
    .withFailureHandler(function(e){ /* log */ })
    .executarAutomacaoEtapa(stageId, protocolo, S.authToken);
}
```

Pontos de chamada de `_dispararAuto(stageId, protocolo)`: ações rápidas do card
(`quickActK`), navegação de etapa (`quickNavK`) e **drop do Kanban** (após o update
de status retornar `ok`).

---

## 7. Ordem de implementação recomendada

1. **Backend base**: garantir `getConfigs()`, `salvarConfig()`, `requireAuth()`,
   `registrarLog()`, `getDadosCRM()` e `getGPTMakerConfig_()` (token/IDs em Script Properties).
2. **GPT Maker service** (`servicos.gs`): `gptMakerStartHuman/StopHuman/EnviarMensagem/GerarResposta` + `chamarGPTMaker`.
3. **`automacao_etapas.gs`**: `CARD_PLACEHOLDER_MAP`, CRUD, `executarAutomacaoEtapa`,
   handlers (`_executarMensagemAuto` **com start-human**, `_executarWebhookAuto`,
   `_executarFluxo`/`_executarStep`/email/telegram), helpers.
4. **`followup_queue.gs`**: schema, `_fqEnsureSheet`, enqueue, `triggerFollowUpQueue`,
   setup/stop/test. Rodar `setupFollowUpQueueTrigger()` 1x.
5. **Frontend**: CSS (#sap + flow), HTML do drawer, JS (estado/migração/abas,
   follow-up list+form, webhook list+form, canvas de fluxo, collect/save).
6. **Integração com o Kanban**: `openSapPanel(stageId)` no menu da coluna e
   `_dispararAuto(stageId, protocolo)` em todo move/drop/ação-rápida.
7. **Idempotência** na criação de card (ver §8) e **formato texto** nas colunas dinâmicas.

---

## 8. Pitfalls / lições aprendidas (críticas)

1. **start-human ANTES de send-message** — sem assumir o chat, a mensagem direta vira
   inbound (cliente→agente) e/ou cria novo chat. O caminho `usar_ia` (`/conversation`)
   NÃO leva start-human. (§3.4)
2. **stop-human = reatribuir à IA, não finalizar.** A "finalização" percebida vinha do
   chat errado, não do stop-human.
3. **Idempotência:** o webhook do GPT Maker pode disparar 2x. Antes de criar card,
   verificar se o `protocolo` já existe (coluna F) e ignorar duplicata.
4. **Campos dinâmicos viram Date:** o Sheets auto-converte; ao gravar colunas dinâmicas
   (ex.: motorização), forçar `setNumberFormat('@')` e `setValue(String(v))`; ao ler,
   ignorar `instanceof Date`.
5. **Trigger de fila precisa ser criado 1x** (`setupFollowUpQueueTrigger`). Sem ele, só
   o follow-up imediato funciona; os cadenciados ficam `pendente` para sempre.
6. **`message` é obrigatório** no `/send-message` (mídia → `' '`).
7. **Tokens/IDs sempre em Script Properties** — nunca no código nem na planilha.
8. **Fluxo síncrono ignora `wait`/`condicao`** — são visuais; a espera real é a fila.
9. **stop-on-reply é stub** (`_fqClienteRespondeu` retorna false) — implementar consulta
   ao histórico GPT Maker para ativar.
10. **Disparo é fire-and-forget** — não bloquear a UI nem mostrar erro ao operador; logar.

---

## 9. PROMPT PRONTO (≤3.000 caracteres) — colar em outra sessão

```
Implemente AUTOMAÇÃO DE ETAPA num CRM Kanban em Google Apps Script (.gs) + Google Sheets + GPT Maker v2 (WhatsApp) + frontend HTML no WebApp. Cada etapa tem 3 automações num drawer lateral, disparadas ao mover o card.

DADOS: config de cada etapa em UMA chave da aba "configs": stage_auto_<stageId> = JSON { followups:[], webhooks:[], fluxo:{nodes,edges,viewport} }. Máx 24 follow-ups e 10 webhooks/etapa. Placeholders {{chave}} mapeados a colunas via CARD_PLACEHOLDER_MAP (nome_cliente, produto, valor, protocolo, contato_id…, com aliases).

BACKEND automacao_etapas.gs:
- get/salvarStageAutomation: JSON.parse/stringify na aba configs (requireAuth admin).
- executarAutomacaoEtapa(stageId,protocolo,token): acha config+card por protocolo; (A) dispara follow-ups imediatos; (B) enfileira os cadenciados; (C) webhooks; (D) fluxo visual. Migra legado {mensagem,webhook}.
- _executarMensagemAuto(card,cfg,stageId): chatId via _buildChatId (coluna "Contato" se for channelId-phone, senão channelId+'-'+digitos). CRÍTICO: se usar_ia=false, chamar gptMakerStartHuman(chatId) ANTES de gptMakerEnviarMensagem — sem isso a msg vira inbound (cliente→agente) e/ou cria novo chat. Se usar_ia=true, gptMakerGerarResposta (/agent/{id}/conversation) SEM start-human. Se reatribuir_ia, gptMakerStopHuman depois (devolve à IA, NÃO finaliza).
- _executarWebhookAuto: body com campos do card (ou cfg.campos)+etapa+timestamp; UrlFetchApp.fetch; valida HTTP 2xx.
- _executarFluxo: percorre nodes por tipo (followup/webhook/telegram/email); wait/condicao = no-op síncrono.

BACKEND followup_queue.gs: aba "followup_queue" (id,card_protocolo,stage_id,fu_id,fu_data_json,agendado_para,status,tentativas,ultima_tentativa,criado_em). enqueue: 1 linha por ocorrência (intervalo*occ). triggerFollowUpQueue() a cada 1 min (criar via setupFollowUpQueueTrigger 1x): dispara pendentes vencidos com _executarMensagemAuto, cancela se card mudou de etapa, para a fila se cliente respondeu. Validar intervalo 5–60min e repetições 1–24.

FRONTEND index.html: drawer #sap, abas Follow-ups/Webhooks/Fluxo, _sapState={stageId,tab,data}. Follow-up form: nome, status, textarea com chips de variáveis, "Usar IA", cadência (imediato ↔ intervalo/repetições/parar-ao-responder), "Reatribuir p/ IA". Webhook form: metodo (POST/GET/PUT), endpoint, checkboxes de campos, headers JSON. FLUXO VISUAL: canvas infinito (#flow-outer>#flow-inner+SVG): pan (arrastar fundo), zoom na roda 0.25–2.5 no cursor, nós .fn arrastáveis com portas in(topo)/out(base), conectar out→in cria edge Bézier SVG com seta, popover de config por tipo de nó, botões zoom/fit/add. Persistir via salvarStageAutomation(_sapCollect()). Disparar _dispararAuto(stageId,protocolo) fire-and-forget em todo move/drop/ação do Kanban.

REGRAS: tokens/IDs do GPT Maker só em Script Properties; idempotência ao criar card (ignorar protocolo duplicado); colunas dinâmicas com setNumberFormat('@')+String() p/ não virarem Date; "message" obrigatório no /send-message.
```

---

*Fim do documento — Automação de Etapa Knowledge Transfer · CRM Milvolts LTDA*
