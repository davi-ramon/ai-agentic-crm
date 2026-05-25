/**
 * ============================================================
 *  AUTOMACAO_FOLLOWUP.GS — Motor de Follow-up Automático
 *  CRM + Dashboard | Milvolts LTDA
 *
 *  Fluxo:
 *    Trigger periódico (a cada N minutos) →
 *      lê CRM por leads em 'orcamento_enviado' →
 *        para cada lead sem resposta + intervalo atingido:
 *          lê contexto da conversa no GPT Maker →
 *          gera mensagem via template configurável →
 *          envia mensagem →
 *          registra tentativa no tracking
 *
 *  Parada automática quando:
 *   - cliente responder
 *   - max de tentativas atingido
 *   - cliente confirmar compra / informar perda
 *
 *  Configure o trigger em: Apps Script → Acionadores
 *   Função: triggerFollowUp
 *   Tipo: baseado em tempo (a cada 1 hora, por exemplo)
 * ============================================================
 */

// ── CONSTANTES ───────────────────────────────────────────────
var FU_SHEET   = 'followup_tracking';
var FU_ETAPA   = 'orcamento_enviado';

var FU_CFG_DEFAULTS = {
  followup_ativo:           'false',
  followup_prompt:          'Olá {{nome}}! 😊 Passando para saber se você já teve a chance de analisar nosso orçamento para {{produto}} ({{valor}}). Temos peça disponível e posso separar para você hoje. Alguma dúvida?',
  followup_max_tentativas:  '3',
  followup_intervalo_horas: '24',
  followup_usar_contexto:   'false',
  followup_etapa:           'orcamento_enviado',
};

// ──────────────────────────────────────────────────────────────
//  TRIGGER — chame esta função no acionador periódico
// ──────────────────────────────────────────────────────────────

function triggerFollowUp() {
  Logger.log('[FOLLOWUP] ══ Trigger iniciado: ' + new Date().toLocaleString('pt-BR') + ' ══');
  try {
    var resultado = executarFollowUpAutomatico();
    Logger.log('[FOLLOWUP] Resultado: ' + JSON.stringify(resultado));
  } catch (e) {
    Logger.log('[FOLLOWUP] ERRO CRÍTICO: ' + e.message + '\n' + e.stack);
  }
}

// ──────────────────────────────────────────────────────────────
//  MOTOR PRINCIPAL
// ──────────────────────────────────────────────────────────────

