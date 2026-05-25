/**
 * ============================================================
 *  AUTOMACAO_MONITORAMENTO.GS — Monitoramento de Funil +
 *  Cobrança de Atualização + Autopreservação da IA
 *  CRM + Dashboard | Milvolts LTDA
 *
 *  Fluxo:
 *    Trigger periódico →
 *      conta leads por etapa do funil →
 *      compara com limites configurados →
 *      ALERTA: envia notificação Telegram ao operador →
 *      CRÍTICO: ativa modo de autopreservação →
 *        bloqueia novos registros no CRM →
 *        notifica insistentemente
 *
 *  Autopreservação:
 *    Quando ativada, o webhook conferir_pecas verifica a flag
 *    antes de criar novos leads. Se ativa, recusa e notifica.
 *
 *  Configure o trigger: Apps Script → Acionadores
 *   Função: triggerMonitoramento
 *   Tipo: a cada hora (ou 30 minutos)
 * ============================================================
 */

// ── DEFAULTS DE CONFIGURAÇÃO ─────────────────────────────────
var MON_DEFAULTS = {
  // ── Etapas monitoradas (configuráveis via front-end) ─────────
  // Slugs exatamente como aparecem na coluna Status da planilha
  // (espaços → underscores, minúsculas)
  mon_etapa_1: 'conferir_pecas',      // etapa principal — ativa autopreservação
  mon_etapa_2: 'orcamento_enviado',
  mon_etapa_3: 'follow_up',
  // ── Limites de alerta por etapa ──────────────────────────────
  mon_alerta_conferir_pecas:    '300',
  mon_alerta_orcamento_enviado: '150',
  mon_alerta_follow_up:         '120',
  mon_alerta_global:            '400',
  // ── Limites críticos (aciona autopreservação) ─────────────────
  mon_critico_conferir_pecas:   '500',
  mon_critico_orcamento_enviado:'250',
  mon_critico_follow_up:        '200',
  mon_critico_global:           '700',
  // ── Comportamento ─────────────────────────────────────────────
  mon_ativo:                   'true',
  mon_autopreservacao_ativa:   'false',
  mon_autopreservacao_motivo:  '',
  mon_intervalo_alerta_horas:  '4',
  mon_ultimo_alerta:           '',
};

// ──────────────────────────────────────────────────────────────
//  TRIGGER — chame esta função no acionador periódico
// ──────────────────────────────────────────────────────────────

function triggerMonitoramento() {
  Logger.log('[MONITOR] ══ Trigger iniciado: ' + new Date().toLocaleString('pt-BR') + ' ══');
  try {
    var resultado = monitorarFunil();
    Logger.log('[MONITOR] Resultado: ' + JSON.stringify(resultado));
  } catch (e) {
    Logger.log('[MONITOR] ERRO CRÍTICO: ' + e.message + '\n' + e.stack);
  }
}

// ──────────────────────────────────────────────────────────────
//  MOTOR PRINCIPAL
// ──────────────────────────────────────────────────────────────

