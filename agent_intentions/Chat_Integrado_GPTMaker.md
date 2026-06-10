# Chat Integrado GPT Maker — Guia Completo de Implementação

> **Propósito deste arquivo:** Transferir o conhecimento exato de como o Chat Integrado foi implementado no CRM Milvolts para uma nova sessão de Claude Code, permitindo reproduzir o mesmo sistema em outro projeto (ex: CRM Dextra Peça) com menos de 10% do tempo original.
>
> **Como usar:** Jogue este arquivo inteiro em um novo contexto de Claude Code e use o prompt final ao final deste documento.

---

## 1. O que é o Chat Integrado

O Chat Integrado é um painel de conversa WhatsApp embutido dentro do **modal de oportunidade** do CRM. Quando o atendente abre um card de lead, o modal se divide em dois painéis:

- **Esquerdo (44%):** dados do cliente, veículo e negociação — colapsáveis
- **Direito (56%):** histórico completo de mensagens WhatsApp em tempo real + composer para enviar mensagens, imagens e áudios

A fonte de dados é a API GPT Maker v2, que gerencia os chats do WhatsApp. O CRM **não chama a API diretamente do navegador** — chama via `google.script.run` → `dashboard_servidor.gs` → `servicos.gs` → GPT Maker API. Isso protege as credenciais e contorna CORS.

---

## 2. Arquitetura de Dados

### Campo-chave: `Contato` (chatId)

O link entre um card do CRM e o chat do GPT Maker é o campo `Contato` na planilha (coluna da linha do lead). Esse campo armazena o **chatId do GPT Maker** — um ID único por conversa/contato.

```
Lead na planilha  →  campo "Contato"  →  chatId GPT Maker
ex: "68xxxxxxxx-..."                     (string longa, ex: 68-char UUID)
```

Ao abrir o modal:
```javascript
var chatId = String(card['Contato'] || card.contato || '').trim();
S._chatId  = chatId || null;
```

Se `chatId.length < 10`, o chat não está disponível para aquele lead.

---

## 3. Estrutura HTML do Modal (Split Layout)

O modal tem layout `display:flex` com dois painéis filhos:

```html
<div id="modal-ov">              <!-- overlay, position:fixed, z-index:500 -->
  <div class="modal">            <!-- max 1080px × 800px, border-radius:16px -->
    <div class="m-hd">           <!-- header: título + botão fechar -->
    <div class="m-split">        <!-- flex row, flex:1, overflow:hidden -->
      <div class="m-left">       <!-- 44%, border-right, scrollável -->
        <div class="m-left-body">
          <div id="m-info"></div> <!-- seções colapsáveis injetadas por JS -->
        </div>
        <div class="m-left-footer">
          <div id="m-acts"></div> <!-- botões de ação (Salvar, Venda fechada, etc.) -->
        </div>
      </div>
      <div class="m-right">      <!-- flex:1, chat panel -->
        <div id="m-chat-panel">  <!-- injetado por _initChatPanel() -->
```

**Responsivo (≤820px):** `.m-split` vira `flex-direction:column`, `.m-left` limita a `max-height:52vh`.

---

## 4. CSS Completo do Chat (copiar para index.html)

### 4.1 Modal Split Layout

```css
#modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.46);backdrop-filter:blur(5px);z-index:500;display:none;align-items:center;justify-content:center;padding:12px;}
#modal-ov.open{display:flex;animation:fbg .18s ease;}
@keyframes fbg{from{opacity:0;}to{opacity:1;}}
.modal{background:var(--surface);border:1px solid var(--bd);border-radius:16px;width:min(1080px,97vw);height:min(88vh,800px);box-shadow:0 24px 64px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.04);display:flex;flex-direction:column;overflow:hidden;animation:mIn .22s cubic-bezier(.34,1.25,.64,1);}
@keyframes mIn{from{opacity:0;transform:scale(.93) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}}
.m-hd{padding:13px 18px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0;background:var(--surface);}
.m-title{font-size:.88rem;font-weight:700;line-height:1.3;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.m-close{width:28px;height:28px;border-radius:7px;border:1px solid var(--bd);background:none;color:var(--txt3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all var(--t);}
.m-close:hover{border-color:var(--red);color:var(--red);background:var(--redd);}
.m-split{display:flex;flex:1;min-height:0;overflow:hidden;}
.m-left{width:44%;min-width:300px;border-right:1px solid var(--bd);display:flex;flex-direction:column;overflow:hidden;}
.m-left-body{padding:14px 15px;flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--bd) transparent;}
.m-left-footer{padding:10px 14px;border-top:1px solid var(--bd);background:var(--surface);flex-shrink:0;}
```

### 4.2 Painel Direito — Chat Container

```css
.m-right{flex:1;min-width:0;display:flex;flex-direction:column;background:#F5F8FF;overflow:hidden;}
[data-theme="dark"] .m-right{background:#0b1627;}
.mc-hd{padding:11px 15px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:10px;background:var(--surface);flex-shrink:0;}
.mc-hd-av{width:35px;height:35px;border-radius:50%;background:var(--royal);color:#fff;font-size:.78rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;letter-spacing:-.5px;}
.mc-hd-info{flex:1;min-width:0;}
.mc-hd-name{font-size:.81rem;font-weight:700;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mc-hd-status{display:flex;align-items:center;gap:5px;font-size:.64rem;color:var(--txt3);margin-top:1px;}
.mc-hd-dot{width:6px;height:6px;border-radius:50%;background:#22C55E;flex-shrink:0;animation:pulse-dot 2s ease-in-out infinite;}
@keyframes pulse-dot{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.4);}50%{box-shadow:0 0 0 4px rgba(34,197,94,0);}}
.mc-hd-acts{display:flex;gap:4px;}
.mc-hd-btn{width:30px;height:30px;border-radius:7px;border:1px solid var(--bd);background:none;color:var(--txt3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all var(--t);text-decoration:none;}
.mc-hd-btn:hover{background:var(--sf2);color:var(--royal);border-color:var(--royal);}
```

### 4.3 Área de Mensagens + Bubbles

```css
.mc-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:6px;scrollbar-width:thin;scrollbar-color:var(--bd) transparent;}
.mc-sys{text-align:center;font-size:.63rem;color:var(--txt3);background:rgba(0,0,0,.05);border-radius:99px;padding:4px 12px;margin:4px auto;max-width:300px;flex-shrink:0;}
[data-theme="dark"] .mc-sys{background:rgba(255,255,255,.06);}
.mc-row{display:flex;align-items:flex-end;gap:7px;}
.mc-row.out{flex-direction:row-reverse;}
.mc-msg-wrap{display:flex;flex-direction:column;max-width:78%;}
.mc-row.in  .mc-msg-wrap{align-items:flex-start;}
.mc-row.out .mc-msg-wrap{align-items:flex-end;}
.mc-bubble{padding:8px 11px;border-radius:12px;font-size:.77rem;line-height:1.5;word-break:break-word;width:fit-content;max-width:100%;}
.mc-row.in .mc-bubble{background:#fff;border:1px solid #E5E7EB;border-bottom-left-radius:3px;color:#111827;}
[data-theme="dark"] .mc-row.in .mc-bubble{background:#1a2744;border-color:#2a3a5e;color:var(--txt);}
.mc-row.out .mc-bubble{background:#1D4ED8;color:#fff;border-bottom-right-radius:3px;}
.mc-ts{font-size:.59rem;color:var(--txt3);margin-top:3px;opacity:.65;}
.mc-row.out .mc-ts{text-align:right;color:rgba(255,255,255,.55);}
.mc-av-sm{width:24px;height:24px;border-radius:50%;background:var(--sf2);border:1px solid var(--bd);font-size:.55rem;font-weight:700;color:var(--txt3);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.mc-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--txt3);font-size:.77rem;padding:24px;text-align:center;}
```

### 4.4 Composer (Área de Digitação)

