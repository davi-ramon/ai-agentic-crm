/**
 * ============================================================
 *  AUTOMACAO_ETAPAS.GS
 *  Automações por Etapa — disparo instantâneo ao card entrar
 *
 *  Cada etapa do Kanban pode ter:
 *    A) Mensagem automática via GPT Maker (WhatsApp)
 *    B) Chamada de webhook/API externa (POST / GET / PUT)
 *    C) Fluxo de passos customizados
 *
 *  Config armazenada em configs sheet: stage_auto_<stageId> = JSON
 *  CRM + Dashboard | Milvolts LTDA
 * ============================================================
 */

/**
 * Mapeamento de placeholders → campos do card CRM.
 * Aceita {{chave}} e {chave} nos templates de mensagem.
 *
 * Cada entrada: chave_canonica → [lista de aliases na planilha, em ordem de prioridade]
 * O primeiro alias que retornar valor não-vazio é usado.
 */
var CARD_PLACEHOLDER_MAP = {
  // ── Dados do cliente ──────────────────────────────────
  nome_cliente:     ['Nome do Cliente', 'nome_cliente', 'nome', 'Nome', 'Cliente'],
  whatsapp_cliente: ['WhatsApp', 'whatsapp', 'Telefone', 'telefone', 'recipient', 'Contato'],
  contato_id:       ['Contato', 'contato', 'chat_id', 'contextId'],   // chatId GPT Maker (channelId-phone)

  // ── Dados da oportunidade ─────────────────────────────
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

  // ── Dados do produto ──────────────────────────────────
  produto:          ['Nome do Produto/Serviço', 'produto', 'Produto'],
  quantidade:       ['Qtd.', 'Qtd', 'quantidade', 'Quantidade', 'qtd'],
  preco_unitario:   ['Preço Unit. (R$)', 'Preço Unitário', 'precoUnit', 'preco_unitario'],
  valor:            ['Valor', 'valor'],

  // ── Dados da tarefa ───────────────────────────────────
  titulo_tarefa:    ['Título da Tarefa', 'titTarefa', 'titulo_tarefa', 'Tarefa'],
  data_tarefa:      ['Data da Tarefa', 'dataTarefa', 'data_tarefa'],
  atribuicao_tarefa:['Atribuição da Tarefa', 'atribuicao', 'atribuicao_tarefa'],
  status_tarefa:    ['Status da Tarefa', 'statusTarefa', 'status_tarefa'],
};

// ──────────────────────────────────────────────────────────────
//  CRUD — leitura e gravação de config por etapa
// ──────────────────────────────────────────────────────────────

/**
 * Lê a config de automação de uma etapa.
 * @param {string} stageId  ex: 'conferir_pecas'
 * @param {string} authToken
 * @returns {Object|null}
 */
function getStageAutomation(stageId, authToken) {
  requireAuth(authToken, 'admin');
  if (!stageId) throw new Error('stageId obrigatório.');
  var raw = getConfigs()['stage_auto_' + stageId];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(e) {
    Logger.log('[AUTO-ETAPA] Erro ao parsear config de '+stageId+': '+e.message);
    return null;
  }
}

/**
 * Salva a config de automação de uma etapa.
 * @param {string} stageId
 * @param {Object} config  {followups:[{...}], webhooks:[{...}], fluxo:{nodes,edges,viewport}}
 *                         Aceita também formato legado {mensagem,webhook,fluxo} — migrado automaticamente.
 * @param {string} authToken
 */