function monitorarFunil() {
  var cfg = _getMonConfig();

  if (String(cfg.mon_ativo).toLowerCase() !== 'true') {
    Logger.log('[MONITOR] Monitoramento desativado. Abortando.');
    return { status: 'desativado' };
  }

  // Conta leads por etapa
  var contagens = _contarLeadsPorEtapa();
  Logger.log('[MONITOR] Contagens: ' + JSON.stringify(contagens));

  var alertas   = [];
  var criticos  = [];

  // Verifica limites por etapa — usando slugs configurados via front-end
  var _slug = function(v) { return String(v||'').toLowerCase().replace(/[\s\-]+/g,'_'); };
  var etapas = [
    { id: _slug(cfg.mon_etapa_1 || 'conferir_pecas'),    label: _labelEtapa_(cfg.mon_etapa_1 || 'conferir_pecas'),    alerta: 'mon_alerta_conferir_pecas',    critico: 'mon_critico_conferir_pecas',    principal: true  },
    { id: _slug(cfg.mon_etapa_2 || 'orcamento_enviado'), label: _labelEtapa_(cfg.mon_etapa_2 || 'orcamento_enviado'), alerta: 'mon_alerta_orcamento_enviado', critico: 'mon_critico_orcamento_enviado', principal: false },
    { id: _slug(cfg.mon_etapa_3 || 'follow_up'),         label: _labelEtapa_(cfg.mon_etapa_3 || 'follow_up'),         alerta: 'mon_alerta_follow_up',         critico: 'mon_critico_follow_up',         principal: false },
  ];

  etapas.forEach(function(e) {
    var count     = contagens[e.id] || 0;
    var limAlerta = parseInt(cfg[e.alerta])  || 999;
    var limCrit   = parseInt(cfg[e.critico]) || 999;
    if (count >= limCrit) {
      // Autopreservação só é ativada pela etapa principal (etapa 1)
      if (e.principal) {
        criticos.push(e.label + ': ' + count + ' leads (crítico ≥' + limCrit + ')');
      } else {
        alertas.push(e.label + ': ' + count + ' leads (crítico ≥' + limCrit + ' — apenas alerta)');
      }
    } else if (count >= limAlerta) {
      alertas.push(e.label + ': ' + count + ' leads (alerta ≥' + limAlerta + ')');
    }
  });

  // Verifica total global
  var totalAtivos = Object.values(contagens).reduce(function(a, b) { return a + b; }, 0);
  var limAlerGlobal = parseInt(cfg.mon_alerta_global) || 999;
  var limCritGlobal = parseInt(cfg.mon_critico_global) || 999;
  if (totalAtivos >= limCritGlobal) criticos.push('📊 Total CRM: ' + totalAtivos + ' leads (crítico ≥' + limCritGlobal + ')');
  else if (totalAtivos >= limAlerGlobal) alertas.push('📊 Total CRM: ' + totalAtivos + ' leads (alerta ≥' + limAlerGlobal + ')');

  var result = { status: 'ok', alertas: alertas.length, criticos: criticos.length, contagens: contagens };

  if (criticos.length === 0 && alertas.length === 0) {
    Logger.log('[MONITOR] ✓ Funil dentro dos limites.');

    // Se havia autopreservação ativa e agora está ok, não desativa automaticamente (requer ação humana)
    return result;
  }

  // Verifica se já enviou alerta recentemente (evita spam)
  var agora           = Date.now();
  var ultimoAlerta    = cfg.mon_ultimo_alerta ? new Date(String(cfg.mon_ultimo_alerta)).getTime() : 0;
  var intervaloAlerta = (parseFloat(cfg.mon_intervalo_alerta_horas) || 4) * 3600000;
  var podeNotificar   = (agora - ultimoAlerta) >= intervaloAlerta;

  if (!podeNotificar) {
    Logger.log('[MONITOR] Alerta recente. Aguardando intervalo de ' + cfg.mon_intervalo_alerta_horas + 'h.');
    return result;
  }

  // Ativa autopreservação se houver críticos
  if (criticos.length > 0) {
    var motivo = criticos.join(' | ');
    _ativarAutopreservacaoInterna(motivo);
    _enviarAlertaCritico(criticos, alertas, contagens);
  } else {
    _enviarAlertaAviso(alertas, contagens);
  }

  // Registra timestamp do alerta
  salvarConfig('mon_ultimo_alerta', new Date().toISOString());
  registrarLog('monitoramento_alerta', criticos.length > 0 ? 'critico' : 'aviso', {
    alertas: alertas, criticos: criticos, contagens: contagens,
  }, '');

  return result;
}

// ──────────────────────────────────────────────────────────────
//  AUTOPRESERVAÇÃO
// ──────────────────────────────────────────────────────────────

/**
 * Verifica se a autopreservação está ativa.
 * Chamada pelo webhook conferir_pecas ANTES de criar o lead.
 * Retorna { ativa: bool, motivo: string }
 */
function verificarAutopreservacao() {
  var cfg = _getMonConfig();
  var ativa = String(cfg.mon_autopreservacao_ativa).toLowerCase() === 'true';
  return { ativa: ativa, motivo: String(cfg.mon_autopreservacao_motivo || '') };
}

/** Ativa autopreservação internamente — salva flag E pausa o agente no GPT Maker */
function _ativarAutopreservacaoInterna(motivo) {
  // Guarda duplicada: se já está ativa não toca a API nem re-salva
  var cfg = _getMonConfig();
  if (String(cfg.mon_autopreservacao_ativa).toLowerCase() === 'true') {
    Logger.log('[MONITOR] Autopreservação já ativa. Nenhuma ação duplicada.');
    return;
  }

  salvarConfig('mon_autopreservacao_ativa', 'true');
  salvarConfig('mon_autopreservacao_motivo', String(motivo).substring(0, 500));
  Logger.log('[MONITOR] 🔴 AUTOPRESERVAÇÃO ATIVADA: ' + motivo);

  // ── Pausa o agente real no GPT Maker ──────────────────────
  try {
    gptMakerInativarAgente();
    Logger.log('[MONITOR] ✓ Agente GPT Maker inativado via API.');
  } catch (e) {
    Logger.log('[MONITOR] ERRO ao inativar agente GPT Maker: ' + e.message);
    // Não interrompe o fluxo — a flag no Sheets já bloqueia novos leads
  }
}