```css
.mc-composer-wrap{border-top:1px solid var(--bd);background:var(--surface);flex-shrink:0;}
.mc-composer{display:flex;align-items:center;gap:7px;padding:9px 13px;}
.mc-input-wrap{flex:1;background:var(--sf2);border:1px solid var(--bd);border-radius:22px;display:flex;align-items:center;gap:5px;padding:6px 11px;transition:border-color var(--t);}
.mc-input-wrap:focus-within{border-color:var(--royal);}
.mc-txt{flex:1;background:none;border:none;outline:none;font-family:var(--f);font-size:.79rem;color:var(--txt);resize:none;height:22px;max-height:88px;line-height:1.4;overflow-y:auto;}
.mc-txt::placeholder{color:var(--txt3);}
.mc-ico{background:none;border:none;cursor:pointer;color:var(--txt3);width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:all var(--t);flex-shrink:0;padding:0;}
.mc-ico:hover{color:var(--royal);background:var(--rd);}
.mc-send{width:37px;height:37px;border-radius:50%;background:var(--royal);border:none;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;transition:all var(--t);flex-shrink:0;}
.mc-send:hover{filter:brightness(1.1);transform:scale(1.06);}
.mc-send:disabled{opacity:.38;cursor:not-allowed;transform:none;}
.mc-drop{padding:6px 13px 9px;border-top:1px dashed var(--bd);text-align:center;font-size:.63rem;color:var(--txt3);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;}
.mc-drop:hover{color:var(--royal);}
```

### 4.5 Rich Message Types (Áudio, Imagem, Vídeo, Documento)

```css
.mc-sender{font-size:.59rem;font-weight:700;color:var(--royal);margin-bottom:3px;}
.mc-row.out .mc-sender{text-align:right;color:rgba(255,255,255,.75);}
.mc-date-sep{display:flex;align-items:center;gap:8px;margin:10px 0 4px;flex-shrink:0;}
.mc-date-sep::before,.mc-date-sep::after{content:'';flex:1;height:1px;background:var(--bd);}
.mc-date-sep-text{font-size:.59rem;color:var(--txt3);white-space:nowrap;font-weight:600;padding:0 4px;}
.mc-notif{display:flex;align-items:center;justify-content:center;gap:7px;margin:6px auto;padding:4px 14px;background:rgba(29,78,216,.07);border:1px solid rgba(29,78,216,.14);border-radius:99px;max-width:90%;flex-shrink:0;}
.mc-notif-label{font-size:.61rem;color:var(--royal);font-weight:600;}
.mc-notif-time{font-size:.57rem;color:var(--txt3);}
[data-theme="dark"] .mc-notif{background:rgba(29,78,216,.15);border-color:rgba(29,78,216,.25);}
/* Audio */
.mc-bubble-audio{padding:9px!important;min-width:200px!important;}
.mc-row.in  .mc-bubble-audio{background:var(--sf2)!important;border-color:var(--bd)!important;color:var(--txt)!important;}
.mc-row.out .mc-bubble-audio{background:rgba(255,255,255,.13)!important;border-color:rgba(255,255,255,.22)!important;}
.mc-audio{display:flex;align-items:center;gap:8px;}
.mc-audio-play{width:30px;height:30px;border-radius:50%;background:var(--royal);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:filter var(--t);}
.mc-audio-play:hover{filter:brightness(1.12);}
.mc-row.out .mc-audio-play{background:rgba(255,255,255,.9);color:var(--royal);}
.mc-audio-play .svg-icon{width:12px;height:12px;}
.mc-audio-track{flex:1;height:3px;background:rgba(0,0,0,.1);border-radius:99px;cursor:pointer;overflow:hidden;}
.mc-row.out .mc-audio-track{background:rgba(255,255,255,.28);}
.mc-audio-fill{height:100%;width:0%;border-radius:99px;background:var(--royal);transition:width .1s linear;}
.mc-row.out .mc-audio-fill{background:rgba(255,255,255,.82);}
.mc-audio-time{font-size:.59rem;color:var(--txt3);white-space:nowrap;min-width:28px;text-align:right;}
.mc-row.out .mc-audio-time{color:rgba(255,255,255,.65);}
.mc-audio-transcript-wrap{margin-top:6px;}
.mc-audio-transcript-btn{background:none;border:none;color:var(--txt3);font-size:.62rem;cursor:pointer;padding:2px 0;font-family:var(--f);}
.mc-row.out .mc-audio-transcript-btn{color:rgba(255,255,255,.6);}
.mc-audio-transcript{font-size:.7rem;color:var(--txt2);line-height:1.5;margin-top:4px;padding:6px 8px;background:rgba(0,0,0,.04);border-radius:6px;font-style:italic;}
.mc-row.out .mc-audio-transcript{background:rgba(255,255,255,.1);color:rgba(255,255,255,.78);}
/* Imagem */
.mc-bubble-img{padding:4px!important;background:transparent!important;border:1px solid var(--bd)!important;overflow:hidden!important;}
.mc-row.out .mc-bubble-img{border-color:rgba(255,255,255,.22)!important;}
.mc-img{display:block;max-width:220px;max-height:180px;border-radius:6px;cursor:zoom-in;object-fit:cover;transition:opacity .2s;}
.mc-img:hover{opacity:.86;}
/* Vídeo */
.mc-bubble-vid{padding:0!important;background:#000!important;border:1px solid var(--bd)!important;overflow:hidden!important;border-radius:10px!important;position:relative;cursor:pointer;}
.mc-video{width:220px;max-width:100%;display:block;height:auto;border-radius:6px;}
.mc-vid-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.32);transition:background .2s;pointer-events:none;}
.mc-bubble-vid:hover .mc-vid-overlay{background:rgba(0,0,0,.52);}
.mc-vid-overlay .svg-icon{width:28px;height:28px;color:#fff;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));}
/* Documento */
.mc-bubble-doc{display:flex!important;align-items:center;gap:9px;min-width:170px;max-width:250px;}
.mc-doc-icon{width:32px;height:32px;border-radius:8px;background:var(--rd);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.mc-doc-icon .svg-icon{width:15px;height:15px;color:var(--royal);}
.mc-row.out .mc-doc-icon{background:rgba(255,255,255,.18);}
.mc-row.out .mc-doc-icon .svg-icon{color:#fff;}
.mc-doc-info{flex:1;min-width:0;}
.mc-doc-name{font-size:.72rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mc-doc-dl{width:26px;height:26px;border-radius:6px;border:1px solid var(--bd);background:none;color:var(--txt3);display:flex;align-items:center;justify-content:center;flex-shrink:0;text-decoration:none;transition:all var(--t);}
.mc-doc-dl:hover{color:var(--royal);border-color:var(--royal);}
.mc-doc-dl .svg-icon{width:13px;height:13px;}
.mc-row.out .mc-doc-dl{border-color:rgba(255,255,255,.4);color:rgba(255,255,255,.7);}
/* Lightbox imagem */
#mc-lightbox{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;cursor:zoom-out;}
#mc-lightbox.open{display:flex;animation:mIn .15s ease;}
#mc-lightbox img{max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 4px 40px rgba(0,0,0,.5);cursor:default;}
.mc-lb-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.3rem;transition:background .2s;line-height:1;z-index:1;}
.mc-lb-close:hover{background:rgba(255,255,255,.24);}
/* Lightbox vídeo */
#mc-video-lb{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.94);display:none;align-items:center;justify-content:center;cursor:zoom-out;}
#mc-video-lb.open{display:flex;animation:mIn .15s ease;}
#mc-video-lb video{max-width:90vw;max-height:86vh;border-radius:8px;box-shadow:0 4px 40px rgba(0,0,0,.6);cursor:default;}
/* Botão "Mensagens anteriores" */
.mc-load-more-wrap{display:flex;justify-content:center;padding:8px 0 4px;flex-shrink:0;}
.mc-load-more{border:1px solid var(--bd);background:var(--sf2);color:var(--txt2);font-size:.67rem;font-family:var(--f);padding:5px 16px;border-radius:99px;cursor:pointer;transition:all var(--t);display:flex;align-items:center;gap:7px;}
.mc-load-more:hover:not(:disabled){border-color:var(--royal);color:var(--royal);}
.mc-load-more:disabled{opacity:.5;cursor:not-allowed;}
.mc-load-more .sp{width:11px;height:11px;border-width:1.5px;}
/* Strip de preview de imagem no composer */
#mc-att-strip{padding:5px 10px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid var(--bd);}
.mc-att-thumb{position:relative;display:inline-flex;flex-direction:column;align-items:center;}
.mc-att-thumb img{width:52px;height:52px;object-fit:cover;border-radius:7px;border:1px solid var(--bd);display:block;}
.mc-att-rm{position:absolute;top:-6px;right:-6px;width:17px;height:17px;border-radius:50%;background:#EF4444;border:2px solid var(--surface);color:#fff;font-size:.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;z-index:1;}
.mc-att-info{font-size:.62rem;color:var(--txt3);max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px;}
/* Badge de não lidas no kanban */
.kc{position:relative;overflow:visible!important;}
.kc-unread{position:absolute;top:-6px;left:-4px;min-width:18px;height:18px;border-radius:99px;background:#EF4444;color:#fff;font-size:.59rem;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid var(--bg,#f4f6fb);z-index:3;animation:urdp 2.5s ease-in-out infinite;}
[data-theme="dark"] .kc-unread{border-color:var(--surface);}
@keyframes urdp{0%,100%{transform:scale(1);}50%{transform:scale(1.18);}}
/* Context menu do chat */
.mc-hd-acts{position:relative;}
.mc-ctx{position:absolute;top:calc(100% + 5px);right:0;min-width:188px;background:var(--surface);border:1px solid var(--bd);border-radius:10px;padding:4px 0;box-shadow:0 8px 28px rgba(0,0,0,.14);z-index:300;animation:mIn .13s ease;}
.mc-ctx button{display:flex;align-items:center;gap:9px;width:100%;padding:8px 14px;background:none;border:none;font-size:.77rem;font-family:var(--f);color:var(--txt);cursor:pointer;transition:background var(--t);text-align:left;white-space:nowrap;}
.mc-ctx button:hover{background:var(--rd);}
.mc-ctx .mc-ctx-d{color:#EF4444;}
.mc-ctx-sep{height:1px;background:var(--bd);margin:3px 0;}
/* Responsivo */
@media(max-width:820px){
  .m-split{flex-direction:column;}
  .m-left{width:100%;min-width:0;border-right:none;border-bottom:1px solid var(--bd);max-height:52vh;}
  .m-right{min-height:280px;}
}
```

