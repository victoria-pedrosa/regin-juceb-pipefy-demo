// ============================================================
// REGIN/JUCEB — Consulta automática + Atualização Pipefy
// Pipes: [P1] Abertura (000000000) | [P2] Alteração (000000000)
// ============================================================

// ── CONFIGURAÇÃO ──────────────────────────────────────────
const CONFIG = {
  pipefyToken: PropertiesService.getScriptProperties().getProperty('PIPEFY_TOKEN'),

  // [P1] Abertura
  p1: {
    pipeId: '000000000',
    protocoloFieldId: 'protocolo_requerimento',
    municipioFieldId:     'munic_pio',
    phases: {
      analiseJunta:  '000000000',
      cnpjLiberado:  '000000000',
      exigenciaJuceb:'000000000',
        concluido:        '000000000',
    }
  },

  // [P2] Alteração
  p2: {
    pipeId: '000000000',
    bapSource: 'COMMENT',
    bapFieldId: 'TODO_FIELD_ID_BAP',
    bapCommentAuthor: 'Negócios',
    protocoloFieldId: 'protocolo',
    phases: {
      analiseViabilidade: '000000000',
      viabilidadeDeferida:'000000000',
      viabilidadeIndeferida:'000000000',
      analiseJunta:       '000000000',
      cnpjLiberado:       '000000000',
      exigenciaJuceb:     '000000000',
        concluido:        '000000000',
    }
  }
};

// ── WEBHOOK RECEIVER (doPost) ──────────────────────────────