function executarFollowUpAutomatico() {
  var cfg = _getFUConfig();

  if (String(cfg.followup_ativo).toLowerCase() !== 'true') {
    Logger.log('[FOLLOWUP] Automação desativada nas configs. Abortando.');
    return { status: 'desativado', enviados: 0 };
  }

  var maxTentativas  = parseInt(cfg.followup_max_tentativas) || 3;
  var intervaloHoras = parseFloat(cfg.followup_intervalo_horas) || 24;
  var usarContexto   = String(cfg.followup_usar_contexto).toLowerCase() === 'true';
  var prompt         = String(cfg.followup_prompt || FU_CFG_DEFAULTS.followup_prompt);

  // Carrega leads elegíveis do CRM
  var leads = _getLeadsParaFollowUp(cfg.followup_etapa || FU_ETAPA);
  Logger.log('[FOLLOWUP] Leads em "' + (cfg.followup_etapa||FU_ETAPA) + '": ' + leads.length);

  if (leads.length === 0) return { status: 'ok', enviados: 0, motivo: 'sem_leads_elegiveis' };

  // Carrega tracking existente
  var tracking = _getTracking();

  var enviados = 0;
  var pulados  = 0;
  var erros    = [];

  leads.forEach(function(lead) {
    try {
      var proto  = String(lead.protocolo || '').trim();
      var chatId = String(lead.contato   || '').trim();

      if (!proto || !chatId) { pulados++; return; }

      var track = tracking[proto] || { tentativas: 0, ultima: null, status: 'ativo' };

      // Pula se já encerrado
      if (track.status !== 'ativo') { pulados++; return; }

      // Pula se atingiu o máximo
      if (track.tentativas >= maxTentativas) {
        Logger.log('[FOLLOWUP] ' + proto + ' atingiu limite de ' + maxTentativas + ' tentativas. Encerrando.');
        _atualizarTracking(proto, chatId, lead, track.tentativas, 'concluido', 'limite_atingido');
        pulados++;
        return;
      }

      // Verifica se passou o intervalo mínimo desde a última tentativa
      if (track.ultima) {
        var diffHoras = (Date.now() - new Date(track.ultima).getTime()) / 3600000;
        if (diffHoras < intervaloHoras) { pulados++; return; }
      }

      // Verifica se o cliente respondeu após a última tentativa (verificação básica via GPT Maker)
      if (track.ultima && chatId) {
        var respondeu = _verificarRespostaCliente(chatId, track.ultima);
        if (respondeu) {
          Logger.log('[FOLLOWUP] ' + proto + ' — cliente respondeu. Parando follow-up.');
          _atualizarTracking(proto, chatId, lead, track.tentativas, 'respondido', 'cliente_respondeu');
          _notificarVendedorResposta(lead);
          pulados++;
          return;
        }
      }

      // Obtém contexto da conversa (se configurado)
      var contexto = '';
      if (usarContexto && chatId) {
        try {
          contexto = _getContextoConversa(chatId);
        } catch (ce) {
          Logger.log('[FOLLOWUP] Erro ao obter contexto de ' + proto + ': ' + ce.message);
        }
      }

      // Gera e envia a mensagem
      var novaTentativa = track.tentativas + 1;
      var mensagem = _gerarMensagemFollowUp(lead, contexto, novaTentativa, prompt);

      // stop-human garante que a IA não interfira (bot está em modo humano pelo orçamento)
      // Não precisamos mudar o modo, apenas enviamos diretamente
      gptMakerEnviarMensagem(chatId, mensagem);

      // Registra o tracking
      _atualizarTracking(proto, chatId, lead, novaTentativa, 'ativo', '');

      // Log
      registrarLog('followup_enviado', 'ok', {
        protocolo: proto, tentativa: novaTentativa, chatId: chatId,
        produto: lead.produto, valor: lead.valor,
      }, '');

      Logger.log('[FOLLOWUP] ✓ ' + proto + ' — tentativa ' + novaTentativa + '/' + maxTentativas + ' enviada.');
      enviados++;

      Utilities.sleep(500); // anti-rate-limit

    } catch (e) {
      erros.push({ protocolo: lead.protocolo, erro: e.message });
      Logger.log('[FOLLOWUP] ✗ Erro em ' + lead.protocolo + ': ' + e.message);
    }
  });

  Logger.log('[FOLLOWUP] ═══ RESULTADO: enviados=' + enviados + ' pulados=' + pulados + ' erros=' + erros.length + ' ═══');
  return { status: 'ok', enviados: enviados, pulados: pulados, erros: erros.length };
}

// ──────────────────────────────────────────────────────────────
//  HELPERS INTERNOS
// ──────────────────────────────────────────────────────────────

/** Lê leads do CRM que estão na etapa especificada */
function _getLeadsParaFollowUp(etapa) {
  var dados = getDadosCRM();
  return dados.filter(function(r) {
    var st = String(r['Status'] || '').toLowerCase().replace(/[\s-]+/g, '_');
    return st === String(etapa).toLowerCase().replace(/[\s-]+/g, '_');
  }).map(function(r) {
    return {
      protocolo: String(r['Protocolo'] || '').trim(),
      contato:   String(r['Contato']   || '').trim(),  // = chatId / contextId
      produto:   String(r['Nome do Produto/Serviço'] || r['Nome da Oportunidade'] || 'peça').trim(),
      valor:     String(r['Valor (R$)'] || '').trim(),
      responsavel: String(r['Responsável'] || 'Cliente').trim(),
      whatsapp:  String(r['WhatsApp'] || '').trim(),
    };
  }).filter(function(l) { return l.protocolo && l.contato; });
}

/** Lê a planilha de tracking e retorna mapa protocolo → {tentativas, ultima, status, motivo} */
function _getTracking() {
  var sheet = _garantirSheetTracking_();
  var d = sheet.getDataRange().getValues();
  var map = {};
  if (d.length < 2) return map;
  for (var i = 1; i < d.length; i++) {
    var proto = String(d[i][0] || '').trim();
    if (!proto) continue;
    map[proto] = {
      chatId:     String(d[i][1] || ''),
      tentativas: parseInt(d[i][5]) || 0,
      ultima:     d[i][6] instanceof Date ? d[i][6].toISOString() : String(d[i][6] || ''),
      status:     String(d[i][7] || 'ativo'),
      motivo:     String(d[i][8] || ''),
      linha:      i + 1,
    };
  }
  return map;
}

