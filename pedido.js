(function () {
  "use strict";
  var CFG = window.CFG;
  var TELAS = ["entrada", "lista", "revisao", "pronto"];
  var estado = null;
  var itens = [];          /* linhas desenhadas: {c, li, chk, campo, aviso, radios, nomeNorm, travada} */
  var semResultado = null; /* linha "ninguém encontrado" do filtro */
  var comparador = window.Intl && Intl.Collator ? new Intl.Collator("pt-BR", { sensitivity: "base" }) : null;

  function zerar() {
    estado = { email: "", cpf: "", acesso: "", formadora: "", turmas: [], atual: 0, sel: [], erros: {} };
  }
  zerar();

  function comparar(a, b) { return comparador ? comparador.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0); }
  function turma() { return estado.turmas[estado.atual]; }
  function selecao() { return estado.sel[estado.atual]; }
  function chOk(v) { return /^\d{1,4}$/.test(v) && +v >= 1 && +v <= CFG.chMax; }
  /* mensagem de erro de uma carga horária recusada (vazia, zero ou acima do teto) */
  function msgCh(v) {
    return /^\d+$/.test(v) && +v > CFG.chMax
      ? "A carga horária deve ser igual ou menor que " + CFG.chMax + " h."
      : "Informe a carga horária, igual ou menor que " + CFG.chMax + " h.";
  }
  function soDigitos(v) { return String(v || "").replace(/\D/g, "").slice(0, String(CFG.chMax).length); }
  /* CPF: só os números; os dígitos verificadores são conferidos apenas para avisar de erro de digitação */
  function soNumerosCpf(v) { return String(v || "").replace(/\D/g, ""); }
  function cpfValido(d) {
    if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
    for (var n = 9; n <= 10; n++) {
      var soma = 0;
      for (var i = 0; i < n; i++) soma += parseInt(d.charAt(i), 10) * (n + 1 - i);
      if ((soma * 10) % 11 % 10 !== parseInt(d.charAt(n), 10)) return false;
    }
    return true;
  }
  /* texto do erro de um CPF digitado ("" se estiver certo); o servidor usa os mesmos textos */
  function erroDeCpf(d) {
    if (d.length !== 11) return "O CPF precisa ter 11 números e você digitou " + d.length + ". Confira se digitou todos.";
    if (!cpfValido(d)) return "Este CPF não é válido: algum número foi digitado errado. Confira os 11 números e tente de novo.";
    return "";
  }
  /* a quem a formadora deve recorrer quando algo não se resolve na página */
  function apoio() { return "a Equipe de Apoio de TI (" + CFG.apoioTi + ")"; }
  function primeiroNome(n) { return String(n || "").split(" ")[0]; }
  /* "da Turma A" (nome já começa com "Turma") ou "da turma 3B" */
  function daTurma(nome) { return /^turma\b/i.test(nome) ? "da " + nome : "da turma " + nome; }

  function mostrar(nome) {
    TELAS.forEach(function (t) { $("tela-" + t).hidden = (t !== nome); });
    window.scrollTo(0, 0);
    var titulo = $("t-" + nome);
    if (titulo) titulo.focus({ preventScroll: true });
  }

  function ocupado(botao, sim, texto) {
    botao.disabled = sim;
    if (sim) { botao.setAttribute("data-rotulo", botao.textContent); botao.textContent = texto; }
    else if (botao.getAttribute("data-rotulo")) { botao.textContent = botao.getAttribute("data-rotulo"); }
  }

  /* ---------- passo 1: e-mail ---------- */
  function mostrarErroEntrada(msg) {
    var p = $("erro-entrada");
    p.textContent = msg;
    p.hidden = !msg;
  }

  $("form-entrada").addEventListener("submit", function (ev) {
    ev.preventDefault();
    $("aviso-saiu").hidden = true;
    if (!CFG.carregada) {   /* a conexão com o sistema ainda não terminou (ou falhou): tenta de novo e segue */
      var espera = $("btn-entrar");
      ocupado(espera, true, "Conectando...");
      carregarConfig(function () { ocupado(espera, false); aplicarConfig(); espera.click(); },
                     function (msg) { ocupado(espera, false); mostrarErroEntrada(msg); });
      return;
    }
    var email = $("email").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      mostrarErroEntrada("Digite o seu e-mail completo, como nome@exemplo.com.");
      $("email").focus();
      return;
    }
    var cpf = "";
    if (CFG.exigeCpf) {
      cpf = soNumerosCpf($("cpf").value);
      if (!cpf) {
        mostrarErroEntrada("Digite o seu CPF.");
        $("cpf").focus();
        return;
      }
      var erroCpf = erroDeCpf(cpf);
      if (erroCpf) {
        mostrarErroEntrada(erroCpf);
        $("cpf").focus();
        return;
      }
    }
    mostrarErroEntrada("");
    var acesso = $("codigo-acesso").value.trim();
    var botao = $("btn-entrar");
    ocupado(botao, true, "Entrando...");
    chamar("entrar", { email: email, cpf: cpf, acesso: acesso }, function (r) {
      ocupado(botao, false);
      if (!r.ok) {
        if (r.pedeCodigo) { $("campo-codigo").hidden = false; $("codigo-acesso").focus(); }
        mostrarErroEntrada(r.erro);
        return;
      }
      zerar();
      estado.email = r.email;
      estado.cpf = cpf;
      estado.acesso = acesso;
      $("cpf").value = "";   /* o CPF fica só na memória da página, para os próximos envios desta sessão */
      estado.formadora = r.formadora;
      estado.turmas = r.turmas;
      estado.sel = r.turmas.map(function () { return {}; });
      iniciarLista();
    }, function (msg) { ocupado(botao, false); mostrarErroEntrada(msg); });
  });

  $("link-verificar").href = "verificar.html";
  /* o que depende dos valores do servidor (CONFIG do Codigo.gs); roda de novo quando eles chegam */
  function aplicarConfig() {
    $("campo-cpf").hidden = !CFG.exigeCpf;
    $("rodape-lista").textContent = "Não encontrou alguém? Quem já tem declaração fica escondida: marque \u201cMostrar também quem já tem declaração\u201d para vê-la e, " +
      "se precisar, reenviar a declaração ou corrigir a carga horária. Cursistas com cadastro inativo não aparecem aqui. " +
      "Se a cursista não está na lista ou o cadastro dela precisa de ajuste, procure " + apoio() + ".";
  }
  aplicarConfig();
  /* já na abertura da página: busca os valores e acorda o servidor, para o primeiro "Continuar" não esperar */
  carregarConfig(aplicarConfig, function (msg) { mostrarErroEntrada(msg); });

  /* ---------- passo 2: lista ---------- */
  function iniciarLista() {
    $("t-lista").textContent = "Olá, " + primeiroNome(estado.formadora) + ".";
    $("email-sessao").textContent = estado.email;
    var seletor = $("seletor-turma");
    limpar(seletor);
    estado.turmas.forEach(function (t, i) {
      seletor.appendChild(h("option", { value: String(i), texto: t.turma + (t.municipio ? ", " + t.municipio : "") }));
    });
    seletor.value = String(estado.atual);
    $("bloco-turma").hidden = estado.turmas.length < 2;
    $("busca").value = "";
    $("mostrar-emitidas").checked = false;   /* por padrão, quem já tem declaração fica escondida */
    desenharTurma();
    mostrar("lista");
  }

  $("seletor-turma").addEventListener("change", function () {
    estado.atual = +this.value;
    $("busca").value = "";
    desenharTurma();
  });

  function desenharTurma() {
    var t = turma();
    $("titulo-turma").textContent = t.turma + (t.municipio ? ", " + t.municipio : "");
    $("titulo-turma").hidden = estado.turmas.length > 1;   /* com o seletor na tela, o título repetiria a mesma coisa */
    $("aviso-turma").hidden = !t.bloqueada;
    $("aviso-turma-texto").textContent = t.motivo || "";
    $("area-lista").hidden = !!t.bloqueada;
    $("erro-lista").hidden = true;
    montarLinhas();
    atualizarResumo();
    atualizarBarra();
  }

  /* resumo da turma: depende de quem está escondido (quem já tem declaração) */
  function atualizarResumo() {
    var t = turma();
    var mostrando = $("mostrar-emitidas").checked;
    var total = t.cursistas.length;
    var emitidas = t.cursistas.filter(function (c) { return c.estado === "emitida"; }).length;
    var fila = t.cursistas.filter(function (c) { return c.estado === "fila"; }).length;
    var texto = plural(total, "cursista ativa", "cursistas ativas") + " nesta turma";
    if (emitidas || fila) {
      var partes = [];
      if (emitidas) partes.push(plural(emitidas, "com declaração emitida", "com declaração emitida") + (mostrando ? "" : " (fora da lista)"));
      if (fila) partes.push(plural(fila, "na fila para envio", "na fila para envio"));
      texto += ": " + partes.join(" e ");
    }
    $("resumo-turma").textContent = texto + ".";
  }

  function chipDe(c) {
    var rotulo = {
      emitida: "Emitida" + (c.data ? " em " + c.data : "") + (c.ch ? ", com " + c.ch + " h" : ""),
      fila: c.tipo === "reenvio" ? "Reenvio na fila" : c.tipo === "correcao" ? "Correção na fila" : "Na fila para envio",
      pendencia: "Com pendência",
      conflito: "Procure o Apoio de TI"
    }[c.estado];
    if (!rotulo) return null;
    var cor = { emitida: "emitida", fila: "fila", pendencia: "alerta", conflito: "alerta" }[c.estado];
    return h("span", { "class": "chip chip-" + c.estado }, [icone(cor === "alerta" ? "alerta" : c.estado), h("span", { texto: rotulo })]);
  }

  function montarLinhas() {
    var ul = $("lista");
    limpar(ul);
    itens = [];
    semResultado = null;
    var cursistas = turma().cursistas.slice().sort(function (a, b) { return comparar(a.nome, b.nome); });
    if (!cursistas.length) {
      ul.appendChild(h("li", { "class": "vazio", texto: "Nenhuma cursista ativa cadastrada nesta turma. Avise " + apoio() + "." }));
      $("nada-a-pedir").hidden = true;
      return;
    }
    cursistas.forEach(function (c, i) {
      var emitida = c.estado === "emitida";
      var travada = c.estado === "fila" || c.estado === "conflito";
      var chk = h("input", { type: "checkbox", id: "c" + i, disabled: travada });
      var campo = h("input", { type: "text", inputmode: "numeric", autocomplete: "off", maxlength: String(String(CFG.chMax).length),
                               "aria-label": "Carga horária de " + c.nome, readonly: emitida });
      var aviso = h("p", { "class": "linha-aviso", hidden: true });
      var extra = [chipDe(c), c.msg ? h("span", { "class": "msg", texto: c.msg }) : null];
      var radios = [];
      var opcoes = null;
      if (emitida) {
        /* quem já tem declaração: escolher entre reenviar (mesma carga horária) e corrigir (a anterior é anulada) */
        var opcao = function (valor, titulo, explicacao) {
          var r = h("input", { type: "radio", name: "acao-" + i, value: valor });
          radios.push(r);
          return h("label", { "class": "opcao" }, [r, h("span", {}, [h("strong", { texto: titulo }), h("span", { "class": "explica", texto: explicacao })])]);
        };
        opcoes = h("div", { "class": "opcoes", role: "radiogroup", "aria-label": "O que fazer com a declaração de " + c.nome }, [
          opcao("reenviar", "Reenviar a declaração", "Os mesmos dados e a mesma carga horária (" + c.ch + " h), com o mesmo código de verificação."),
          opcao("corrigir", "Corrigir a carga horária", "A declaração anterior (" + c.ch + " h) será anulada e uma nova será emitida com a carga horária que você informar.")
        ]);
      }
      var li = h("li", { "class": "linha" }, [
        chk,
        h("label", { "for": "c" + i, "class": "nome", texto: c.nome }),
        h("span", { "class": "ch" }, [campo, h("span", { texto: "h" })]),
        h("div", { "class": "extra" }, extra),
        opcoes,
        aviso
      ]);
      var item = { c: c, li: li, chk: chk, campo: campo, aviso: aviso, radios: radios, nomeNorm: norm(c.nome), travada: travada };
      chk.addEventListener("change", function () { marcar(item, chk.checked); atualizarBarra(); });
      campo.addEventListener("input", function () {
        campo.value = soDigitos(campo.value);
        var s = selecao()[c.id];
        if (s) s.ch = campo.value;
        delete estado.erros[c.id];
        pintar(item);
        atualizarBarra();
      });
      radios.forEach(function (r) {
        r.addEventListener("change", function () {
          var s = selecao()[c.id];
          if (!s) return;
          s.acao = r.value;
          s.ch = r.value === "corrigir" ? "" : String(c.ch);   /* corrigir: a nova carga horária começa em branco */
          delete estado.erros[c.id];
          pintar(item);
          atualizarBarra();
          if (r.value === "corrigir") campo.focus();
        });
      });
      itens.push(item);
      ul.appendChild(li);
      pintar(item);
    });
    semResultado = h("li", { "class": "vazio", hidden: true });
    ul.appendChild(semResultado);
    filtrar();
  }

  function marcar(item, ligado) {
    var s = selecao(), c = item.c;
    if (ligado) {
      var antes = s[c.id] || {};
      var acao = c.estado === "emitida" ? (antes.acao || "") : "";
      /* a carga horária nunca vem preenchida: cada cursista marcada recebe a CH digitada pela formadora, uma a uma
         (só quem já tem declaração e vai ser reenviada mostra a CH da declaração que já existe) */
      var ch = c.estado === "emitida"
        ? (acao === "corrigir" ? (antes.ch || "") : String(c.ch))
        : (antes.ch || "");
      s[c.id] = { on: true, ch: ch, acao: acao };
    } else if (s[c.id]) {
      s[c.id].on = false;
    }
    delete estado.erros[c.id];
    pintar(item);
  }

  function pintar(item) {
    var c = item.c;
    var s = selecao()[c.id];
    var ligado = !!(s && s.on);
    var erro = estado.erros[c.id];
    var corrigindo = ligado && c.estado === "emitida" && s.acao === "corrigir";
    item.chk.checked = ligado;
    item.li.className = "linha" + (ligado ? " marcada" : "") + (item.travada ? " travada" : "") + (erro ? " com-erro" : "");
    if (ligado && item.campo.value !== s.ch) item.campo.value = s.ch;
    if (c.estado === "emitida") {
      /* a carga horária só pode ser mudada em "corrigir"; em "reenviar" ela é a da declaração emitida */
      item.campo.readOnly = !corrigindo;
      item.campo.setAttribute("aria-label", (corrigindo ? "Nova carga horária de " : "Carga horária de ") + c.nome);
      if (corrigindo) item.campo.setAttribute("placeholder", "nova"); else item.campo.removeAttribute("placeholder");
      item.radios.forEach(function (r) { r.checked = !!(ligado && s.acao === r.value); });
    }
    item.aviso.textContent = erro || "";
    item.aviso.hidden = !erro;
  }

  function visivel(item) {
    var busca = norm($("busca").value);
    if (busca && item.nomeNorm.indexOf(busca) < 0) return false;
    /* quem já tem declaração fica escondida, a menos que a formadora peça para ver ou já a tenha marcado (reenvio ou correção) */
    if (item.c.estado === "emitida" && !$("mostrar-emitidas").checked && !item.chk.checked) return false;
    return true;
  }

  function filtrar() {
    var aparecem = 0;
    itens.forEach(function (it) { var v = visivel(it); it.li.hidden = !v; if (v) aparecem++; });
    if (semResultado) {
      var termo = $("busca").value.trim();
      var busca = norm(termo);
      var escondidaNaBusca = !$("mostrar-emitidas").checked && itens.some(function (it) {
        return it.c.estado === "emitida" && !visivel(it) && (!busca || it.nomeNorm.indexOf(busca) >= 0);
      });
      semResultado.hidden = aparecem > 0;
      semResultado.textContent = termo
        ? "Nenhuma cursista encontrada com \u201c" + termo + "\u201d." + (escondidaNaBusca ? " Quem já tem declaração está escondida: marque \u201cMostrar também quem já tem declaração\u201d." : "")
        : "Todas as cursistas desta turma já têm declaração. Marque \u201cMostrar também quem já tem declaração\u201d para vê-las.";
    }
    atualizarAviso(aparecem);
  }

  /* quando não resta nenhuma cursista para pedir (todas já têm declaração ou estão na fila), a lista avisa e aponta a saída */
  function atualizarAviso(aparecem) {
    var caixa = $("nada-a-pedir");
    var cs = turma().cursistas;
    var podePedir = cs.some(function (c) { return c.estado === "livre" || c.estado === "pendencia"; });
    if (!cs.length || podePedir || !aparecem) { caixa.hidden = true; return; }
    var temEmitidas = cs.some(function (c) { return c.estado === "emitida"; });
    var texto = temEmitidas
      ? "Todas as cursistas desta turma já têm declaração ou estão na fila para envio, então não há mais nada para pedir agora. " +
        ($("mostrar-emitidas").checked
          ? "Para reenviar uma declaração ou corrigir a carga horária, marque a cursista na lista. "
          : "Para reenviar uma declaração ou corrigir a carga horária, marque \u201cMostrar também quem já tem declaração\u201d. ")
      : "Todas as cursistas desta turma já estão na fila para envio, então não há mais nada para pedir agora. ";
    caixa.textContent = texto + "Quando terminar, use \u201cSair\u201d.";
    caixa.hidden = false;
  }

  $("busca").addEventListener("input", filtrar);
  $("mostrar-emitidas").addEventListener("change", function () { filtrar(); atualizarResumo(); });

  function selecionados() {
    var s = selecao();
    return itens.filter(function (it) { return s[it.c.id] && s[it.c.id].on; })
      .map(function (it) { return { c: it.c, ch: s[it.c.id].ch, acao: s[it.c.id].acao || "", item: it }; });
  }

  /* tipo de cada marcada: "nova" (sem declaração), "reenvio" ou "correcao" (já tinha declaração) */
  function tipoDe(x) {
    return x.c.estado !== "emitida" ? "nova" : x.acao === "reenviar" ? "reenvio" : "correcao";
  }

  function descreverTipos(n) {
    var partes = [];
    if (n.nova) partes.push(plural(n.nova, "declaração nova", "declarações novas"));
    if (n.reenvio) partes.push(plural(n.reenvio, "reenvio", "reenvios"));
    if (n.correcao) partes.push(plural(n.correcao, "correção de carga horária", "correções de carga horária"));
    return partes.length > 1 ? partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1] : partes[0];
  }

  function atualizarBarra() {
    var n = selecionados().length;
    $("contagem").textContent = n === 0 ? "Nenhuma cursista marcada" : plural(n, "cursista marcada", "cursistas marcadas");
    $("btn-revisar").disabled = n === 0;
    if (n === 0) $("erro-lista").hidden = true;
  }

  /* sair: apaga da página o e-mail, o CPF e as marcações e volta para a entrada */
  function sair() {
    zerar();
    itens = [];
    limpar($("lista"));
    limpar($("rev-lista"));
    $("rev-texto").textContent = "";
    $("pronto-texto").textContent = "";
    $("pronto-extra").textContent = "";
    $("t-lista").textContent = "";
    $("email-sessao").textContent = "";
    $("resumo-turma").textContent = "";
    $("nada-a-pedir").hidden = true;
    $("email").value = "";
    $("cpf").value = "";
    $("codigo-acesso").value = "";
    $("campo-codigo").hidden = true;
    mostrarErroEntrada("");
    mostrar("entrada");
    $("aviso-saiu").hidden = false;
    $("email").focus();
  }
  $("btn-sair-lista").addEventListener("click", sair);

  /* ---------- passo 3: revisão ---------- */
  $("btn-revisar").addEventListener("click", function () {
    var marcadas = selecionados();
    var problemas = [];   /* {x, msg, tipo}: tipo "ch" (carga horária), "acao" (falta escolher) ou "igual" */
    marcadas.forEach(function (x) {
      var emitida = x.c.estado === "emitida";
      if (emitida && !x.acao) {
        problemas.push({ x: x, tipo: "acao", msg: "Escolha o que fazer: reenviar a declaração ou corrigir a carga horária." });
      } else if (emitida && x.acao === "reenviar") {
        return;   /* a carga horária é a da declaração emitida: nada a conferir */
      } else if (!chOk(x.ch)) {
        problemas.push({ x: x, tipo: "ch", msg: msgCh(x.ch) });
      } else if (emitida && +x.ch === x.c.ch) {
        problemas.push({ x: x, tipo: "igual", msg: "A nova carga horária é igual à atual (" + x.c.ch + " h). Para receber a declaração de novo, escolha \u201cReenviar\u201d." });
      }
    });
    if (problemas.length) {
      problemas.forEach(function (p) { estado.erros[p.x.c.id] = p.msg; pintar(p.x.item); });
      var erro = $("erro-lista");
      var soCh = problemas.every(function (p) { return p.tipo === "ch"; });
      erro.textContent = soCh
        ? (problemas.length === 1 ? "Falta informar a carga horária de 1 cursista." : "Faltam as cargas horárias de " + problemas.length + " cursistas.")
        : (problemas.length === 1 ? "Corrija o item destacado antes de continuar." : "Corrija os " + problemas.length + " itens destacados antes de continuar.");
      erro.hidden = false;
      var primeiro = problemas[0];
      primeiro.x.item.li.scrollIntoView({ block: "center" });
      var alvo = primeiro.tipo === "acao" ? primeiro.x.item.radios[0] : primeiro.x.item.campo;
      alvo.focus({ preventScroll: true });
      return;
    }
    $("erro-lista").hidden = true;
    var ul = $("rev-lista");
    limpar(ul);
    var contagem = { nova: 0, reenvio: 0, correcao: 0 };
    marcadas.sort(function (a, b) { return comparar(a.c.nome, b.c.nome); }).forEach(function (x) {
      var tipo = tipoDe(x);
      contagem[tipo]++;
      var nota = tipo === "reenvio" ? "Reenvio da declaração já emitida, com a mesma carga horária."
        : tipo === "correcao" ? "Correção: a declaração anterior (" + x.c.ch + " h) será anulada e uma nova será emitida com " + x.ch + " h."
        : null;
      ul.appendChild(h("li", {}, [
        h("span", { "class": "rev-nome", texto: x.c.nome }),
        h("span", { "class": "rev-ch", texto: x.ch + " h" }),
        nota ? h("span", { "class": "rev-nota", texto: nota }) : null
      ]));
    });
    var quando = "Você receberá os PDFs em até " + CFG.prazo + ", no e-mail " + estado.email + ".";
    var depois = " Depois, é só assinar cada declaração no espaço indicado, de preferência pelo Gov.br.";
    $("rev-texto").textContent = !contagem.reenvio && !contagem.correcao
      ? "Serão geradas " + plural(marcadas.length, "declaração", "declarações") + " " + daTurma(turma().turma) + ". " + quando + depois
      : "Este pedido " + daTurma(turma().turma) + " tem " + descreverTipos(contagem) + ". " + quando + depois;
    $("rev-correcao").hidden = !contagem.correcao;
    $("erro-revisao").hidden = true;
    mostrar("revisao");
  });

  $("btn-voltar").addEventListener("click", function () { mostrar("lista"); });

  $("btn-enviar").addEventListener("click", function () {
    var botao = $("btn-enviar");
    var pedido = selecionados().map(function (x) {
      return { id: x.c.id, ch: x.ch, acao: x.c.estado === "emitida" ? x.acao : "" };
    });
    $("erro-revisao").hidden = true;
    ocupado(botao, true, "Enviando...");
    chamar("enviar", { email: estado.email, cpf: estado.cpf, acesso: estado.acesso, turma: turma().turma, itens: pedido }, function (r) {
      ocupado(botao, false);
      if (r.ok) { concluir(r); return; }
      if (r.erros && r.erros.length) {
        r.erros.forEach(function (e) { estado.erros[e.id] = e.msg; });
        desenharTurma();
        mostrar("lista");
        var erro = $("erro-lista");
        erro.textContent = r.erro || "Corrija os itens destacados.";
        erro.hidden = false;
        var primeiro = itens.filter(function (it) { return estado.erros[it.c.id]; })[0];
        if (primeiro) primeiro.li.scrollIntoView({ block: "center" });
        return;
      }
      var e2 = $("erro-revisao");
      e2.textContent = r.erro || "Não foi possível enviar o pedido.";
      e2.hidden = false;
    }, function (msg) {
      ocupado(botao, false);
      var e3 = $("erro-revisao");
      e3.textContent = msg;
      e3.hidden = false;
    });
  });

  /* ---------- passo 4: conclusão ---------- */
  function concluir(r) {
    var ignoradas = r.ignorados || [];
    var resumo = r.resumo || { nova: r.gravados, reenvio: 0, correcao: 0 };
    estado.turmas = r.turmas;
    estado.sel[estado.atual] = {};
    var seloBox = $("selo-pronto");
    limpar(seloBox);
    var selo = criarSelo("ok", true);
    selo.setAttribute("class", selo.getAttribute("class") + " selo-grande");
    seloBox.appendChild(selo);
    var quando = "Você receberá os PDFs em até " + CFG.prazo + ", no e-mail " + estado.email + ".";
    if (r.gravados > 0) {
      $("t-pronto").textContent = "Pedido enviado";
      $("pronto-texto").textContent = (!resumo.reenvio && !resumo.correcao
        ? plural(r.gravados, "declaração entrou", "declarações entraram")
        : descreverTipos(resumo) + (r.gravados === 1 ? " entrou" : " entraram")) + " na fila. " + quando;
      $("pronto-extra").textContent = "Se o e-mail não chegar em " + CFG.prazo + ", olhe a caixa de spam e, se ele não estiver lá, procure " + apoio() +
        ". O remetente é " + CFG.remetente + ".";
      if (resumo.correcao) {
        $("pronto-extra").textContent += " Nas correções, a declaração anterior é anulada quando a nova for emitida: use só a nova.";
      }
    } else {
      $("t-pronto").textContent = "Nada novo para enviar";
      $("pronto-texto").textContent = "Todas as cursistas marcadas já estavam na fila.";
      $("pronto-extra").textContent = quando;
    }
    if (ignoradas.length && r.gravados > 0) {
      $("pronto-extra").textContent += " Já estavam na fila e não foram repetidas: " + ignoradas.map(function (x) { return x.nome; }).join(", ") + ".";
    }
    mostrar("pronto");
  }

  $("btn-outro").addEventListener("click", function () { iniciarLista(); });
  $("btn-sair").addEventListener("click", sair);
})();