### 4.6 Seções Colapsáveis do Painel Esquerdo

```css
.mi-sec{border:1px solid var(--bd);border-radius:10px;overflow:hidden;margin-bottom:9px;}
.mi-sec-hd{display:flex;align-items:center;gap:7px;padding:8px 11px;background:var(--sf2);cursor:pointer;user-select:none;font-size:.73rem;font-weight:600;color:var(--txt);border:none;width:100%;text-align:left;transition:background var(--t);}
.mi-sec-hd:hover{background:var(--rd);}
.mi-sec-hd svg{width:14px;height:14px;opacity:.55;flex-shrink:0;}
.mi-sec-chev{margin-left:auto;transition:transform var(--t);opacity:.45;}
.mi-sec-hd.open .mi-sec-chev{transform:rotate(180deg);}
.mi-sec-body{padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px 10px;}
.mi-sec-body.closed{display:none;}
.mi-sec-body .full{grid-column:1/-1;}
.mi-sec-body .mi{display:flex;flex-direction:column;gap:2px;}
.mi-sec-body .mi-lbl{font-size:.63rem;font-weight:600;color:var(--txt3);letter-spacing:.02em;text-transform:uppercase;}
.mi-sec-body .mi-val{font-size:.78rem;color:var(--txt);}
```

---

## 5. JavaScript do Frontend (index.html)

### 5.1 Estado Global do Chat

```javascript
// ── Chat State ──────────────────────────────────────────────────
var _CS = {
  chatId   : null,
  seenIds  : {},   // { id → true } — IDs já renderizados (evita duplicatas)
  messages : [],   // todos os objetos msg (para export)
  page     : 1,    // última página de histórico carregada
  maxPage  : 10,   // limite de paginação para trás
  hasMore  : true,
  pollTimer: null,
  pollBusy : false,
};
var _unread    = {}; // { chatId → count } — badge de não lidas no kanban
var _pendingImg = null; // { dataUrl, mime, name } — imagem prestes a ser enviada
```

### 5.2 _initChatPanel(card) — Inicialização

Chamado ao abrir o modal. Injeta o HTML inteiro do painel de chat e inicia a carga:

```javascript
function _initChatPanel(card) {
  var panel = document.getElementById('m-chat-panel');
  if (!panel) return;
  if (!card) {
    panel.innerHTML = '<div class="mc-state">'+svgIcon('chat')+'<span>Chat não disponível</span></div>';
    return;
  }
  var nome     = (card.nomeCliente && card.nomeCliente !== '—') ? card.nomeCliente : (card.oportunidade || 'Cliente');
  var initials = nome.replace(/[^a-zA-ZÀ-ÿ ]/g,'').split(' ').filter(Boolean).slice(0,2).map(function(w){return w[0].toUpperCase();}).join('') || 'CL';
  var waNum    = String(card.whatsapp || '').replace(/\D/g,'');
  var chatId   = String(card['Contato'] || card.contato || '').trim();
  S._chatId   = chatId || null;

  panel.innerHTML =
    '<div class="mc-hd">' +
      '<div class="mc-hd-av">'+initials+'</div>' +
      '<div class="mc-hd-info">' +
        '<div class="mc-hd-name">'+esc(nome)+'</div>' +
        '<div class="mc-hd-status"><div class="mc-hd-dot"></div>WhatsApp</div>' +
      '</div>' +
      '<div class="mc-hd-acts">' +
        '<button class="mc-hd-btn" title="Buscar no chat" onclick="_chatSearch()">'+svgIcon('search')+'</button>' +
        (waNum.length >= 8 ? '<a class="mc-hd-btn" href="https://wa.me/'+waNum+'" target="_blank" rel="noopener" title="Abrir WhatsApp">'+svgIcon('whatsapp')+'</a>' : '') +
        '<button class="mc-hd-btn" title="Opções" onclick="_chatMenu(this)">'+svgIcon('more-v')+'</button>' +
      '</div>' +
    '</div>' +
    '<div class="mc-msgs" id="mc-msgs">' +
      '<div class="mc-state" id="mc-state">' +
        '<div class="sp" style="width:22px;height:22px;border-width:2px"></div>' +
        '<span>Carregando mensagens...</span>' +
      '</div>' +
    '</div>' +
    '<div class="mc-composer-wrap">' +
      '<input type="file" id="mc-file-img" accept="image/*" style="display:none" onchange="_chatFileChange(this)">' +
      '<div id="mc-att-strip" style="display:none"></div>' +
      '<div class="mc-composer">' +
        '<div class="mc-input-wrap">' +
          '<button class="mc-ico" title="Emoji" onclick="_chatEmoji()">'+svgIcon('emoji')+'</button>' +
          '<textarea class="mc-txt" id="mc-input" placeholder="Digite uma mensagem..." rows="1"' +
            ' onkeydown="_chatKeydown(event)" oninput="_chatResize(this)"></textarea>' +
          '<button class="mc-ico" title="Imagem (ou cole Ctrl+V)" onclick="_chatImage()">'+svgIcon('image')+'</button>' +
          '<button class="mc-ico" title="Anexar" onclick="_chatAttach()">'+svgIcon('paperclip')+'</button>' +
        '</div>' +
        '<button class="mc-ico" title="Áudio" onclick="_chatAudio()" style="margin-left:2px">'+svgIcon('mic')+'</button>' +
        '<button class="mc-send" id="mc-send-btn" title="Enviar" onclick="_chatSend()">'+svgIcon('send')+'</button>' +
      '</div>' +
      '<div class="mc-drop" onclick="_chatAttach()">'+svgIcon('upload')+
        '<span>Arraste arquivos aqui ou clique para enviar · Imagens, docs e arquivos (máx. 10MB)</span>'+
      '</div>' +
      '<div id="mc-rec-bar" style="display:none"></div>' +
    '</div>';

  // Listener de paste para imagem (remove antes de re-adicionar)
  var mcPanel = document.getElementById('m-chat-panel');
  if (mcPanel) {
    mcPanel.removeEventListener('paste', _chatHandlePaste);
    mcPanel.addEventListener('paste', _chatHandlePaste);
  }

  if (chatId && chatId.length > 10) {
    _chatLoad(chatId);
  } else {
    document.getElementById('mc-state').innerHTML =
      svgIcon('chat') +
      '<span style="margin-top:6px">Chat indisponível</span>' +
      '<span style="font-size:.66rem;opacity:.55">chatId não encontrado neste lead</span>';
  }
}
```

### 5.3 Carga e Polling de Mensagens