/** Cria ou atualiza linha no tracking */
function _atualizarTracking(proto, chatId, lead, tentativas, status, motivo) {
  var sheet = _garantirSheetTracking_();
  var d = sheet.getDataRange().getValues();

  for (var i = 1; i < d.length; i++) {
    if (String(d[i][0]).trim() === proto) {
      sheet.getRange(i + 1, 1, 1, 9).setValues([[
        proto, chatId,
        lead.responsavel || '', lead.produto || '', lead.valor || '',
        tentativas, new Date(), status, motivo,
      ]]);
      return;
    }
  }
  // Nova linha
  sheet.appendRow([proto, chatId, lead.responsavel||'', lead.produto||'', lead.valor||'', tentativas, new Date(), status, motivo]);
}

/** Verifica se o cliente enviou alguma mensagem após a data indicada */
function _verificarRespostaCliente(chatId, ultimaDataISO) {
  try {
    var msgs = gptMakerGetMensagens(chatId, 10);
    if (!Array.isArray(msgs)) return false;
    var ultimaData = new Date(ultimaDataISO).getTime();
    return msgs.some(function(m) {
      var role = String(m.role || m.type || '').toLowerCase();
      var isClient = role === 'user' || role === 'client' || role === 'customer';
      if (!isClient) return false;
      var ts = m.createdAt || m.created_at || m.timestamp || m.date;
      if (!ts) return false;
      return new Date(ts).getTime() > ultimaData;
    });
  } catch (e) {
    Logger.log('[FOLLOWUP] _verificarRespostaCliente erro: ' + e.message);
    return false;
  }
}

/** Gera a mensagem de follow-up com substituição de variáveis */
function _gerarMensagemFollowUp(lead, contexto, tentativa, prompt) {
  var msg = String(prompt || FU_CFG_DEFAULTS.followup_prompt);

  // Extrai nome do responsável (primeiro nome)
  var nome = String(lead.responsavel || lead.whatsapp || 'cliente').split(' ')[0];
  var produto = lead.produto || 'peça solicitada';
  var valor = lead.valor ? 'R$ ' + String(lead.valor).replace(/[^\d,\.]/g, '') : '';

  msg = msg.replace(/\{\{nome\}\}/gi, nome);
  msg = msg.replace(/\{\{produto\}\}/gi, produto);
  msg = msg.replace(/\{\{valor\}\}/gi, valor || 'valor informado');
  msg = msg.replace(/\{\{tentativa\}\}/gi, String(tentativa));

  // Adiciona nota de tentativa quando tentativa > 1
  if (tentativa > 1) {
    msg = msg + '\n\n_(Tentativa ' + tentativa + ' de retorno)_';
  }

  return msg;
}

/** Notifica o vendedor via Telegram quando o cliente responde */
function _notificarVendedorResposta(lead) {
  try {
    var telegram = getTelegramConfig_();
    if (!telegram.chatId) return;
    var txt = '✅ <b>Cliente respondeu ao follow-up!</b>\n\n'
      + '📋 Protocolo: <code>' + (lead.protocolo || '—') + '</code>\n'
      + '📦 Produto: ' + (lead.produto || '—') + '\n'
      + '💰 Valor: R$ ' + (lead.valor || '—') + '\n'
      + '👤 Contato: ' + (lead.responsavel || '—') + '\n\n'
      + '⚡ Retome o atendimento no CRM!';
    telegramEnviarMensagem(telegram.chatId, txt, 'HTML');
  } catch (e) {
    Logger.log('[FOLLOWUP] Erro ao notificar vendedor: ' + e.message);
  }
}

/** Garante que a aba de tracking existe */
function _garantirSheetTracking_() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(FU_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(FU_SHEET);
  var hdr = sh.getRange(1, 1, 1, 9);
  hdr.setValues([['Protocolo','Chat ID','Lead','Produto','Valor','Tentativas','Última Tentativa','Status','Motivo']]);
  hdr.setFontWeight('bold').setBackground('#7C3AED').setFontColor('#FFFFFF');
  sh.setColumnWidths(1, 9, 160);
  sh.setFrozenRows(1);
  Logger.log('[FOLLOWUP] Aba "' + FU_SHEET + '" criada.');
  return sh;
}

/**
 * Retorna um resumo das últimas mensagens de um chat como string de contexto.
 * Usado quando followup_usar_contexto = true.
 * @param {string} chatId
 * @returns {string} Contexto textual das últimas mensagens
 */
