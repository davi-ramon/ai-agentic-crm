/**
 * ============================================================
 *  PDV.GS — Mini PDV / Catálogo Inteligente de Produtos
 *  CRM + Dashboard | Milvolts LTDA
 *
 *  Recursos:
 *   - CRUD completo de produtos (peças/serviços)
 *   - Sincronização automática com memória do Thaynan IA
 *     via GPT Maker API (cria/atualiza/remove treinamento)
 *   - Cada produto gera um "item de memória" na IA com:
 *     nome, preço, compatibilidade, descrição técnica
 *
 *  Aba no Google Sheets: "PDV"
 *  Colunas: ID | Nome | Foto | Descrição | Preço | Desconto |
 *           Categoria | Marca | Modelo(s) | Motorização | Ano |
 *           Veículos | Obs | Ativo | Memória ID IA | Criado | Atualizado
 * ============================================================
 */

var PDV_SHEET = 'PDV';

// Índices de coluna (1-based)
var PDV_COL = {
  ID:          1,
  NOME:        2,
  FOTO:        3,
  DESCRICAO:   4,
  PRECO:       5,
  DESCONTO:    6,
  CATEGORIA:   7,
  MARCA:       8,
  MODELOS:     9,
  MOTORIZACAO: 10,
  ANO:         11,
  VEICULOS:    12,
  OBS:         13,
  ATIVO:       14,
  MEMORIA_ID:  15,  // ID do item na memória do GPT Maker
  CRIADO:      16,
  ATUALIZADO:  17,
};

// ──────────────────────────────────────────────────────────────
//  LEITURA
// ──────────────────────────────────────────────────────────────

function getPDVData(authToken) {
  requireAuth(authToken, 'operador');
  var sh = _garantirAbaPDV_();
  var d  = sh.getDataRange().getValues();
  if (d.length < 2) return [];
  var hdrs = d[0];
  return d.slice(1)
    .filter(function(r) { return r[0] && String(r[0]).trim() !== ''; })
    .map(function(r) {
      var obj = {};
      hdrs.forEach(function(h, i) { obj[String(h || 'c' + i)] = r[i] !== undefined ? r[i] : ''; });
      return obj;
    });
}

// ──────────────────────────────────────────────────────────────
//  CRIAÇÃO / ATUALIZAÇÃO
// ──────────────────────────────────────────────────────────────