```javascript
function _chatLoad(chatId) {
  _CS.chatId = chatId; _CS.seenIds = {}; _CS.messages = [];
  _CS.page = 1; _CS.hasMore = true; _CS.pollBusy = false;
  _chatStopPolling();
  google.script.run
    .withSuccessHandler(function(msgs) { _chatRender(msgs); _chatStartPolling(chatId); })
    .withFailureHandler(function(e) {
      var st = document.getElementById('mc-state');
      if (st) st.innerHTML = '<span style="color:var(--red)">'+svgIcon('alert')+'Erro ao carregar</span><span style="font-size:.66rem">'+esc(e.message||'')+'</span>';
    })
    .getModalChatMessages(chatId, S.authToken, 1);
}

function _chatStartPolling(chatId) {
  _chatStopPolling();
  _CS.chatId = chatId;
  _CS.pollTimer = setInterval(_chatPollOnce, 8000); // polling a cada 8 segundos
}
function _chatStopPolling() {
  if (_CS.pollTimer) { clearInterval(_CS.pollTimer); _CS.pollTimer = null; }
  _CS.pollBusy = false;
}
function _chatPollOnce() {
  if (_CS.pollBusy || !_CS.chatId) return;
  _CS.pollBusy = true;
  google.script.run
    .withSuccessHandler(function(msgs) {
      _CS.pollBusy = false;
      if (!msgs || !msgs.length) return;
      var novo = msgs.filter(function(m){ return m.id && !_CS.seenIds[m.id]; });
      if (!novo.length) return;
      novo.forEach(function(m){ _CS.seenIds[m.id] = true; });
      var hasInbound = novo.some(function(m){ return m.role === 'user' && m.type !== 'NOTIFICATION'; });
      if (hasInbound) {
        _notifBeep(); // som de notificação — implementar se não existir
        _addUnread(_CS.chatId, novo.filter(function(m){ return m.role==='user' && m.type!=='NOTIFICATION'; }).length);
      }
      _chatAppendMsgs(novo);
    })
    .withFailureHandler(function(){ _CS.pollBusy = false; })
    .getModalChatMessages(_CS.chatId, S.authToken, 1);
}
```

> **Nota:** O polling usa `setInterval` de 8s. `google.script.run` é assíncrono — se uma chamada ainda está em andamento (`pollBusy`), a próxima é ignorada para não empilhar requisições.

### 5.4 Renderização de Mensagens

```javascript
function _chatRender(msgs) {
  var el = document.getElementById('mc-msgs');
  if (!el) return;
  if (!msgs || !msgs.length) {
    el.innerHTML = '<div class="mc-state">'+svgIcon('chat')+'<span>Nenhuma mensagem encontrada</span></div>';
    _CS.hasMore = false; return;
  }
  msgs.sort(function(a,b){
    var sa=a.sequence||0, sb=b.sequence||0;
    if (sa && sb && sa!==sb) return sa-sb;
    return (a.time||0)-(b.time||0);
  });
  msgs.forEach(function(m){ if(m.id){ _CS.seenIds[m.id]=true; _CS.messages.push(m); } });
  _CS.hasMore = msgs.length >= 9;
  var loadMoreHtml = _CS.hasMore
    ? '<div class="mc-load-more-wrap"><button class="mc-load-more" id="mc-load-more-btn" onclick="_chatLoadMore()"><span>Mensagens anteriores</span><div class="sp" style="display:none"></div></button></div>'
    : '';
  var msgsHtml = '', lastDay = null;
  msgs.forEach(function(m) {
    if (m.time) {
      var d = new Date(m.time), dayKey = d.toLocaleDateString('pt-BR');
      if (dayKey !== lastDay) {
        lastDay = dayKey;
        var today = new Date().toLocaleDateString('pt-BR');
        var yest  = new Date(Date.now()-86400000).toLocaleDateString('pt-BR');
        var lbl   = dayKey===today ? 'Hoje' : (dayKey===yest ? 'Ontem' : dayKey);
        msgsHtml += '<div class="mc-date-sep"><span class="mc-date-sep-text">'+lbl+'</span></div>';
      }
    }
    msgsHtml += _chatRenderMsg(m);
  });
  el.innerHTML = loadMoreHtml + msgsHtml;
  el.scrollTop = el.scrollHeight;
}

function _chatRenderMsg(m) {
  var type      = String(m.type || 'TEXT').toUpperCase();
  var role      = String(m.role || 'user').toLowerCase();
  var notifType = m.conversationNotificationType || '';
  var time      = m.time ? new Date(m.time) : null;
  var ts        = time ? time.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
  if (type === 'NOTIFICATION') return _chatMsgNotif(notifType, ts);
  var isOut  = (role === 'assistant');
  var dir    = isOut ? 'out' : 'in';
  var sender = m.assistantName || m.agentName || null;
  var senderHtml = sender ? '<div class="mc-sender">'+(isOut?'🤖 ':'')+esc(sender)+'</div>' : '';
  var tsHtml = ts ? '<div class="mc-ts">'+ts+'</div>' : '';
  var avLetter = sender ? (sender[0]||'?').toUpperCase() : 'C';
  var avHtml = !isOut ? '<div class="mc-av-sm">'+avLetter+'</div>' : '';
  var bubble = '';
  switch(type) {
    case 'TEXT':     if (!m.text) return ''; bubble = '<div class="mc-bubble">'+esc(m.text).replace(/\n/g,'<br>')+'</div>'; break;
    case 'AUDIO':    bubble = _chatBubAudio(m, isOut); break;
    case 'IMAGE':    bubble = _chatBubImg(m, isOut);   break;
    case 'VIDEO':    bubble = _chatBubVid(m, isOut);   break;
    case 'DOCUMENT': bubble = _chatBubDoc(m, isOut);   break;
    default: if (!m.text) return ''; bubble = '<div class="mc-bubble">'+esc(m.text).replace(/\n/g,'<br>')+'</div>';
  }
  if (!bubble) return '';
  return '<div class="mc-row '+dir+'">' + avHtml +
    '<div class="mc-msg-wrap">' + senderHtml + bubble + tsHtml + '</div>' +
  '</div>';
}

function _chatMsgNotif(notifType, ts) {
  var labels = {
    'TRANSFER_QUEUE':'Transferido para fila de atendimento','HUMAN_TAKEOVER':'Atendimento assumido por operador',
    'BOT_TAKEOVER':'IA retomou o atendimento','CONVERSATION_START':'Conversa iniciada',
    'CONVERSATION_END':'Conversa encerrada','TRANSFER':'Chat transferido'
  };
  var label = labels[notifType] || (notifType ? notifType.replace(/_/g,' ') : 'Evento do sistema');
  return '<div class="mc-notif"><span class="mc-notif-label">'+esc(label)+'</span>'+(ts?'<span class="mc-notif-time">'+ts+'</span>':'')+' </div>';
}

function _chatBubAudio(m, isOut) {
  var url = esc(m.audioUrl || '');
  var transcript = m.midiaContent || null;
  var html = '<div class="mc-bubble mc-bubble-audio">' +
    '<div class="mc-audio" data-url="'+url+'">' +
      '<button class="mc-audio-play" onclick="_audioToggle(this)">'+svgIcon('play')+'</button>' +
      '<div class="mc-audio-track"><div class="mc-audio-fill"></div></div>' +
      '<span class="mc-audio-time">0:00</span>' +
    '</div>';
  if (transcript) {
    html += '<div class="mc-audio-transcript-wrap">' +
      '<button class="mc-audio-transcript-btn" onclick="_toggleTranscript(this)">Transcrição ▾</button>' +
      '<div class="mc-audio-transcript" style="display:none">'+esc(transcript)+'</div>' +
    '</div>';
  }
  return html + '</div>';
}

function _chatBubImg(m, isOut) {
  var url = m.imageUrl || ''; if (!url) return '';
  var safe = esc(url).replace(/'/g,'&#39;');
  return '<div class="mc-bubble mc-bubble-img"><img class="mc-img" src="'+esc(url)+'" alt="Imagem" loading="lazy" onclick="_openLightbox(\''+safe+'\')"></div>';
}
function _chatBubVid(m, isOut) {
  var url = m.videoUrl || ''; if (!url) return '';
  var safe = esc(url).replace(/'/g,'&#39;');
  return '<div class="mc-bubble mc-bubble-vid" onclick="_openVideoLb(\''+safe+'\')"><video class="mc-video" preload="metadata" src="'+esc(url)+'" playsinline muted></video><div class="mc-vid-overlay">'+svgIcon('play')+'</div></div>';
}
function _chatBubDoc(m, isOut) {
  var url = m.documentUrl || '', name = m.fileName || 'Documento';
  return '<div class="mc-bubble mc-bubble-doc"><div class="mc-doc-icon">'+svgIcon('paperclip')+'</div><div class="mc-doc-info"><div class="mc-doc-name">'+esc(name)+'</div></div>'+(url?'<a class="mc-doc-dl" href="'+esc(url)+'" target="_blank" rel="noopener" title="Baixar">'+svgIcon('download')+'</a>':'')+'</div>';
}
```

