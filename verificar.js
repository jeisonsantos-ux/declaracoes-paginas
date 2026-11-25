(function () {
  "use strict";
  var campo = $("codigo"), saida = $("resultado"), botao = $("btn-verificar");

  function formatar(v) {
    var s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    return s.length > 4 ? s.slice(0, 4) + "-" + s.slice(4) : s;
  }

  campo.addEventListener("input", function () {
    campo.value = formatar(campo.value);
    limpar(saida);   /* o resultado na tela sempre pertence ao código que está no campo */
  });

  $("form-codigo").addEventListener("submit", function (ev) {
    ev.preventDefault();
    consultar(campo.value);
  });

  function mensagem(tipo, titulo, texto, extra) {
    limpar(saida);
    var corpo = h("div", { "class": "resultado-corpo resultado-" + tipo }, [
      criarSelo(tipo === "ok" ? "ok" : tipo === "cancelada" ? "cancelada" : "alerta", true),
      h("h2", { tabindex: "-1", texto: titulo }),
      texto ? h("p", { "class": "nota", texto: texto }) : null,
      extra
    ]);
    corpo.firstChild.setAttribute("class", corpo.firstChild.getAttribute("class") + " selo-grande");
    saida.appendChild(corpo);
  }

  /* leva o resultado (já completo) para o topo da tela: no celular o formulário ocupa o primeiro "pedaço" da página */
  function revelar() {
    var titulo = saida.querySelector("h2");
    if (titulo) titulo.focus({ preventScroll: true });
    var calmo = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    saida.scrollIntoView({ block: "start", behavior: calmo ? "auto" : "smooth" });
  }

  function linha(rotulo, valores) {
    return h("div", {}, [h("dt", { texto: rotulo }), h("dd", {}, valores.map(function (v) { return h("span", { texto: v }); }))]);
  }

  function mostrarResultado(r) {
    if (!r.ok) {
      limpar(saida);
      saida.appendChild(h("p", { "class": "erro", role: "alert", texto: r.erro }));
      revelar();
      return;
    }
    if (r.resultado === "valida") {
      var dados = h("dl", { "class": "dados" }, [
        linha("Cursista", [r.nome]),
        linha("Carga horária", [r.ch + (typeof r.ch === "number" ? (r.ch === 1 ? " hora" : " horas") : "")]),
        linha("Município", [r.municipio]),
        linha(r.formadoras.length > 1 ? "Formadoras municipais" : "Formadora municipal", r.formadoras.length ? r.formadoras : ["Não informada"]),
        linha("Emitida em", [r.emissao]),
        linha("Código", [r.codigo])
      ]);
      var nota = h("p", { "class": "nota", texto: "Compare estes dados com os do documento que você recebeu. Se algum for diferente, o documento não é confiável." });
      var corpo = mensagem("ok", "Declaração válida", "Registrada oficialmente pelo ProLEEI-MT.", null);
      var caixa = saida.firstChild;
      caixa.appendChild(dados);
      caixa.appendChild(nota);
    } else if (r.resultado === "cancelada") {
      mensagem("cancelada", "Declaração sem validade",
        "Este código existe, mas a declaração foi cancelada ou substituída e não vale como comprovante. Em caso de dúvida, procure a coordenação do ProLEEI-MT." +
        (r.situacao ? " Situação no registro: " + r.situacao + "." : ""), null);
    } else if (r.resultado === "naoencontrada") {
      mensagem("alerta", "Código não encontrado",
        "Não há declaração com o código " + r.codigo + ". Confira se digitou todos os caracteres. Os códigos não usam as letras I, L e O nem os números 0 e 1. Se o documento tem outro código, ele não foi emitido por este sistema.", null);
    } else {
      mensagem("alerta", "Código incompleto", "O código tem 8 letras e números, no formato XXXX-XXXX. Confira o que está impresso no documento.", null);
    }
    revelar();
  }

  function consultar(valor) {
    limpar(saida);
    saida.appendChild(h("p", { "class": "nota", texto: "Conferindo o código..." }));
    botao.disabled = true;
    chamar("verificar", { codigo: valor }, function (r) { botao.disabled = false; mostrarResultado(r); },
      function (msg) { botao.disabled = false; mostrarResultado({ ok: false, erro: msg }); });
  }

  var inicial = codigoDaUrl();
  if (inicial) {
    campo.value = formatar(inicial);
    consultar(campo.value);
  } else {
    campo.focus();
  }
})();