/**
 * Desativa autopreservação (requer ação manual do admin).
 * Reativa o agente no GPT Maker E limpa a flag no Sheets.
 */
function desativarAutopreservacao(authToken) {
  requireAuth(authToken, 'admin');

  // ── Reativa o agente no GPT Maker primeiro ────────────────
  try {
    gptMakerAtivarAgente();
    Logger.log('[MONITOR] ✓ Agente GPT Maker reativado via API.');
  } catch (e) {
    Logger.log('[MONITOR] ERRO ao reativar agente GPT Maker: ' + e.message);
    // Prossegue mesmo com erro — admin pode reativar manualmente no painel GPT Maker
  }

  salvarConfig('mon_autopreservacao_ativa', 'false');
  salvarConfig('mon_autopreservacao_motivo', '');
  registrarLog('autopreservacao_desativada', 'ok', {}, '', { acao: 'desativar_autopreservacao' });
  Logger.log('[MONITOR] ✓ Autopreservação desativada por admin.');
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────
//  NOTIFICAÇÕES TELEGRAM
// ──────────────────────────────────────────────────────────────

function _enviarAlertaAviso(alertas, contagens) {
  var telegram = getTelegramConfig_();
  if (!telegram.chatId) return;

  var linhas = alertas.map(function(a) { return '⚠️ ' + a; }).join('\n');
  var txt = '⚠️ <b>ALERTA — CRM Milvolts</b>\n\n'
    + 'O pipeline está acumulando oportunidades paradas:\n\n'
    + linhas + '\n\n'
    + '📋 <b>Ação necessária:</b> Atualize os status no CRM!\n'
    + 'Mova os cards para Venda Fechada, Perdido ou Follow-up.\n\n'
    + '📊 Total ativo no CRM: ' + Object.values(contagens).reduce(function(a,b){return a+b;},0) + ' leads';
  telegramEnviarMensagem(telegram.chatId, txt, 'HTML');
}

function _enviarAlertaCritico(criticos, alertas, contagens) {
  var telegram = getTelegramConfig_();
  if (!telegram.chatId) return;

  var lc = criticos.map(function(c) { return '🔴 ' + c; }).join('\n');
  var la = alertas.map(function(a) { return '⚠️ ' + a; }).join('\n');
  var txt = '🚨 <b>CRÍTICO — IA PAUSADA | Milvolts CRM</b>\n\n'
    + '<b>O Thaynan IA foi pausado automaticamente.</b>\n'
    + 'O pipeline atingiu limite crítico de operação.\n\n'
    + '<b>Situação crítica:</b>\n' + lc
    + (la ? '\n\n<b>Outros alertas:</b>\n' + la : '') + '\n\n'
    + '🔴 <b>AÇÃO URGENTE NECESSÁRIA:</b>\n'
    + '1. Acesse o CRM imediatamente\n'
    + '2. Atualize os cards parados\n'
    + '3. Após organizar, reative a IA no painel de Configurações\n\n'
    + '⏰ A IA não aceitará novos leads até que o admin reative manualmente.';
  telegramEnviarMensagem(telegram.chatId, txt, 'HTML');
}

// ──────────────────────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────────────────────

function _contarLeadsPorEtapa() {
  var dados = getDadosCRM();
  var contagens = {};
  dados.forEach(function(r) {
    var st = String(r['Status'] || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (!st || st === 'venda_fechada' || st === 'perdido' || st === 'sem_resposta') return;
    contagens[st] = (contagens[st] || 0) + 1;
  });
  return contagens;
}

function _getMonConfig() {
  var cfg = getConfigs();
  var out = {};
  Object.keys(MON_DEFAULTS).forEach(function(k) {
    out[k] = cfg[k] !== undefined && cfg[k] !== '' ? cfg[k] : MON_DEFAULTS[k];
  });
  return out;
}

/**
 * Converte um slug de etapa em label legível.
 * @param {string} slug  Ex: 'conferir_pecas' ou 'Conferir Peças'
 * @returns {string}
 */
function _labelEtapa_(slug) {
  var MAP = {
    'conferir_pecas':    '🔍 Conferir Peças',
    'orcamento_enviado': '📤 Orçamento Enviado',
    'follow_up':         '🔄 Follow-up',
    'venda_fechada':     '✅ Venda Fechada',
    'perdido':           '❌ Perdido',
    'sem_resposta':      '🔕 Sem Resposta',
  };
  var key = String(slug || '').toLowerCase().replace(/[\s\-]+/g, '_');
  return MAP[key] || ('📋 ' + key.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }));
}