### 5.5 Player de Áudio Nativo

```javascript
var _audioEl = {};
function _audioToggle(btn) {
  var wrap = btn.closest ? btn.closest('.mc-audio') : (function(n){ while(n && !n.className.match(/\bmc-audio\b/)) n=n.parentNode; return n; })(btn);
  if (!wrap) return;
  var url = wrap.getAttribute('data-url'); if (!url) return;
  if (!_audioEl[url]) {
    var a = new Audio(); a.crossOrigin = 'anonymous'; a.src = url; _audioEl[url] = a;
    a.addEventListener('timeupdate', function() {
      var pct = a.duration ? (a.currentTime/a.duration*100) : 0;
      var fill = wrap.querySelector('.mc-audio-fill'), tm = wrap.querySelector('.mc-audio-time');
      if (fill) fill.style.width = pct+'%';
      if (tm)   tm.textContent   = _fmtAudioTime(a.currentTime);
    });
    a.addEventListener('ended', function() { btn.innerHTML = svgIcon('play'); var fill=wrap.querySelector('.mc-audio-fill'); if(fill) fill.style.width='0%'; });
    a.addEventListener('error', function() { var tm=wrap.querySelector('.mc-audio-time'); if(tm) tm.textContent='erro'; });
  }
  var audio = _audioEl[url];
  if (audio.paused) {
    Object.keys(_audioEl).forEach(function(k){ if(k!==url && !_audioEl[k].paused) _audioEl[k].pause(); });
    audio.play().catch(function(){});
    btn.innerHTML = svgIcon('pause');
  } else { audio.pause(); btn.innerHTML = svgIcon('play'); }
}
function _fmtAudioTime(s) { s=Math.floor(s||0); var m=Math.floor(s/60),sec=s%60; return m+':'+(sec<10?'0':'')+sec; }
function _toggleTranscript(btn) {
  var el = btn.nextElementSibling; if (!el) return;
  var open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  btn.textContent = open ? 'Transcrição ▾' : 'Transcrição ▴';
}
```

### 5.6 Lightbox (Imagem e Vídeo)

```javascript
function _openLightbox(url) {
  var lb = document.getElementById('mc-lightbox');
  if (!lb) {
    lb = document.createElement('div'); lb.id = 'mc-lightbox';
    lb.innerHTML = '<button class="mc-lb-close" onclick="_closeLightbox()">×</button><img id="mc-lb-img" src="" alt="Imagem">';
    lb.addEventListener('click', function(e){ if(e.target===lb) _closeLightbox(); });
    document.body.appendChild(lb);
  }
  var img = document.getElementById('mc-lb-img'); if (img) img.src = url;
  lb.classList.add('open'); document.addEventListener('keydown', _lbKey);
}
function _closeLightbox() { var lb=document.getElementById('mc-lightbox'); if(lb) lb.classList.remove('open'); document.removeEventListener('keydown',_lbKey); }
function _lbKey(e) { if(e.key==='Escape') _closeLightbox(); }

var _videoLbEl = null;
function _openVideoLb(url) {
  if (!_videoLbEl) {
    _videoLbEl = document.createElement('div'); _videoLbEl.id = 'mc-video-lb';
    _videoLbEl.innerHTML = '<button class="mc-lb-close" onclick="_closeVideoLb()">×</button><video id="mc-lb-vid" controls autoplay playsinline src=""></video>';
    _videoLbEl.addEventListener('click', function(e){ if(e.target===_videoLbEl) _closeVideoLb(); });
    document.body.appendChild(_videoLbEl);
  }
  var v = document.getElementById('mc-lb-vid'); if (v) { v.src = url; v.play().catch(function(){}); }
  _videoLbEl.classList.add('open'); document.addEventListener('keydown', _vidLbKey);
}
function _closeVideoLb() {
  if (!_videoLbEl) return; _videoLbEl.classList.remove('open');
  var v=document.getElementById('mc-lb-vid'); if(v){ v.pause(); v.src=''; }
  document.removeEventListener('keydown', _vidLbKey);
}
function _vidLbKey(e) { if(e.key==='Escape') _closeVideoLb(); }
```

### 5.7 Envio de Mensagens

```javascript
function _chatSend() {
  var inp = document.getElementById('mc-input'), btn = document.getElementById('mc-send-btn');
  if (!inp || !btn) return;
  var txt = (inp.value || '').trim(), hasImg = !!_pendingImg;
  if (!txt && !hasImg) return;
  if (!S._chatId) { toast('ChatId não disponível para este lead.','erro'); return; }
  _btnStart(btn);
  var now = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  var tmpId = 'mc-tmp-'+Date.now();
  var msgEl = document.getElementById('mc-msgs');
  var chatId = S._chatId;
  // Otimismo: mostra mensagem imediatamente
  var tmp = document.createElement('div'); tmp.className='mc-row out'; tmp.id=tmpId;
  var optContent = hasImg ? '<img src="'+_pendingImg.dataUrl+'" style="max-width:160px;max-height:160px;border-radius:8px;display:block">' : '<div class="mc-bubble">'+esc(txt).replace(/\n/g,'<br>')+'</div>';
  tmp.innerHTML = '<div class="mc-msg-wrap">'+optContent+'<div class="mc-ts">'+now+' · enviando...</div></div>';
  if (msgEl) { msgEl.appendChild(tmp); msgEl.scrollTop=msgEl.scrollHeight; }
  inp.value=''; _chatResize(inp);
  var imgSnap = _pendingImg ? { dataUrl:_pendingImg.dataUrl, mime:_pendingImg.mime, name:_pendingImg.name } : null;
  _chatRemoveImg();
  function onOk(r) {
    _btnDone(btn, !!(r && r.ok));
    var el=document.getElementById(tmpId); if(el) el.remove();
    if (r && r.ok) { _CS.pollBusy=false; setTimeout(_chatPollOnce,600); }
    else {
      var errDiv=document.createElement('div'); errDiv.className='mc-row out';
      errDiv.innerHTML='<div class="mc-msg-wrap"><div class="mc-bubble" style="background:#FEE2E2;color:#DC2626">Não enviado — tente novamente</div><div class="mc-ts">'+now+' ✗</div></div>';
      if(msgEl) msgEl.appendChild(errDiv);
      toast((r&&r.erro)||'Erro ao enviar.','erro');
    }
  }
  function onFail(e) { _btnDone(btn,false); var el=document.getElementById(tmpId); if(el) el.remove(); toast('Erro: '+e.message,'erro'); }
  if (imgSnap) {
    google.script.run.withSuccessHandler(onOk).withFailureHandler(onFail)
      .enviarImagemModal(chatId, imgSnap.dataUrl, imgSnap.mime, S.authToken);
    if (txt) setTimeout(function(){
      google.script.run.withSuccessHandler(function(){}).withFailureHandler(function(){})
        .enviarMensagemModal(chatId, txt, S.authToken);
    }, 800);
  } else {
    google.script.run.withSuccessHandler(onOk).withFailureHandler(onFail)
      .enviarMensagemModal(chatId, txt, S.authToken);
  }
}
function _chatKeydown(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();_chatSend();} }
function _chatResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,88)+'px'; }
```

### 5.8 Preview e Upload de Imagem