function _getContextoConversa(chatId) {
  try {
    var msgs = gptMakerGetMensagens(chatId, 10);
    if (!Array.isArray(msgs) || msgs.length === 0) return '';
    return msgs.slice(-5).map(function(m) {
      var role = String(m.role || m.type || 'user').toLowerCase();
      var text = String(m.content || m.message || m.text || '').substring(0, 200);
      return (role === 'user' || role === 'client' ? 'Cliente' : 'IA') + ': ' + text;
    }).join('\n');
  } catch(e) {
    Logger.log('[FOLLOWUP] _getContextoConversa erro: ' + e.message);
    return '';
  }
}

/** Lê configs de follow-up */
function _getFUConfig() {
  var cfg = getConfigs();
  var out = {};
  Object.keys(FU_CFG_DEFAULTS).forEach(function(k) {
    out[k] = cfg[k] !== undefined && cfg[k] !== '' ? cfg[k] : FU_CFG_DEFAULTS[k];
  });
  return out;
}

// ──────────────────────────────────────────────────────────────
//  FUNÇÕES SERVER-SIDE (chamadas pelo frontend)
// ──────────────────────────────────────────────────────────────

/**
 * Executa o follow-up automático manualmente a partir do front-end.
 * Requer perfil admin. Retorna resultado detalhado para auditoria na UI.
 */
function executarFollowUpManual(authToken) {
  requireAuth(authToken, 'admin');
  Logger.log('[FOLLOWUP] Execução manual solicitada via front-end.');
  return executarFollowUpAutomatico();
}

/** Retorna a configuração de follow-up para o frontend */
function getFollowUpConfig(authToken) {
  requireAuth(authToken, 'admin');
  return _getFUConfig();
}

/** Salva a configuração de follow-up */
function salvarFollowUpConfig(dados, authToken) {
  var sessao = requireAuth(authToken, 'admin');
  var chaves = Object.keys(FU_CFG_DEFAULTS);
  chaves.forEach(function(k) {
    if (dados[k] !== undefined) {
      salvarConfig(k, String(dados[k]).substring(0, k === 'followup_prompt' ? 1024 : 200));
    }
  });
  registrarLog('config_followup', 'ok', dados, '', { usuario: sessao.email, acao: 'salvar_config_followup' });
  return { ok: true };
}

/** Retorna o tracking de follow-ups para o frontend */
function getFollowUpTracking(authToken) {
  requireAuth(authToken, 'operador');
  var sh = getSpreadsheet().getSheetByName(FU_SHEET);
  if (!sh) return [];
  var d = sh.getDataRange().getValues();
  if (d.length < 2) return [];
  var hdrs = d[0];
  return d.slice(1).map(function(row) {
    var obj = {};
    hdrs.forEach(function(h, i) {
      var v = row[i];
      if (v instanceof Date) v = v.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      obj[String(h || 'c' + i)] = v !== undefined ? v : '';
    });
    return obj;
  });
}

/** Reseta o tracking de um protocolo específico */
function resetarFollowUpProtocolo(protocolo, authToken) {
  var sessao = requireAuth(authToken, 'admin');
  var sh = getSpreadsheet().getSheetByName(FU_SHEET);
  if (!sh) return { ok: false, erro: 'Aba de tracking não encontrada.' };
  var d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (String(d[i][0]).trim() === String(protocolo).trim()) {
      sh.getRange(i + 1, 6, 1, 4).setValues([[0, null, 'ativo', '']]);
      registrarLog('followup_reset', 'ok', { protocolo: protocolo }, '', { usuario: sessao.email, acao: 'reset_followup' });
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Protocolo não encontrado no tracking.' };
}

/** Cria o trigger periódico para o follow-up (execute 1x manualmente) */
function criarTriggerFollowUp() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'triggerFollowUp') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('triggerFollowUp').timeBased().everyHours(1).create();
  Logger.log('[FOLLOWUP] Trigger horário criado: triggerFollowUp');
  return { ok: true, mensagem: 'Trigger criado: triggerFollowUp a cada 1 hora.' };
}

function removerTriggerFollowUp() {
  var removidos = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'triggerFollowUp') { ScriptApp.deleteTrigger(t); removidos++; }
  });
  return { ok: true, mensagem: removidos + ' trigger(s) removido(s).' };
}