// ──────────────────────────────────────────────────────────────
//  FUNÇÕES SERVER-SIDE (frontend)
// ──────────────────────────────────────────────────────────────

/**
 * Executa o ciclo completo de monitoramento manualmente (via front-end).
 * Retorna resultado detalhado para exibição na UI.
 */
function executarMonitoramentoManual(authToken) {
  requireAuth(authToken, 'admin');
  return monitorarFunil();
}

/**
 * Versão pública de limparFlagAutopreservacaoEmergencia — requer admin.
 * Remove apenas a flag local SEM chamar a API GPT Maker.
 * Use quando o agente já está ativo mas o banner continua aparecendo.
 */
function limparFlagAutopreservacaoFrontend(authToken) {
  requireAuth(authToken, 'admin');
  return limparFlagAutopreservacaoEmergencia();
}

function getMonitoramentoStatus(authToken) {
  requireAuth(authToken, 'operador');
  var cfg       = _getMonConfig();
  var contagens = _contarLeadsPorEtapa();
  var _slug     = function(v) { return String(v||'').toLowerCase().replace(/[\s\-]+/g,'_'); };
  return {
    autopreservacao: {
      ativa:  String(cfg.mon_autopreservacao_ativa).toLowerCase() === 'true',
      motivo: String(cfg.mon_autopreservacao_motivo || ''),
    },
    contagens: contagens,
    config:    cfg,
    // Labels das etapas configuradas — útil para exibir na UI
    etapas_labels: {
      etapa_1: _labelEtapa_(cfg.mon_etapa_1 || 'conferir_pecas'),
      etapa_2: _labelEtapa_(cfg.mon_etapa_2 || 'orcamento_enviado'),
      etapa_3: _labelEtapa_(cfg.mon_etapa_3 || 'follow_up'),
      slug_1:  _slug(cfg.mon_etapa_1 || 'conferir_pecas'),
      slug_2:  _slug(cfg.mon_etapa_2 || 'orcamento_enviado'),
      slug_3:  _slug(cfg.mon_etapa_3 || 'follow_up'),
    },
  };
}

function salvarMonitoramentoConfig(dados, authToken) {
  var sessao = requireAuth(authToken, 'admin');
  var chaves = Object.keys(MON_DEFAULTS).filter(function(k) {
    return k !== 'mon_autopreservacao_ativa' && k !== 'mon_autopreservacao_motivo' && k !== 'mon_ultimo_alerta';
  });
  chaves.forEach(function(k) {
    if (dados[k] !== undefined) salvarConfig(k, String(dados[k]).substring(0, 200));
  });
  registrarLog('config_monitoramento', 'ok', dados, '', { usuario: sessao.email, acao: 'salvar_config_monitoramento' });
  return { ok: true };
}

/**
 * Diagnóstico: retorna status real do agente no GPT Maker + flag local.
 * Execute no editor do Apps Script para verificar inconsistências.
 */
function diagnosticarAutopreservacao() {
  var cfg = _getMonConfig();
  var flagLocal = String(cfg.mon_autopreservacao_motivo || '');
  var ativaLocal = String(cfg.mon_autopreservacao_ativa).toLowerCase() === 'true';

  var statusGPT = null;
  try {
    statusGPT = gptMakerGetAgente();
  } catch (e) {
    statusGPT = { erro: e.message };
  }

  var resultado = {
    flag_local_ativa:   ativaLocal,
    motivo_local:       flagLocal,
    agente_gpt_maker:   statusGPT,
  };

  Logger.log('[DIAGNÓSTICO AUTOPRESERVAÇÃO] ' + JSON.stringify(resultado));
  return resultado;
}

/**
 * Limpa a flag de autopreservação SEM chamar a API (emergência).
 * Use se o agente GPT Maker já está ativo mas o banner continua aparecendo.
 * Execute diretamente no editor do Apps Script (não requer authToken).
 */
function limparFlagAutopreservacaoEmergencia() {
  salvarConfig('mon_autopreservacao_ativa', 'false');
  salvarConfig('mon_autopreservacao_motivo', '');
  Logger.log('[MONITOR] ⚡ Flag de autopreservação limpa (emergência). Agente GPT Maker não foi tocado.');
  return { ok: true, aviso: 'Flag limpa. Confirme manualmente que o agente está ativo no GPT Maker.' };
}

/** Cria o trigger periódico para monitoramento (execute 1x manualmente) */
function criarTriggerMonitoramento() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'triggerMonitoramento') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('triggerMonitoramento').timeBased().everyHours(1).create();
  Logger.log('[MONITOR] Trigger criado: triggerMonitoramento a cada 1 hora.');
  return { ok: true, mensagem: 'Trigger criado: triggerMonitoramento a cada 1 hora.' };
}
