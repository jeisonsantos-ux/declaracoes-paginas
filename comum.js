/* ProLEEI-MT: funções usadas pelas duas páginas (pedido e verificação). Não precisa editar. */
function $(id) { return document.getElementById(id); }

function norm(s) {
  return String(s == null ? "" : s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function limpar(no) { while (no.firstChild) no.removeChild(no.firstChild); }

/* cria um elemento; o texto sempre entra como texto (nunca como HTML) */
function h(tag, attrs, filhos) {
  var e = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === "texto") e.textContent = v;
      else if (v === true) e.setAttribute(k, "");
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
  }
  (filhos || []).forEach(function (f) { if (f) e.appendChild(f); });
  return e;
}

function plural(n, um, varios) { return n + " " + (n === 1 ? um : varios); }

/* ---------- conversa com o servidor (Apps Script) ---------- */

/* O endereço do servidor vem de config.js (é o único arquivo que se edita). */
var SITE = window.CONFIG_PAGINAS || {};

/* Valores que o servidor informa (CONFIG do Codigo.gs). Até a resposta chegar, valem estes padrões. */
var CFG = window.CFG = {
  chMax: 126, exigeCpf: true, maxPorEnvio: 300, remetente: "", prazo: "24 horas",
  apoioTi: SITE.apoioTi || "apoioti.proleeimt@gmail.com", carregada: false
};

function apoioTexto() { return "a Equipe de Apoio de TI (" + CFG.apoioTi + ")"; }

function enderecoServidor() {
  var u = String(SITE.servidor || "").replace(/^\s+|\s+$/g, "");
  return /^https:\/\/script\.google\.com\/\S+\/exec$/.test(u) ? u : "";
}

/* Envia um pedido ao servidor e devolve a resposta (já convertida de JSON) a ok(r); qualquer problema vai a falha(texto).
   O corpo vai como texto simples, e não como application/json: assim o navegador não faz a "consulta prévia" (OPTIONS),
   que o Google não atende. */
function chamar(acao, dados, ok, falha) {
  var url = enderecoServidor();
  if (!url) {
    falha(!SITE.servidor || String(SITE.servidor).indexOf("COLE_AQUI") === 0
      ? "Falta configurar o endereço do sistema (arquivo config.js). Quem administra o sistema deve seguir o Passo 7 do LEIA-ME."
      : "O endereço do sistema em config.js não parece certo: ele deve começar com https://script.google.com e terminar em /exec.");
    return;
  }
  var corpo = {};
  Object.keys(dados || {}).forEach(function (k) { corpo[k] = dados[k]; });
  corpo.acao = acao;
  var encerrado = false;
  function fim(f, v) { if (!encerrado) { encerrado = true; f(v); } }
  var xhr = new XMLHttpRequest();
  xhr.open("POST", url, true);
  xhr.timeout = 70000;
  xhr.setRequestHeader("Content-Type", "text/plain;charset=utf-8");
  xhr.onload = function () {
    var r = null;
    try { r = JSON.parse(xhr.responseText); } catch (e) { r = null; }
    if (r && typeof r === "object" && !Array.isArray(r)) { fim(ok, r); return; }
    if (window.console) console.error("Resposta inesperada do servidor (status " + xhr.status + ").");
    fim(falha, "O sistema respondeu de um jeito inesperado. Tente de novo em instantes. Se continuar, avise " + apoioTexto() + ".");
  };
  xhr.onerror = function () {
    if (window.console) console.error("Não foi possível falar com o servidor. Confira o endereço em config.js e se a implantação do Apps Script está como “Qualquer pessoa”.");
    fim(falha, "Não foi possível conectar ao sistema. Confira a sua internet e tente de novo. Se continuar, avise " + apoioTexto() + ".");
  };
  xhr.ontimeout = function () { fim(falha, "O sistema demorou demais para responder. Tente de novo em instantes."); };
  xhr.send(JSON.stringify(corpo));
}

/* Busca os valores do servidor (e já "acorda" o servidor, que demora alguns segundos na primeira vez).
   Várias chamadas seguidas esperam pela mesma resposta. */