function salvarStageAutomation(stageId, config, authToken) {
  var sessao = requireAuth(authToken, 'admin');
  if (!stageId) throw new Error('stageId obrigatório.');
  if (!config || typeof config !== 'object') throw new Error('config inválida.');
  salvarConfig('stage_auto_' + stageId, JSON.stringify(config));
  registrarLog('stage_auto_salva', 'ok', { stageId: stageId }, '', { usuario: sessao.email });
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────
//  EXECUÇÃO — chamada pelo front-end após move bem-sucedido
// ──────────────────────────────────────────────────────────────

/**
 * Executa a automação configurada para uma etapa.
 * Chamada de forma assíncrona (fire-and-forget) pelo front-end.
 *
 * @param {string} stageId    etapa de destino
 * @param {string} protocolo  protocolo do card
 * @param {string} authToken
 * @returns {Object} {ok, resultados, erros, motivo}
 */
function executarAutomacaoEtapa(stageId, protocolo, authToken) {
  requireAuth(authToken, 'operador');
  Logger.log('[AUTO-ETAPA] ▶ executarAutomacaoEtapa stageId="'+stageId+'" protocolo="'+protocolo+'"');

  if (!stageId || !protocolo) {
    Logger.log('[AUTO-ETAPA] ✗ Parâmetros inválidos.');
    return { ok: false, motivo: 'parametros_invalidos' };
  }

  var raw = getConfigs()['stage_auto_' + stageId];
  if (!raw) {
    Logger.log('[AUTO-ETAPA] ℹ Nenhuma automação configurada para etapa "'+stageId+'".');
    return { ok: true, motivo: 'sem_automacao_configurada' };
  }
  Logger.log('[AUTO-ETAPA] ✓ Config encontrada para "'+stageId+'" ('+raw.length+' chars).');

  var cfg;
  try { cfg = JSON.parse(raw); } catch(e) {
    Logger.log('[AUTO-ETAPA] ✗ Erro ao parsear config: '+e.message);
    return { ok: false, motivo: 'config_invalida: ' + e.message };
  }
  Logger.log('[AUTO-ETAPA] Config: followups='+(cfg.followups||[]).length+' webhooks='+(cfg.webhooks||[]).length);

  var card = _buscarCardPorProtocolo(protocolo);
  if (!card) {
    Logger.log('[AUTO-ETAPA] ✗ Card não encontrado para protocolo "'+protocolo+'".');
    return { ok: false, motivo: 'card_nao_encontrado' };
  }
  Logger.log('[AUTO-ETAPA] ✓ Card encontrado. Campos: '+JSON.stringify(Object.keys(card)));
  Logger.log('[AUTO-ETAPA]   Contato="'+(card['Contato']||card.contato||'')+'" WhatsApp="'+(card['WhatsApp']||card.whatsapp||'')+'"');

  var resultados = [];
  var erros = [];

  // ── Migração de formato legado ──────────────────────────────
  // Suporte a config antiga (mensagem/webhook single) e nova (followups[]/webhooks[])
  var followups = cfg.followups || [];
  var webhooks  = cfg.webhooks  || [];

  if (!followups.length && cfg.mensagem && cfg.mensagem.ativa && cfg.mensagem.texto) {
    // formato legado — single mensagem
    followups = [{ ativo: true, texto: cfg.mensagem.texto, usar_ia: !!cfg.mensagem.usar_ia, imediato: true }];
  }
  if (!webhooks.length && cfg.webhook && cfg.webhook.ativo && cfg.webhook.endpoint) {
    // formato legado — single webhook
    webhooks = [cfg.webhook];
  }

  // ── A) Follow-ups imediatos via GPT Maker ──────────────────
  followups.forEach(function(fu, i) {
    if (!fu.ativo || !fu.texto) return;
    if (!fu.imediato) return; // não-imediatos são gerenciados pela fila (followup_queue.gs)
    var rMsg = _executarMensagemAuto(card, fu, stageId);
    resultados.push({ tipo: 'followup_imediato', idx: i, resultado: rMsg });
    if (!rMsg.ok) erros.push('followup[' + i + ']: ' + rMsg.motivo);
  });

  // ── B) Follow-ups com intervalo → enfileirar ───────────────
  var hasDelayed = followups.some(function(fu){ return fu.ativo && !fu.imediato; });
  if (hasDelayed) {
    try {
      // authToken não disponível aqui (já validado acima) — usamos bypass interno
      var fqResult = _enqueueFollowUpsInternal(stageId, protocolo, cfg);
      resultados.push({ tipo: 'followup_enfileirado', resultado: fqResult });
    } catch(e) {
      erros.push('followup_queue: ' + e.message);
    }
  }

  // ── C) Webhooks ────────────────────────────────────────────
  webhooks.forEach(function(wh, i) {
    if (!wh.ativo || !wh.endpoint) return;
    var rWh = _executarWebhookAuto(card, wh, stageId);
    resultados.push({ tipo: 'webhook', idx: i, resultado: rWh });
    if (!rWh.ok) erros.push('webhook[' + i + ']: ' + rWh.motivo);
  });

  // ── D) Fluxo visual (nodes/edges) ─────────────────────────
  var fluxoNodes = cfg.fluxo && cfg.fluxo.nodes ? cfg.fluxo.nodes : (Array.isArray(cfg.fluxo) ? cfg.fluxo : []);
  if (fluxoNodes.length > 1) { // >1 porque trigger sempre está no index 0
    var rFlow = _executarFluxo(card, fluxoNodes, stageId);
    resultados.push({ tipo: 'fluxo', resultado: rFlow });
    if (!rFlow.ok) erros.push('fluxo: ' + rFlow.motivo);
  }

  registrarLog('auto_etapa_executada', erros.length > 0 ? 'parcial' : 'ok', {
    stageId: stageId, protocolo: protocolo, resultados: resultados,
  }, protocolo);

  return { ok: erros.length === 0, resultados: resultados, erros: erros };
}

// ──────────────────────────────────────────────────────────────
//  HANDLERS INDIVIDUAIS
// ──────────────────────────────────────────────────────────────

function _executarMensagemAuto(card, cfg, stageId) {
  try {
    var gm = getGPTMakerConfig_();
    if (!gm.apiKey)     return { ok: false, motivo: 'gptmaker_api_key_nao_configurado' };
    if (!gm.channelId)  return { ok: false, motivo: 'gptmaker_channel_id_nao_configurado' };

    var chatId = _buildChatId(card, gm.channelId);
    if (!chatId) return { ok: false, motivo: 'telefone_nao_encontrado_no_card' };

    var texto = _substituirPlaceholders(cfg.texto, card);

    if (cfg.usar_ia) {
      // IA gera e ENVIA via POST /agent/{id}/conversation — a resposta já sai
      // como o agente no chat correto; não precisa (nem deve) de start-human.
      gptMakerGerarResposta(chatId, texto);
      Logger.log('[AUTO-ETAPA] ✓ Mensagem IA gerada/enviada [' + chatId + ']: ' + texto.substring(0, 80));
    } else {
      // Envio direto via POST /chat/{chatId}/send-message.
      // ⚠️ É OBRIGATÓRIO assumir o atendimento (start-human) ANTES de enviar.
      // Sem isso, o GPT Maker trata a mensagem como inbound (cliente→agente)
      // e/ou roteia para um chat novo. Mesmo padrão da rotaConferirPecas que funciona.
      try {
        gptMakerStartHuman(chatId);
        Logger.log('[AUTO-ETAPA] ✓ start-human OK antes do envio [' + chatId + ']');
      } catch(eSh) {
        Logger.log('[AUTO-ETAPA] ⚠ start-human falhou (seguindo com envio): ' + eSh.message);
      }
      gptMakerEnviarMensagem(chatId, texto);
      Logger.log('[AUTO-ETAPA] ✓ Mensagem enviada como agente [' + chatId + ']: ' + texto.substring(0, 80));
    }

    // ── Reatribuição para a IA ─────────────────────────────────────
    // stop-human devolve o controle ao bot/IA (reatribui) — NÃO finaliza o atendimento.
    if (cfg.reatribuir_ia === true) {
      Logger.log('[AUTO-ETAPA] reatribuir_ia=true → solicitando stop-human para chatId=' + chatId);
      try {
        var iaResult = gptMakerStopHuman(chatId);
        Logger.log('[AUTO-ETAPA] ✓ IA reassumida — resposta GPT Maker: ' + JSON.stringify(iaResult));
      } catch(eIa) {
        Logger.log('[AUTO-ETAPA] ⚠ stop-human falhou (mensagem já foi): ' + eIa.message);
        // Não bloqueia o resultado — mensagem já foi enviada com sucesso
      }
    }

    return { ok: true };
  } catch(e) {
    Logger.log('[AUTO-ETAPA] ✗ Erro mensagem: ' + e.message);
    return { ok: false, motivo: e.message };
  }
}

function _executarWebhookAuto(card, cfg, stageId) {
  try {
    if (!cfg.endpoint) return { ok: false, motivo: 'endpoint_vazio' };

    // ── Monta payload rico ────────────────────────────────────────
    // Usa cfg.campos para filtrar quais chaves enviar (se configurado).
    // Se cfg.campos estiver vazio, envia todos.
    var camposFiltro = cfg.campos && cfg.campos.length > 0 ? cfg.campos : null;

    var _campo = function(chave) {
      if (camposFiltro && camposFiltro.indexOf(chave) === -1) return '';
      return String(_getCardField(card, chave) || '');
    };

    // ── Metadados da automação ────────────────────────────────────
    var body = {
      etapa:     stageId,
      timestamp: new Date().toISOString(),
    };

    // ── Dados do cliente ─────────────────────────────────────────
    body.nome_cliente     = _campo('nome_cliente');
    body.whatsapp_cliente = _campo('whatsapp_cliente');
    body.contato_id       = _campo('contato_id');   // chatId GPT Maker (channelId-phone)

    // ── Dados da oportunidade ─────────────────────────────────────
    body.protocolo        = _campo('protocolo');     // SEM duplicidade: apenas 'protocolo'
    body.nome_oportunidade= _campo('nome_oportunidade');
    body.status           = _campo('status');
    body.prioridade       = _campo('prioridade');
    body.origem           = _campo('origem');
    body.responsavel      = _campo('responsavel');
    body.agente           = _campo('agente');
    body.transferido_para = _campo('transferido_para');
    body.canal            = _campo('canal');
    body.observacoes      = _campo('observacoes');

    // ── Dados do produto ──────────────────────────────────────────
    body.produto          = _campo('produto');
    body.quantidade       = _campo('quantidade');
    body.preco_unitario   = _campo('preco_unitario');
    body.valor            = _campo('valor');

    // ── Dados da tarefa ───────────────────────────────────────────
    body.titulo_tarefa    = _campo('titulo_tarefa');
    body.data_tarefa      = _campo('data_tarefa');
    body.atribuicao_tarefa= _campo('atribuicao_tarefa');
    body.status_tarefa    = _campo('status_tarefa');

    // ── Log de diagnóstico ────────────────────────────────────────
    var preenchidos = Object.keys(body).filter(function(k){
      return body[k] !== '' && body[k] !== null && body[k] !== undefined;
    });
    var vazios = Object.keys(body).filter(function(k){
      return k !== 'etapa' && k !== 'timestamp' && (body[k] === '' || body[k] === null);
    });
    Logger.log('[AUTO-ETAPA] Webhook payload — preenchidos (' + preenchidos.length + '): ' + preenchidos.join(', '));
    if (vazios.length) Logger.log('[AUTO-ETAPA] Webhook payload — vazios (' + vazios.length + '): ' + vazios.join(', '));

    var options = {
      method:             (cfg.metodo || 'POST').toLowerCase(),
      contentType:        'application/json',
      payload:            JSON.stringify(body),
      muteHttpExceptions: true,
    };
    if (cfg.headers) {
      try { options.headers = JSON.parse(cfg.headers); } catch(_) {}
    }

    var response = UrlFetchApp.fetch(cfg.endpoint, options);
    var code     = response.getResponseCode();
    Logger.log('[AUTO-ETAPA] Webhook ' + cfg.endpoint + ' → HTTP ' + code);

    if (code < 200 || code >= 300) {
      return { ok: false, motivo: 'http_' + code, response: response.getContentText().substring(0, 200) };
    }
    return { ok: true, http: code };
  } catch(e) {
    Logger.log('[AUTO-ETAPA] ✗ Erro webhook: ' + e.message);
    return { ok: false, motivo: e.message };
  }
}

function _executarFluxo(card, nodes, stageId) {
  var resultados = [], erros = [];
  // Executa sequencialmente ignorando nós de trigger e de espera (wait é para futura implementação)
  nodes.forEach(function(node, i) {
    if (node.tipo === 'trigger' || node.tipo === 'wait' || node.tipo === 'condicao') return;
    try {
      var step = { tipo: node.tipo, config: node.config || {} };
      var r = _executarStep(card, step, stageId);
      resultados.push({ step: i, tipo: node.tipo, resultado: r });
      if (!r.ok) erros.push('node ' + i + ' (' + node.tipo + '): ' + r.motivo);
    } catch(e) {
      resultados.push({ step: i, tipo: node.tipo, resultado: { ok: false, motivo: e.message } });
      erros.push('node ' + i + ': ' + e.message);
    }
  });
  return { ok: erros.length === 0, resultados: resultados, erros: erros, motivo: erros.join(' | ') };
}

function _executarStep(card, step, stageId) {
  switch(step.tipo) {
    case 'mensagem_gpt':
    case 'followup':     return _executarMensagemAuto(card, step.config || {}, stageId);
    case 'telegram':     return _executarStepTelegram(card, step.config || {}, stageId);
    case 'webhook':      return _executarWebhookAuto(card, step.config || {}, stageId);
    case 'email':        return _executarStepEmail(card, step.config || {}, stageId);
    case 'mover_card':   return { ok: true, motivo: 'mover_card_ignorado_em_entry' };
    case 'wait':         return { ok: true, motivo: 'wait_ignorado_execucao_sincrona' };
    case 'condicao':     return { ok: true, motivo: 'condicao_ignorada_execucao_sincrona' };
    default:
      Logger.log('[AUTO-ETAPA] Step type desconhecido: ' + step.tipo);
      return { ok: false, motivo: 'tipo_desconhecido: ' + step.tipo };
  }
}

function _executarStepEmail(card, cfg, stageId) {
  try {
    if (!cfg.to) return { ok: false, motivo: 'destinatario_email_nao_configurado' };
    var texto   = _substituirPlaceholders(cfg.texto || '', card);
    var assunto = _substituirPlaceholders(cfg.subject || ('Atualização — ' + stageId), card);
    GmailApp.sendEmail(cfg.to, assunto, texto);
    Logger.log('[AUTO-ETAPA] ✓ E-mail enviado para ' + cfg.to);
    return { ok: true };
  } catch(e) {
    Logger.log('[AUTO-ETAPA] ✗ Erro e-mail: ' + e.message);
    return { ok: false, motivo: e.message };
  }
}

function _executarStepTelegram(card, cfg, stageId) {
  try {
    var tg = getTelegramConfig_();
    if (!tg.chatId) return { ok: false, motivo: 'telegram_nao_configurado' };
    var texto = cfg.texto
      ? _substituirPlaceholders(cfg.texto, card)
      : '📋 <b>Card movido → ' + stageId + '</b>\n'
        + 'Protocolo: ' + (card.protocolo || card['Protocolo'] || '—') + '\n'
        + 'Cliente: '   + (_getCardField(card, 'nome_cliente') || '—') + '\n'
        + 'Produto: '   + (_getCardField(card, 'produto')      || '—');
    telegramEnviarMensagem(tg.chatId, texto, 'HTML');
    return { ok: true };
  } catch(e) {
    Logger.log('[AUTO-ETAPA] ✗ Erro Telegram: ' + e.message);
    return { ok: false, motivo: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────────────────────

function _buscarCardPorProtocolo(protocolo) {
  var dados = getDadosCRM();
  for (var i = 0; i < dados.length; i++) {
    if (String(dados[i].protocolo || dados[i]['Protocolo'] || '') === String(protocolo)) {
      return dados[i];
    }
  }
  return null;
}

function _substituirPlaceholders(texto, card) {
  var result = String(texto || '');
  Object.keys(CARD_PLACEHOLDER_MAP).forEach(function(key) {
    var val  = _getCardField(card, key);
    var safe = val !== null && val !== undefined ? String(val) : '';
    result = result.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), safe);
    result = result.replace(new RegExp('\\{' + key + '\\}',       'g'), safe);
  });
  return result;
}

function _getCardField(card, key) {
  var aliases = CARD_PLACEHOLDER_MAP[key] || [key];
  for (var i = 0; i < aliases.length; i++) {
    var v = card[aliases[i]];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return '';
}

/**
 * Resolve o chatId do GPT Maker para um card.
 *
 * Estratégia em ordem de prioridade:
 *  1. card['Contato'] — coluna "Contato" da planilha, armazena o chatId completo
 *     no formato channelId-phone (ex: 3F14F4F990BF403F0113BEBD982C5347-5591...)
 *  2. Construção a partir do número de WhatsApp/telefone (campo "WhatsApp" ou variantes)
 *     usando o channelId configurado
 *
 * @param {Object} card       — objeto raw do getDadosCRM()
 * @param {string} channelId  — ID do canal no GPT Maker
 * @returns {string|null}     — chatId ou null se não for possível resolver
 */
function _buildChatId(card, channelId) {
  // 1. Tenta usar o chatId armazenado diretamente na coluna "Contato"
  var contato = String(card['Contato'] || card.contato || '').trim();
  if (contato && contato.indexOf('-') > 10 && contato.length > 15) {
    // Parece um chatId válido: ID_CANAL-PHONE (ex: 3F14F4F990BF403F...-5591...)
    Logger.log('[AUTO-ETAPA] _buildChatId → usando Contato direto: ' + contato);
    return contato;
  }

  // 2. Tenta construir a partir do número de telefone/WhatsApp
  var phone = card['WhatsApp']    || card.whatsapp    ||
              card['Telefone']    || card.telefone    ||
              card['recipient']   || card.recipient   ||
              card['Phone']       || card.phone       ||
              card['telefone']    || card['fone']     || '';

  phone = String(phone).trim();
  if (!phone) {
    Logger.log('[AUTO-ETAPA] _buildChatId → sem telefone. Keys: ' + Object.keys(card).join(', '));
    return null;
  }

  var digits = phone.replace(/\D/g, '');
  if (digits.length < 8) {
    Logger.log('[AUTO-ETAPA] _buildChatId → dígitos insuficientes: "' + phone + '"');
    return null;
  }

  var chatId = channelId + '-' + digits;
  Logger.log('[AUTO-ETAPA] _buildChatId → construído: ' + chatId);
  return chatId;
}

/**
 * Enfileira follow-ups com intervalo — bypass interno sem validação de authToken.
 * Usado apenas internamente por executarAutomacaoEtapa.
 */
function _enqueueFollowUpsInternal(stageId, protocolo, autoConfig) {
  if (!autoConfig || !autoConfig.followups || !autoConfig.followups.length) return { enfileirados: 0 };
  var sheet = _fqEnsureSheet();
  var now   = new Date();
  var count = 0;
  autoConfig.followups.forEach(function(fu) {
    if (!fu.ativo || fu.imediato) return;
    var intervaloMs = (fu.intervalo_minutos || 30) * 60 * 1000;
    var maxOc       = fu.max_ocorrencias || 1;
    for (var occ = 1; occ <= maxOc; occ++) {
      var agendadoPara = new Date(now.getTime() + intervaloMs * occ);
      var id = 'fq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      sheet.appendRow([
        id, protocolo, stageId, fu.id || ('fu_' + occ), JSON.stringify(fu),
        agendadoPara.toISOString(), 'pendente', 0, '', now.toISOString(),
      ]);
      count++;
    }
  });
  return { enfileirados: count };
}