function doPost(e) {
  if (!e) { descobrirCamposEFases(); return; }
  try {
    const payload = JSON.parse(e.postData.contents);
    const cardId   = String(payload.data?.card?.id || payload.card_id);
    const phaseId  = String(payload.data?.to?.id   || payload.to_phase_id || '');
    if (!cardId) return jsonResponse({ error: 'no card_id' });
    var _cnpjFases = [CONFIG.p1.phases.cnpjLiberado, CONFIG.p2.phases.cnpjLiberado];
    if (_cnpjFases.indexOf(phaseId) !== -1) {
      _processarCnpjLiberado(cardId, phaseId);
    } else {
      processarCard(cardId, phaseId);
    }
    return jsonResponse({ status: 'ok', cardId });
  } catch(err) {
    Logger.log('doPost error: ' + err);
    return jsonResponse({ error: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── LÓGICA PRINCIPAL ──────────────────────────────────────
function processarCard(cardId, phaseId) {
  const card = getCard(cardId);
  if (!card) return;
  const pipeId = String(card.pipe?.id || '');
  if (pipeId === CONFIG.p1.pipeId) {
    _processarRequerimento(card, CONFIG.p1);
  } else if (pipeId === CONFIG.p2.pipeId) {
    const fases = CONFIG.p2.phases;
    if (phaseId === fases.analiseViabilidade) {
      _processarViabilidade(card, CONFIG.p2);
    } else if (phaseId === fases.analiseJunta) {
      _processarRequerimento(card, CONFIG.p2);
    }
  }
}

// ── FLUXO VIABILIDADE (BAP) ───────────────────────────────
function _processarViabilidade(card, cfg) {
  const bap = _getBapProtocolo(card, cfg);
  if (!bap) {
    addComentario(card.id, '⚠️ REGIN: número BAP não encontrado no card.');
    return;
  }
  const resultado = consultarRegin(bap, 3);
  const situacao  = resultado.situacao;
  const msg = `🔍 REGIN [${bap}] → ${situacao}\nAtualização: ${resultado.dataAtualizacao}`;
  if (situacao.includes('DEFERIDA') && !situacao.includes('INDEFERIDA')) {
    moverCard(card.id, cfg.phases.viabilidadeDeferida);
    addComentario(card.id, '✅ ' + msg);
  } else if (situacao.includes('INDEFERIDA')) {
    moverCard(card.id, cfg.phases.viabilidadeIndeferida);
    addComentario(card.id, '❌ ' + msg);
  } else {
    addComentario(card.id, '⏳ ' + msg);
  }
}

// ── FLUXO REQUERIMENTO (numérico) ─────────────────────────
function _processarRequerimento(card, cfg) {
  const protocolo = getFieldValue(card, cfg.protocoloFieldId);
  if (!protocolo) {
    addComentario(card.id, '⚠️ REGIN: campo PROTOCOLO vazio.');
    return;
  }
  const resultado = consultarRegin(protocolo, 1);
  const situacao  = resultado.situacao;
  const msg = `🔍 REGIN [${protocolo}] → ${situacao}\nAtualização: ${resultado.dataAtualizacao}`;
  if (situacao.includes('DEFERIDO')) {
    moverCard(card.id, cfg.phases.cnpjLiberado);
    addComentario(card.id, '✅ ' + msg);
  } else if (situacao.includes('EXIG')) {
    moverCard(card.id, cfg.phases.exigenciaJuceb);
    addComentario(card.id, '⚠️ ' + msg);
  } else {
    addComentario(card.id, '⏳ ' + msg);
  }
}

// ── CONSULTA REGIN (público, sem login) ───────────────────
function consultarRegin(protocolo, pTipo) {
  const url = `https://regin.juceb.ba.gov.br/regin.externo/CON_DadosIdentificacaoV2.aspx`
            + `?id=${encodeURIComponent(protocolo)}&pTipo=${pTipo}&pTipoTela=CONSULTA`;
  const resp = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = resp.getContentText('UTF-8');
  const mSit = html.match(/SITUA[ÇC][ÃA]O[:\s]*([A-ZÇÃÉÍÓÚÀÂÊÎÔÛÁÈÌÒÙÕ\s]+?)(?:<|[\r\n])/i);
  const situacao = mSit ? mSit[1].trim() : 'SITUAÇÃO NÃO IDENTIFICADA';
  const mDt = html.match(/Dt\.\s*de\s*Atualiza[çc][aã]o[^>]*>[\s]*([0-9\/]{10})/i);
  const dataAtualizacao = mDt ? mDt[1] : '—';
  Logger.log(`REGIN [${protocolo}]: ${situacao}`);
  return { situacao, dataAtualizacao, html };
}

// ── HELPERS BAP ───────────────────────────────────────────
function _getBapProtocolo(card, cfg) {
  if (cfg.bapSource === 'FIELD') {
    return getFieldValue(card, cfg.bapFieldId);
  }
  const comentarios = card.comments || [];
  for (const c of comentarios) {
    if (c.author?.name?.includes(cfg.bapCommentAuthor)) {
      const m = c.text.match(/BAP\d+/);
      if (m) return m[0];
    }
  }
  return null;
}

// ── PIPEFY API ────────────────────────────────────────────
function getCard(cardId) {
  const query = `{
    card(id: ${cardId}) {
      id pipe { id }
      fields { field { id title } value }
      comments { text author { name } }
    }
  }`;
  const data = pipefyQuery(query);
  return data?.card || null;
}

function getFieldValue(card, fieldId) {
  const f = (card.fields || []).find(f => f.field.id === fieldId || f.field.title === fieldId);
  return f?.value || null;
}

function moverCard(cardId, phaseId) {
  const mutation = `mutation {
    moveCardToPhase(input: { card_id: ${cardId}, destination_phase_id: ${phaseId} }) {
      card { id current_phase { id name } }
    }
  }`;
  return pipefyQuery(mutation);
}

function addComentario(cardId, texto) {
  const mutation = `mutation {
    createComment(input: { card_id: ${cardId}, text: "${texto.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" }) {
      comment { id }
    }
  }`;
  return pipefyQuery(mutation);
}

function pipefyQuery(query) {
  const resp = UrlFetchApp.fetch('https://api.pipefy.com/graphql', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${CONFIG.pipefyToken}` },
    payload: JSON.stringify({ query }),
    muteHttpExceptions: true
  });
  const json = JSON.parse(resp.getContentText());
  if (json.errors) Logger.log('Pipefy error: ' + JSON.stringify(json.errors));
  return json.data || null;
}

// ── SETUP HELPERS ─────────────────────────────────────────
// Execute uma vez para descobrir IDs de fases e campos
function listarFasesECampos() {
  ['000000000', '000000000'].forEach(pipeId => {
    const q = `{ pipe(id: ${pipeId}) {
      name
      phases { id name }
      start_form_fields { id label }
    }}`;
    const d = pipefyQuery(q);
    if (!d) return;
    Logger.log('\n=== ' + d.pipe.name + ' ===');
    Logger.log('FASES:');
    d.pipe.phases.forEach(p => Logger.log(`  ${p.id} | ${p.name}`));
    Logger.log('CAMPOS:');
    d.pipe.start_form_fields.forEach(f => Logger.log(`  ${f.id} | ${f.label}`));
  });
}

// Teste manual — execute com um card_id real
function testeManual() {
  const TEST_CARD_ID = 'TODO_CARD_ID_REAL';
  const TEST_PHASE_ID = CONFIG.p2.phases.analiseViabilidade;
  processarCard(TEST_CARD_ID, TEST_PHASE_ID);
}

function listarCamposDeFase() {
  const fases = [
    { id: '000000000', nome: 'Analise Junta P1' },
    { id: '000000000', nome: 'Analise Junta P2' },
    { id: '000000000', nome: 'Analise Viabilidade P2' },
  ];
  fases.forEach(function(fase) {
    const q = '{ phase(id: ' + fase.id + ') { fields { id label } } }';
    const d = pipefyQuery(q);
    if (!d || !d.phase) { Logger.log(fase.nome + ': ERRO'); return; }
    Logger.log('\n=== ' + fase.nome + ' ===');
    (d.phase.fields || []).forEach(function(f) { Logger.log('  ' + f.id + ' | ' + f.label); });
  });
}




// ============================================================
// CONFIGURAR WEBHOOKS NO PIPEFY
// ============================================================
function configurarWebhooks() {
  // Deletar webhooks existentes antes de recriar
  pipefyQuery('mutation { deleteWebhook(input: { id: "000000000" }) { success } }');
  pipefyQuery('mutation { deleteWebhook(input: { id: "000000000" }) { success } }');

  const webAppUrl = 'https://script.google.com/a/macros/exemplo.com.br/s/ID_DEPLOY_EXEMPLO/exec';
  
  const pipes = [
    { id: CONFIG.p1.pipeId, nome: 'P1 Abertura' },
    { id: CONFIG.p2.pipeId, nome: 'P2 Alteração' }
  ];
  
  pipes.forEach(function(pipe) {
    const q = 'mutation { createWebhook(input: { name: "REGIN-Automacao-' + pipe.nome.replace(/ /g, '-') + '" url: "' + webAppUrl + '" pipe_id: ' + pipe.id + ' actions: ["card.move"] }) { webhook { id url } } }';
    
    const result = pipefyQuery(q);
    if (result && result.createWebhook) {
      Logger.log(pipe.nome + ' webhook criado: ID=' + result.createWebhook.webhook.id);
    } else {
      Logger.log(pipe.nome + ' ERRO: ' + JSON.stringify(result));
    }
  });
}


function descobrirCamposEFases() {
  ['000000000','000000000'].forEach(function(pipeId) {
    const q = '{ pipe(id: ' + pipeId + ') { name phases { id name } start_form_fields { id label } } }';
    const d = pipefyQuery(q);
    if (!d || !d.pipe) { Logger.log('PIPE ' + pipeId + ' ERRO'); return; }
    Logger.log('\n=== PIPE: ' + d.pipe.name + ' ===');
    Logger.log('-- FASES --');
    (d.pipe.phases || []).forEach(function(f) { Logger.log('  ' + f.id + ' | ' + f.name); });
    Logger.log('-- START FORM FIELDS --');
    (d.pipe.start_form_fields || []).forEach(function(f) { Logger.log('  ' + f.id + ' | ' + f.label); });
  });
}

// ── CNPJ LIBERADO: Slack + Concluído ────────────────────────
function _processarCnpjLiberado(cardId, phaseId) {
  var cfg;
  if (phaseId === CONFIG.p1.phases.cnpjLiberado) {
    cfg = CONFIG.p1;
    var card = getCard(cardId);
    if (!card) return;
    var municipio = (getFieldValue(card, cfg.municipioFieldId) || '').toLowerCase();
    if (municipio.indexOf('salvador') !== -1) {
      var responsavelId = PropertiesService.getScriptProperties().getProperty('SLACK_RESPONSAVEL_ID') || 'Colaborador 47';
      var msg = ':alert: CNPJ LIBERADO - empresa de *Salvador*. <@' + responsavelId + '> Por favor, salvar os documentos de abertura na pasta da empresa. (Card ID: ' + cardId + ')';
      postSlack(msg);
    }
  } else if (phaseId === CONFIG.p2.phases.cnpjLiberado) {
    cfg = CONFIG.p2;
  }
  if (cfg) { moverCard(cardId, cfg.phases.concluido); }
}

function postSlack(message) {
  var url = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
  if (!url) { Logger.log('SLACK_WEBHOOK_URL nao configurado em Script Properties'); return; }
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: message }),
    muteHttpExceptions: true
  });
}