```javascript
function _chatImage() { var fi=document.getElementById('mc-file-img'); if(fi) fi.click(); }
function _chatFileChange(input) {
  var file = input && input.files && input.files[0]; if(!file) return;
  if (!file.type.startsWith('image/')) { toast('Selecione apenas imagens.','erro'); return; }
  if (file.size > 4194304) { toast('Imagem muito grande. Máximo: 4MB.','erro'); return; }
  var reader = new FileReader();
  reader.onload = function(ev){ _chatShowImgPreview(ev.target.result, file.type, file.name); };
  reader.readAsDataURL(file); input.value='';
}
function _chatHandlePaste(e) {
  var items = e.clipboardData && e.clipboardData.items; if(!items) return;
  for (var i=0;i<items.length;i++) {
    if (items[i].type.indexOf('image')!==-1) {
      e.preventDefault(); var file=items[i].getAsFile(); if(!file) return;
      if (file.size>4194304) { toast('Imagem muito grande. Máximo: 4MB.','erro'); return; }
      var reader=new FileReader();
      reader.onload=function(ev){ _chatShowImgPreview(ev.target.result, file.type, file.name||'imagem.jpg'); };
      reader.readAsDataURL(file); break;
    }
  }
}
function _chatShowImgPreview(dataUrl, mime, name) {
  _pendingImg = { dataUrl:dataUrl, mime:mime, name:name };
  var strip = document.getElementById('mc-att-strip');
  if (!strip) return;
  strip.style.display='flex';
  strip.innerHTML='<div class="mc-att-thumb"><img src="'+dataUrl+'" alt="preview"><button class="mc-att-rm" onclick="_chatRemoveImg()" title="Remover">×</button><div class="mc-att-info">'+esc(name)+'</div></div>';
}
function _chatRemoveImg() {
  _pendingImg=null;
  var strip=document.getElementById('mc-att-strip'); if(strip){ strip.style.display='none'; strip.innerHTML=''; }
}
```

### 5.9 Gravação e Envio de Áudio (MediaRecorder)

```javascript
// ── Áudio via MediaRecorder ─────────────────────────────────────────
var _recorder = { stream:null, rec:null, chunks:[], blob:null, timer:null, elapsed:0 };

function _chatAudio() {
  if (_recorder.rec && _recorder.rec.state === 'recording') {
    _stopRecording(true); // para e envia
  } else {
    _startRecording();
  }
}

function _startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('Gravação de áudio não suportada neste navegador.','erro'); return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    _recorder.stream = stream; _recorder.chunks = []; _recorder.blob = null; _recorder.elapsed = 0;
    var mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    var rec = new MediaRecorder(stream, { mimeType: mime }); _recorder.rec = rec;
    rec.ondataavailable = function(e){ if(e.data && e.data.size>0) _recorder.chunks.push(e.data); };
    rec.onstop = function() {
      _recorder.blob = new Blob(_recorder.chunks, { type: mime });
      _recorder.chunks = [];
      if (_recorder._sendOnStop) _sendRecording();
    };
    rec.start(200);
    _showRecBar(true);
    _recorder.timer = setInterval(function(){
      _recorder.elapsed++;
      var el = document.getElementById('mc-rec-time');
      if (el) el.textContent = _fmtAudioTime(_recorder.elapsed);
      if (_recorder.elapsed >= 120) _stopRecording(true); // limite: 2 min
    }, 1000);
  }).catch(function(e){ toast('Não foi possível acessar o microfone: '+e.message,'erro'); });
}

function _stopRecording(send) {
  _recorder._sendOnStop = !!send;
  clearInterval(_recorder.timer); _recorder.timer=null;
  if (_recorder.rec && _recorder.rec.state!=='inactive') _recorder.rec.stop();
  if (_recorder.stream) { _recorder.stream.getTracks().forEach(function(t){t.stop();}); _recorder.stream=null; }
  _showRecBar(false);
}

function _showRecBar(show) {
  var bar = document.getElementById('mc-rec-bar'); if(!bar) return;
  if (show) {
    bar.style.display='flex';
    bar.style.cssText='display:flex;align-items:center;gap:9px;padding:6px 13px;border-top:1px solid var(--bd);background:var(--surface);';
    bar.innerHTML=
      '<div style="width:8px;height:8px;border-radius:50%;background:#EF4444;animation:pulse-dot 1s infinite"></div>'+
      '<span style="font-size:.72rem;color:var(--txt)">Gravando... <span id="mc-rec-time">0:00</span></span>'+
      '<button onclick="_stopRecording(false)" style="margin-left:auto;background:none;border:1px solid var(--bd);border-radius:6px;padding:3px 9px;font-size:.67rem;cursor:pointer;color:var(--txt2)">Cancelar</button>'+
      '<button onclick="_stopRecording(true)" style="background:var(--royal);color:#fff;border:none;border-radius:6px;padding:3px 9px;font-size:.67rem;cursor:pointer">Enviar</button>';
  } else { bar.style.display='none'; bar.innerHTML=''; }
}

function _sendRecording() {
  if (!_recorder.blob || !S._chatId) return;
  var chatId = S._chatId;
  var mime = _recorder.blob.type || 'audio/webm';
  var reader = new FileReader();
  reader.onload = function(ev) {
    var dataUrl = ev.target.result;
    var btn = document.getElementById('mc-send-btn'); if(btn) _btnStart(btn);
    google.script.run
      .withSuccessHandler(function(r){
        if(btn) _btnDone(btn,!!(r&&r.ok));
        if(!(r&&r.ok)) toast((r&&r.erro)||'Erro ao enviar áudio.','erro');
        else { _CS.pollBusy=false; setTimeout(_chatPollOnce,600); }
      })
      .withFailureHandler(function(e){ if(btn) _btnDone(btn,false); toast('Erro: '+e.message,'erro'); })
      .enviarAudioModal(chatId, dataUrl, mime, S.authToken);
  };
  reader.readAsDataURL(_recorder.blob);
}
```

### 5.10 Painel Esquerdo — Seções Colapsáveis

```javascript
// Helper para construir seção colapsável genérica
function mkSec(id, icon, label, openByDefault, innerHtml) {
  var hdCls  = 'mi-sec-hd' + (openByDefault ? ' open' : '');
  var hidden = openByDefault ? '' : ' style="display:none"';
  return '<div class="mi-sec">' +
    '<button class="' + hdCls + '" id="msh-' + id + '" data-sec="' + id + '" onclick="_miToggleSec(this)">' +
      svgIcon(icon) + label +
      '<span class="mi-sec-chev">' + svgIcon('chevron-d') + '</span>' +
    '</button>' +
    '<div id="msb-' + id + '"' + hidden + '>' + innerHtml + '</div>' +
  '</div>';
}

// Toggle de abertura/fechamento
function _miToggleSec(btn) {
  var sec = btn.getAttribute('data-sec');
  var body = document.getElementById('msb-' + sec);
  if (!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  btn.classList.toggle('open', !isOpen);
}

// Seção customizada: Ficha do Cliente (colapsada por padrão, com mini-header sempre visível)
// O botão exibe avatar + nome + WhatsApp — o conteúdo expande ao clicar
var fichaSecHtml =
  '<div class="mi-sec">' +
    '<button class="mi-sec-hd" id="msh-cliente" data-sec="cliente" onclick="_miToggleSec(this)" style="min-height:52px;padding:7px 11px">' +
      '<div class="mi-client-av2" style="width:36px;height:36px;font-size:.85rem;flex-shrink:0">' + initials + '</div>' +
      '<div style="min-width:0;flex:1;text-align:left;line-height:1.35">' +
        '<div style="font-size:.83rem;font-weight:700;color:var(--txt)">' + esc(nomeRaw) + '</div>' +
        '<div style="font-size:.67rem;color:var(--txt3);font-weight:400;display:flex;align-items:center;gap:4px">' +
          svgIcon('whatsapp') + (waNum.length >= 8 ? waFmt : 'WhatsApp não cadastrado') +
        '</div>' +
      '</div>' +
      '<span class="mi-sec-chev">' + svgIcon('chevron-d') + '</span>' +
    '</button>' +
    '<div id="msb-cliente" style="display:none">' + fichaCamposHtml + '</div>' +
  '</div>';

// Montagem final — injetar no div#m-info
document.getElementById('m-info').innerHTML =
  fichaSecHtml +
  mkSec('veiculo', 'car',  'Veículo',    true, veicHtml)  +
  mkSec('negoc',   'star', 'Negociação', true, negocHtml);
```

### 5.11 Badges de Não Lidas no Kanban