var esperandoConfig = [], buscandoConfig = false;
function carregarConfig(ok, falha) {
  if (CFG.carregada) { ok(CFG); return; }
  esperandoConfig.push({ ok: ok, falha: falha });
  if (buscandoConfig) return;
  buscandoConfig = true;
  function terminar(sucesso, msg) {
    buscandoConfig = false;
    var fila = esperandoConfig; esperandoConfig = [];
    fila.forEach(function (f) { if (sucesso) f.ok(CFG); else f.falha(msg); });
  }
  chamar("config", {}, function (r) {
    if (!r || !r.ok) { terminar(false, (r && r.erro) || "O sistema respondeu de um jeito inesperado. Tente de novo em instantes."); return; }
    ["chMax", "exigeCpf", "maxPorEnvio", "remetente", "apoioTi", "prazo"].forEach(function (k) { if (r[k] != null) CFG[k] = r[k]; });
    CFG.carregada = true;
    terminar(true);
  }, function (msg) { terminar(false, msg); });
}

/* código que veio no endereço da página (QR Code): só letras, números e hífen */
function codigoDaUrl() {
  var m = /[?&]codigo=([^&#]*)/.exec(window.location.search || "");
  if (!m) return "";
  try { return decodeURIComponent(m[1].replace(/\+/g, " ")).replace(/[^A-Za-z0-9-]/g, "").slice(0, 20); } catch (e) { return ""; }
}

function svg(tag, attrs) {
  var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  return e;
}

function roseta(cx, cy, r0, amp, lobos) {
  var d = [], passos = 240;
  for (var i = 0; i < passos; i++) {
    var t = i / passos * 2 * Math.PI, r = r0 + amp * Math.cos(lobos * t);
    d.push((i ? "L" : "M") + (cx + r * Math.cos(t)).toFixed(2) + " " + (cy + r * Math.sin(t)).toFixed(2));
  }
  return d.join("") + "Z";
}

/* o selo: roseta com anel pontilhado e uma marca (visto, X ou exclamação) */
function criarSelo(tipo, animado) {
  var s = svg("svg", { viewBox: "0 0 160 160", "class": "selo selo-" + tipo + (animado ? " selo-novo" : ""),
                       "aria-hidden": "true", focusable: "false" });
  s.appendChild(svg("path", { "class": "selo-roseta", d: roseta(80, 80, 72, 3.4, 24) }));
  s.appendChild(svg("circle", { "class": "selo-anel", cx: 80, cy: 80, r: 60 }));
  if (tipo === "ok") {
    s.appendChild(svg("path", { "class": "selo-marca", d: "M53 82 L72 101 L109 58", pathLength: 1 }));
  } else if (tipo === "cancelada") {
    s.appendChild(svg("path", { "class": "selo-marca", d: "M58 58 L102 102 M102 58 L58 102", pathLength: 1 }));
  } else {
    s.appendChild(svg("path", { "class": "selo-marca", d: "M80 50 L80 90", pathLength: 1 }));
    s.appendChild(svg("circle", { "class": "selo-ponto", cx: 80, cy: 108, r: 6.5 }));
  }
  return s;
}

/* junta os atributos de dois objetos (no lugar de Object.assign, que celulares antigos não têm) */
function junta(a, b) {
  var o = {};
  Object.keys(a).forEach(function (k) { o[k] = a[k]; });
  Object.keys(b).forEach(function (k) { o[k] = b[k]; });
  return o;
}

function icone(nome) {
  var s = svg("svg", { viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false" });
  var tr = { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" };
  if (nome === "emitida") {
    s.appendChild(svg("path", junta({ d: "M3 8.5 L6.5 12 L13 4.5" }, tr)));
  } else if (nome === "fila") {
    s.appendChild(svg("circle", junta({ cx: 8, cy: 8, r: 6 }, tr)));
    s.appendChild(svg("path", junta({ d: "M8 4.5 V8 L10.5 9.5" }, tr)));
  } else {
    s.appendChild(svg("path", junta({ d: "M8 3 V9" }, tr)));
    s.appendChild(svg("circle", { cx: 8, cy: 12.4, r: 1.3, fill: "currentColor" }));
  }
  return s;
}

/* o desenho do topo: se o arquivo logo.png faltar no site (por exemplo, esquecido num envio), ele some sem deixar um espaço vazio */
(function () {
  var logo = $("logo-topo");
  if (!logo) return;
  function esconder() { logo.hidden = true; }
  if (logo.complete && logo.naturalWidth === 0) esconder();
  else logo.addEventListener("error", esconder);
})();