function salvarProdutoPDV(produto, authToken) {
  var sessao = requireAuth(authToken, 'operador');
  var sh = _garantirAbaPDV_();
  var d  = sh.getDataRange().getValues();
  var id = String(produto.id || '').trim();

  var isNovo = !id;
  if (isNovo) id = 'PDV-' + Date.now();

  var agora = new Date();
  var row = [
    id,
    String(produto.nome         || '').substring(0, 200),
    String(produto.foto         || ''),
    String(produto.descricao    || '').substring(0, 500),
    _toFloat(produto.preco),
    _toFloat(produto.desconto),
    String(produto.categoria    || ''),
    String(produto.marca        || ''),
    String(produto.modelos      || ''),
    String(produto.motorizacao  || ''),
    String(produto.ano          || ''),
    String(produto.veiculos     || '').substring(0, 300),
    String(produto.obs          || '').substring(0, 300),
    produto.ativo === false ? 'false' : 'true',
    '',   // Memória ID IA — será preenchido abaixo
    isNovo ? agora : '',
    agora,
  ];

  var linhaExistente = -1;
  if (!isNovo) {
    for (var i = 1; i < d.length; i++) {
      if (String(d[i][0]).trim() === id) { linhaExistente = i + 1; break; }
    }
  }

  var memoriaIdAnterior = '';
  if (linhaExistente > 0) {
    memoriaIdAnterior = String(d[linhaExistente - 1][PDV_COL.MEMORIA_ID - 1] || '');
    row[PDV_COL.CRIADO - 1] = d[linhaExistente - 1][PDV_COL.CRIADO - 1]; // preserva data de criação
    sh.getRange(linhaExistente, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
    linhaExistente = sh.getLastRow();
  }

  // Sincroniza com a memória da IA
  var memoriaId = memoriaIdAnterior;
  try {
    var produtoParaIA = { id: id, nome: produto.nome, descricao: produto.descricao,
      preco: produto.preco, desconto: produto.desconto, categoria: produto.categoria,
      marca: produto.marca, modelos: produto.modelos, motorizacao: produto.motorizacao,
      ano: produto.ano, veiculos: produto.veiculos, obs: produto.obs };
    memoriaId = _sincronizarComIA(produtoParaIA, memoriaIdAnterior, isNovo ? 'criar' : 'atualizar');
  } catch (e) {
    Logger.log('[PDV] Erro ao sincronizar com IA: ' + e.message);
  }

  // Salva o ID da memória na planilha
  if (memoriaId && memoriaId !== memoriaIdAnterior) {
    sh.getRange(linhaExistente, PDV_COL.MEMORIA_ID).setValue(memoriaId);
  }

  registrarLog('pdv_salvar', 'ok', { id: id, nome: produto.nome }, '', { usuario: sessao.email, acao: 'salvar_produto_pdv' });
  Logger.log('[PDV] Produto ' + (isNovo ? 'criado' : 'atualizado') + ': ' + id + ' — ' + produto.nome);
  return { ok: true, id: id, memoriaId: memoriaId };
}

// ──────────────────────────────────────────────────────────────
//  EXCLUSÃO
// ──────────────────────────────────────────────────────────────

function excluirProdutoPDV(id, authToken) {
  var sessao = requireAuth(authToken, 'admin');
  var sh = _garantirAbaPDV_();
  var d  = sh.getDataRange().getValues();

  for (var i = 1; i < d.length; i++) {
    if (String(d[i][0]).trim() === String(id).trim()) {
      var memoriaId = String(d[i][PDV_COL.MEMORIA_ID - 1] || '');

      // Remove da memória da IA
      if (memoriaId) {
        try { _removerDaIA(memoriaId); } catch (e) {
          Logger.log('[PDV] Erro ao remover da IA: ' + e.message);
        }
      }

      sh.deleteRow(i + 1);
      registrarLog('pdv_excluir', 'ok', { id: id }, '', { usuario: sessao.email, acao: 'excluir_produto_pdv' });
      Logger.log('[PDV] Produto excluído: ' + id);
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Produto não encontrado: ' + id };
}

// ──────────────────────────────────────────────────────────────
//  SINCRONIZAÇÃO COM MEMÓRIA DO THAYNAN IA (GPT Maker)
// ──────────────────────────────────────────────────────────────

/**
 * Sincroniza produto com a memória da IA via GPT Maker API.
 *
 * Endpoint (GPT Maker v2):
 *  POST /workspace/{wid}/agent/{aid}/memory   → criar
 *  PUT  /workspace/{wid}/agent/{aid}/memory/{memoriaId} → atualizar
 *  DELETE /workspace/{wid}/agent/{aid}/memory/{memoriaId} → remover
 *
 * Estrutura esperada do body:
 *  { "title": "...", "content": "..." }
 *
 * ⚠️  Se o endpoint mudar, atualize apenas as 3 funções abaixo.
 */

function _sincronizarComIA(produto, memoriaIdExistente, acao) {
  var conteudo = _gerarConteudoMemoria(produto);
  var titulo   = '[PDV] ' + String(produto.nome || 'Produto').substring(0, 100);
  var base     = '/workspace/' + CONFIG.GPTMAKER_WORKSPACE_ID + '/agent/' + CONFIG.GPTMAKER_AGENT_ID + '/memory';

  if (acao === 'criar' || !memoriaIdExistente) {
    var resp = chamarGPTMaker('POST', base, { title: titulo, content: conteudo });
    var novoId = (resp && (resp.id || resp._id || (resp.data && resp.data.id))) || '';
    Logger.log('[PDV] Memória criada na IA. ID: ' + novoId);
    return novoId;
  } else {
    // Tenta atualizar; se falhar com 404, recria
    try {
      chamarGPTMaker('PUT', base + '/' + memoriaIdExistente, { title: titulo, content: conteudo });
      Logger.log('[PDV] Memória atualizada na IA. ID: ' + memoriaIdExistente);
      return memoriaIdExistente;
    } catch (e) {
      if (e.message && e.message.indexOf('404') > -1) {
        Logger.log('[PDV] Memória ' + memoriaIdExistente + ' não encontrada. Recriando...');
        var respR = chamarGPTMaker('POST', base, { title: titulo, content: conteudo });
        var recriadoId = (respR && (respR.id || respR._id || (respR.data && respR.data.id))) || '';
        return recriadoId;
      }
      throw e;
    }
  }
}

function _removerDaIA(memoriaId) {
  var endpoint = '/workspace/' + CONFIG.GPTMAKER_WORKSPACE_ID + '/agent/' + CONFIG.GPTMAKER_AGENT_ID + '/memory/' + memoriaId;
  try {
    chamarGPTMaker('DELETE', endpoint, null);
    Logger.log('[PDV] Memória removida da IA. ID: ' + memoriaId);
  } catch (e) {
    // 404 = já não existe, ok
    if (e.message && e.message.indexOf('404') > -1) return;
    throw e;
  }
}

/**
 * Gera o conteúdo textual estruturado para treinar a IA sobre o produto.
 * Formato otimizado para a IA entender e responder sobre a peça.
 */
function _gerarConteudoMemoria(p) {
  var linhas = [
    'PRODUTO: ' + (p.nome || ''),
    'CATEGORIA: ' + (p.categoria || ''),
    'MARCA: ' + (p.marca || ''),
    'PREÇO: R$ ' + (_toFloat(p.preco) || '—'),
  ];
  if (p.desconto && _toFloat(p.desconto) > 0) {
    linhas.push('PREÇO COM DESCONTO: R$ ' + _toFloat(p.desconto));
  }
  if (p.descricao)    linhas.push('DESCRIÇÃO: ' + p.descricao);
  if (p.modelos)      linhas.push('MODELOS COMPATÍVEIS: ' + p.modelos);
  if (p.motorizacao)  linhas.push('MOTORIZAÇÃO: ' + p.motorizacao);
  if (p.ano)          linhas.push('ANO(S): ' + p.ano);
  if (p.veiculos)     linhas.push('VEÍCULOS COMPATÍVEIS: ' + p.veiculos);
  if (p.obs)          linhas.push('OBSERVAÇÕES TÉCNICAS: ' + p.obs);
  linhas.push('');
  linhas.push('INSTRUÇÕES PARA A IA:');
  linhas.push('Se o cliente perguntar por este produto ou peça compatível, você pode informar o preço diretamente e oferecer o orçamento sem triagem completa. Confirme apenas o modelo e ano do veículo antes de fechar.');
  return linhas.join('\n');
}

// ──────────────────────────────────────────────────────────────
//  CRIAÇÃO DA ABA PDV
// ──────────────────────────────────────────────────────────────

function _garantirAbaPDV_() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(PDV_SHEET);
  if (sh) return sh;
  return _criarAbaPDV_(ss);
}

function _criarAbaPDV_(ss) {
  var sh = ss.insertSheet(PDV_SHEET);
  var headers = [
    'ID', 'Nome', 'Foto (URL)', 'Descrição', 'Preço (R$)', 'Desconto (R$)',
    'Categoria', 'Marca', 'Modelo(s)', 'Motorização', 'Ano',
    'Veículos Compatíveis', 'Obs. Técnicas', 'Ativo', 'Memória ID IA',
    'Criado em', 'Atualizado em',
  ];
  var hdrRange = sh.getRange(1, 1, 1, headers.length);
  hdrRange.setValues([headers]);
  hdrRange.setFontWeight('bold').setBackground('#7C3AED').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 140);
  sh.setColumnWidth(2, 200);
  sh.setColumnWidth(3, 220);
  sh.setColumnWidth(4, 250);
  sh.setColumnWidth(5, 100);
  sh.setColumnWidth(6, 100);
  sh.setColumnWidth(7, 120);
  sh.setColumnWidth(8, 120);
  sh.setColumnWidth(9, 200);
  sh.setColumnWidth(10, 120);
  sh.setColumnWidth(11, 100);
  sh.setColumnWidth(12, 250);
  sh.setColumnWidth(13, 200);
  sh.setColumnWidth(14, 70);
  sh.setColumnWidth(15, 180);
  sh.setColumnWidth(16, 160);
  sh.setColumnWidth(17, 160);
  Logger.log('[PDV] Aba "' + PDV_SHEET + '" criada com sucesso.');
  return sh;
}

// ──────────────────────────────────────────────────────────────
//  HELPER
// ──────────────────────────────────────────────────────────────

function _toFloat(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '0').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ──────────────────────────────────────────────────────────────
//  SINCRONIZAÇÃO EM MASSA (use para reprocessar tudo de uma vez)
// ──────────────────────────────────────────────────────────────

/**
 * Re-sincroniza TODOS os produtos ativos do PDV com a memória da IA.
 * Execute manualmente pelo editor do Apps Script quando necessário.
 */
function sincronizarTodoPDVComIA(authToken) {
  if (authToken) requireAuth(authToken, 'admin');
  var sh = _garantirAbaPDV_();
  var d  = sh.getDataRange().getValues();
  if (d.length < 2) return { ok: true, sincronizados: 0 };

  var hdrs = d[0];
  var ok = 0; var erros = 0;

  for (var i = 1; i < d.length; i++) {
    var row = d[i];
    if (String(row[PDV_COL.ATIVO - 1]).toLowerCase() === 'false') continue;

    var produto = {};
    hdrs.forEach(function(h, j) { produto[String(h)] = row[j]; });

    try {
      var memoriaIdAnt = String(row[PDV_COL.MEMORIA_ID - 1] || '');
      var id = String(row[0]);
      var p = { id: id, nome: produto['Nome'], descricao: produto['Descrição'],
        preco: produto['Preço (R$)'], desconto: produto['Desconto (R$)'],
        categoria: produto['Categoria'], marca: produto['Marca'],
        modelos: produto['Modelo(s)'], motorizacao: produto['Motorização'],
        ano: produto['Ano'], veiculos: produto['Veículos Compatíveis'], obs: produto['Obs. Técnicas'] };
      var novoId = _sincronizarComIA(p, memoriaIdAnt, memoriaIdAnt ? 'atualizar' : 'criar');
      if (novoId && novoId !== memoriaIdAnt) {
        sh.getRange(i + 1, PDV_COL.MEMORIA_ID).setValue(novoId);
      }
      ok++;
      Utilities.sleep(300);
    } catch (e) {
      erros++;
      Logger.log('[PDV] Erro ao sincronizar ' + d[i][0] + ': ' + e.message);
    }
  }

  Logger.log('[PDV] Sync em massa: ok=' + ok + ' erros=' + erros);
  return { ok: true, sincronizados: ok, erros: erros };
}