```javascript
var _unread = {}; // { chatId → count }

function _addUnread(chatId, inc) {
  if (!chatId) return;
  _unread[chatId] = (_unread[chatId] || 0) + (inc || 1);
  // Atualiza badge no card kanban que corresponde a este chatId
  S.leads && S.leads.forEach && S.leads.forEach(function(r) {
    if (String(r['Contato']||r.contato||'').trim() === String(chatId).trim()) {
      // Encontra o card e adiciona/atualiza badge
      var proto = r.protocolo || '';
      var cardEl = document.querySelector('[data-proto="'+proto+'"]');
      if (cardEl) {
        cardEl.classList.add('kc');
        var badge = cardEl.querySelector('.kc-unread');
        var cnt = _unread[chatId];
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'kc-unread';
          cardEl.appendChild(badge);
        }
        badge.textContent = cnt > 99 ? '99+' : cnt;
      }
    }
  });
}

function _clearUnread(chatId) {
  if (!chatId) return;
  _unread[chatId] = 0;
  // Remove badge do card correspondente
  S.leads && S.leads.forEach && S.leads.forEach(function(r) {
    if (String(r['Contato']||r.contato||'').trim() === String(chatId).trim()) {
      var proto = r.protocolo || '';
      var cardEl = document.querySelector('[data-proto="'+proto+'"]');
      if (cardEl) {
        var badge = cardEl.querySelector('.kc-unread');
        if (badge) badge.remove();
      }
    }
  });
}
```

---

## 6. Backend — dashboard_servidor.gs

Estas três funções são as únicas chamadas pelo frontend via `google.script.run`. Elas ficam em `dashboard_servidor.gs` (ou qualquer arquivo `.gs` do projeto).

### 6.1 getModalChatMessages

```javascript
/**
 * Busca mensagens do chat GPT Maker para exibir no painel da modal.
 * @param {string} chatId      - ID do chat (campo "Contato" da planilha)
 * @param {string} authToken   - Token de autenticação do usuário CRM
 * @param {number} page        - Página (1 = mais recente, 2 = anterior…)
 * @returns {Array}            - Array normalizado de mensagens
 */
function getModalChatMessages(chatId, authToken, page) {
  requireAuth(authToken, 'operador');
  if (!chatId || chatId.length < 10) return [];
  page = page || 1;
  try {
    var msgs = gptMakerGetMensagens(chatId, 10, page);
    var result = (msgs || []).map(function(m) {
      return {
        id:                           String(m.id || ''),
        sequence:                     m.sequence || 0,
        role:                         String(m.role || 'user'),
        type:                         String(m.type || 'TEXT'),
        conversationNotificationType: m.conversationNotificationType || null,
        text:                         String(m.text || m.content || m.message || ''),
        midiaContent:                 m.midiaContent || null,
        audioUrl:                     m.audioUrl || null,
        imageUrl:                     m.imageUrl || null,
        videoUrl:                     m.videoUrl || null,
        documentUrl:                  m.documentUrl || null,
        fileName:                     m.fileName || null,
        assistantName:                m.assistantName || null,
        agentName:                    m.agentName || null,
        userName:                     m.userName || null,
        time:                         m.time || null,
        sequence:                     m.sequence || 0,
      };
    });
    result.sort(function(a,b){
      var sa=a.sequence||0,sb=b.sequence||0;
      if(sa&&sb&&sa!==sb) return sa-sb;
      return (a.time||0)-(b.time||0);
    });
    return result;
  } catch(e) { return []; }
}
```

### 6.2 enviarMensagemModal

```javascript
function enviarMensagemModal(chatId, texto, authToken) {
  requireAuth(authToken, 'operador');
  if (!chatId || !texto) return { ok: false, erro: 'chatId ou texto inválido' };
  try {
    gptMakerEnviarMensagem(chatId, texto);
    return { ok: true };
  } catch(e) { return { ok: false, erro: e.message }; }
}
```

### 6.3 enviarImagemModal

```javascript
/**
 * Upload da imagem para Google Drive (URL pública) → envia via GPT Maker.
 * ⚠️  drive.usercontent.google.com — único formato que funciona sem redirect de login.
 */
function enviarImagemModal(chatId, dataUrl, mimeType, authToken) {
  requireAuth(authToken, 'operador');
  if (!chatId || !dataUrl) return { ok: false, erro: 'chatId ou imagem ausente' };
  try {
    var raw      = dataUrl.replace(/^data:[^;]+;base64,/, '');
    var ext      = mimeType === 'image/png' ? 'png' : (mimeType === 'image/gif' ? 'gif' : 'jpg');
    var fileName = 'crm-img-' + Date.now() + '.' + ext;
    var bytes = Utilities.base64Decode(raw);
    var blob  = Utilities.newBlob(bytes, mimeType || 'image/jpeg', fileName);
    var file  = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var imageUrl = 'https://drive.usercontent.google.com/download?id=' + file.getId() + '&export=download&authuser=0';
    gptMakerEnviarImagem(chatId, imageUrl, '');
    return { ok: true, imageUrl: imageUrl };
  } catch(e) { return { ok: false, erro: e.message }; }
}
```

### 6.4 enviarAudioModal

```javascript
function enviarAudioModal(chatId, dataUrl, mimeType, authToken) {
  requireAuth(authToken, 'operador');
  if (!chatId || !dataUrl) return { ok: false, erro: 'chatId ou áudio ausente' };
  try {
    var raw      = dataUrl.replace(/^data:[^;]+;base64,/, '');
    var ext      = mimeType && mimeType.includes('ogg') ? 'ogg' : 'webm';
    var fileName = 'crm-audio-' + Date.now() + '.' + ext;
    var mime     = mimeType || 'audio/webm';
    var bytes = Utilities.base64Decode(raw);
    var blob  = Utilities.newBlob(bytes, mime, fileName);
    var file  = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var audioUrl = 'https://drive.usercontent.google.com/download?id=' + file.getId() + '&export=download&authuser=0';
    gptMakerEnviarAudio(chatId, audioUrl);
    return { ok: true, audioUrl: audioUrl };
  } catch(e) { return { ok: false, erro: e.message }; }
}
```

---

## 7. Backend — servicos.gs (Funções GPT Maker de Baixo Nível)

### 7.1 gptMakerGetMensagens

```javascript
function gptMakerGetMensagens(chatId, limit, page) {
  limit = limit || 20; page = page || 1;
  var qs = '/messages?limit=' + limit + (page > 1 ? '&page=' + page : '');
  var resp = chamarGPTMaker('GET', '/chat/' + chatId + qs, null);
  if (Array.isArray(resp))                   return resp;
  if (resp && Array.isArray(resp.data))      return resp.data;
  if (resp && Array.isArray(resp.messages))  return resp.messages;
  return [];
}
```

### 7.2 gptMakerEnviarMensagem

```javascript
function gptMakerEnviarMensagem(chatId, mensagem) {
  // ⚠️  ENDPOINT v2: POST /chat/{chatId}/send-message
  return chamarGPTMaker('POST', '/chat/' + chatId + '/send-message', {
    message:        mensagem,
    replyMessageId: '',
  });
}
```

### 7.3 gptMakerEnviarImagem e Áudio

```javascript
function gptMakerEnviarImagem(chatId, imageUrl, caption) {
  // 'message' é required na API — nunca omitir, nunca null
  return chamarGPTMaker('POST', '/chat/' + chatId + '/send-message', {
    message: caption || ' ', imageUrl: imageUrl
  });
}
function gptMakerEnviarAudio(chatId, audioUrl) {
  // 'message' é required — usar espaço para não violar validação
  return chamarGPTMaker('POST', '/chat/' + chatId + '/send-message', {
    message: ' ', audioUrl: audioUrl
  });
}
```

### 7.4 chamarGPTMaker (função base)

```javascript
function chamarGPTMaker(method, endpoint, body) {
  var _gm  = getGPTMakerConfig_();
  var url  = 'https://api.gptmaker.ai/v2' + endpoint;
  var opts = {
    method:             method,
    headers:            { 'Authorization': 'Bearer ' + _gm.apiKey, 'Content-Type': 'application/json' },
    muteHttpExceptions: true,
  };
  if (body !== null && body !== undefined) opts.payload = JSON.stringify(body);
  var resp = UrlFetchApp.fetch(url, opts);
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) throw new Error('GPT Maker API error ' + code + ': ' + text.substring(0, 200));
  if (!text || text === 'null') return {};
  return JSON.parse(text);
}

function getGPTMakerConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    apiKey:      (props.getProperty('gptmaker_api_key')      || '').trim(),
    workspaceId: (props.getProperty('gptmaker_workspace_id') || '').trim(),
    agentId:     (props.getProperty('gptmaker_agent_id')     || '').trim(),
    channelId:   (props.getProperty('gptmaker_channel_id')   || '').trim(),
  };
}
```

> **Segurança:** As credenciais NUNCA ficam em arquivo `.gs` commitado. Ficam no **Script Properties** (`PropertiesService.getScriptProperties()`). Configurar em: Apps Script → Configurações do Projeto → Propriedades do Script.

---

## 8. Campos do Lead Necessários

O card passado para o modal precisa ter pelo menos estes campos:

| Campo no JS         | Origem (planilha)     | Uso no chat                         |
|---------------------|-----------------------|-------------------------------------|
| `card['Contato']`   | Coluna "Contato"      | chatId GPT Maker — chave principal  |
| `card.nomeCliente`  | Coluna de nome        | Header do chat (avatar + nome)      |
| `card.whatsapp`     | Coluna de WhatsApp    | Link direto wa.me/...               |
| `card.oportunidade` | Coluna de oportunidade| Fallback de nome quando sem cliente |
| `card.protocolo`    | Coluna de protocolo   | Badge de não lidas no kanban        |

---

## 9. Pré-requisitos e Dependências

### 9.1 No projeto GAS
- `servicos.gs` com `chamarGPTMaker`, `gptMakerGetMensagens`, `gptMakerEnviarMensagem`, `gptMakerEnviarImagem`, `gptMakerEnviarAudio`
- `dashboard_servidor.gs` com `getModalChatMessages`, `enviarMensagemModal`, `enviarImagemModal`, `enviarAudioModal`
- `auth.gs` com `requireAuth(token, nivel)` — valida autenticação antes de qualquer operação
- Script Properties configuradas: `gptmaker_api_key`, `gptmaker_workspace_id`, `gptmaker_agent_id`

### 9.2 No frontend (index.html)
- Função `esc(str)` — escapa HTML (deve já existir no projeto)
- Função `svgIcon(name)` — retorna SVG inline. Ícones usados: `chat`, `search`, `whatsapp`, `more-v`, `play`, `pause`, `image`, `paperclip`, `mic`, `send`, `upload`, `emoji`, `alert`, `download`, `chevron-d`, `car`, `star`, `save`, `check-circle`, `x-circle`, `archive`, `trash`
- Função `toast(msg, tipo)` — notificações toast
- Função `_btnStart(btn)` / `_btnDone(btn, ok)` — feedback visual em botões
- Função `_notifBeep()` — som de notificação para mensagens inbound
- `S.authToken` — token de autenticação do usuário logado (global)
- `S.leads` — array de leads carregados (para atualizar badge de não lidas)

### 9.3 No HTML (estrutura mínima)
```html
<!-- No <body>, antes do </body> -->
<div id="modal-ov">
  <div class="modal">
    <div class="m-hd">
      <div class="m-title" id="m-title"></div>
      <button class="m-close" onclick="fecharModal()">×</button>
    </div>
    <div class="m-split">
      <div class="m-left">
        <div class="m-left-body">
          <div id="m-info"></div>
        </div>
        <div class="m-left-footer">
          <div class="m-acts" id="m-acts"></div>
        </div>
      </div>
      <div class="m-right" id="m-chat-panel">
        <!-- Injetado por _initChatPanel() -->
      </div>
    </div>
  </div>
</div>
```

---

## 10. Lições Aprendidas / Armadilhas

### ❌ Imagem enviada mas não aparece no WhatsApp
- **Causa:** URL do Google Drive no formato `drive.google.com/file/d/ID/view` redireciona para login
- **Solução:** Usar SEMPRE `https://drive.usercontent.google.com/download?id=FILE_ID&export=download&authuser=0`

### ❌ `message` required na API GPT Maker para enviar imagem/áudio
- **Causa:** O endpoint `/send-message` exige o campo `message` mesmo para mídia
- **Solução:** Passar `message: caption || ' '` (espaço) — nunca null, nunca omitir

### ❌ Mensagens duplicadas no painel
- **Causa:** Polling sobrescreve mensagens já renderizadas
- **Solução:** `_CS.seenIds` — map `{ id → true }` que filtra antes de renderizar qualquer mensagem nova

### ❌ `google.script.run` demora / trava UI
- **Causa:** Chamadas síncronas ou `pollBusy` não gerenciado
- **Solução:** `_CS.pollBusy = true` antes, `false` no callback. `setInterval` de 8s — não usar intervalo menor que 5s para não sobrepor requisições

### ❌ Áudio sem `crossOrigin` não toca
- **Causa:** Audio API bloqueia conteúdo externo sem CORS header
- **Solução:** `a.crossOrigin = 'anonymous'` antes de definir `a.src`

### ❌ Modal fechado mas polling continua
- **Causa:** `clearInterval` não chamado ao fechar o modal
- **Solução:** Chamar `_chatStopPolling()` na função que fecha o modal

### ❌ Paste de imagem não funciona
- **Causa:** Event listener de `paste` adicionado ao `document` interfere com campos de texto
- **Solução:** Adicionar o listener ao `#m-chat-panel` (não `document`), e fazer `removeEventListener` antes de `addEventListener` para evitar duplicatas

---

## 11. Ordem de Implementação Sugerida

1. **Copiar CSS** (seções 4.1 a 4.6) para dentro do `<style>` do `index.html`
2. **Criar funções backend** em `dashboard_servidor.gs`: `getModalChatMessages`, `enviarMensagemModal`, `enviarImagemModal`, `enviarAudioModal`
3. **Verificar/adaptar `servicos.gs`** — se já tem `chamarGPTMaker`, apenas adicionar `gptMakerGetMensagens`, `gptMakerEnviarMensagem`, `gptMakerEnviarImagem`, `gptMakerEnviarAudio`
4. **Configurar Script Properties**: `gptmaker_api_key`, `gptmaker_workspace_id`, `gptmaker_agent_id`
5. **Adicionar HTML do modal** (seção 9.3) ao `index.html`
6. **Copiar JS do frontend** (seções 5.1 a 5.10) para dentro do `<script>` do `index.html`
7. **Adaptar `openModal(card)`** para chamar `_initChatPanel(card)` ao final + `_clearUnread(chatId)` + `document.getElementById('modal-ov').classList.add('open')`
8. **Adaptar `fecharModal()`** para chamar `_chatStopPolling()`
9. **Verificar que o card passado** contém o campo `Contato` (chatId GPT Maker)
10. **Deploy** via CLASP + teste abrindo um lead real

---

## 12. Prompt para Nova Sessão de Claude Code

Use o seguinte prompt ao iniciar a implementação em outro projeto:

---

```
Você é um expert em Google Apps Script (GAS) + desenvolvimento frontend vanilla JS.

Tenho um CRM existente (projeto: CRM Dextra Peça) que usa a mesma arquitetura de um outro projeto onde o Chat Integrado já foi implementado com sucesso. Estou te passando o documento técnico completo do Chat Integrado (arquivo Chat_Integrado_GPTMaker.md) — leia-o inteiro antes de qualquer ação.

O objetivo é implementar exatamente o mesmo chat no CRM Dextra Peça, que ainda não tem esse recurso. Siga este processo:

1. Primeiro, leia os arquivos relevantes do projeto atual (index.html, servicos.gs, dashboard_servidor.gs, qualquer arquivo .gs existente) para entender o estado atual antes de modificar qualquer coisa.

2. Verifique:
   - O modal de oportunidade já existe? Como está estruturado hoje?
   - Já existe `chamarGPTMaker` / `gptMakerEnviarMensagem` no servicos.gs?
   - Já existe sistema de autenticação (`requireAuth`)?
   - Qual é o campo do lead que armazena o chatId GPT Maker?

3. Adapte o código do documento de referência à estrutura atual do projeto:
   - Não reescreva coisas que já existem
   - Integre o CSS sem quebrar estilos existentes
   - Integre as funções JS sem conflito com as existentes

4. Implemente na ordem da seção 11 do documento.

5. Após implementar, faça deploy via CLASP com o deployment ID fixo do projeto.

Importante:
- Credenciais NUNCA em código: usar apenas Script Properties
- Sempre `gptmaker_api_key`, `gptmaker_workspace_id`, `gptmaker_agent_id` no Script Properties
- Imagens enviadas via Drive: URL deve ser `drive.usercontent.google.com/download?id=...&export=download&authuser=0`
- Campo `message` é required na API GPT Maker mesmo para envio de imagem/áudio
- Polling a cada 8s com `_CS.pollBusy` para evitar empilhamento de requisições
- Chamar `_chatStopPolling()` ao fechar a modal

Comece lendo os arquivos do projeto antes de qualquer implementação.
```

---

*Documento gerado em 2026-06-08. Baseado na implementação do CRM Milvolts (ai-agentic-crm). Todas as funções foram extraídas diretamente do código em produção.*
