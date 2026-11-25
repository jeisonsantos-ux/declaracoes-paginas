(function () {
  "use strict";
  var lista = $("testes"), resumo = $("resumo"), botao = $("btn-refazer");

  /* o que fazer quando o sistema responde algo estranho: quase sempre é a "Nova versão" que faltou */
  var DICA_VERSAO = "Se você acabou de colar o Codigo.gs novo no Apps Script, falta publicá-lo: Implantar > Gerenciar implantações > lápis (Editar) > Versão: Nova versão > Implantar.";
  var DICA_ACESSO = "Confira, em Implantar > Gerenciar implantações, se “Quem pode acessar” está como “Qualquer pessoa” e se o endereço termina em /exec.";

  function item(nome) {
    var li = h("li", { "class": "teste teste-espera" });
    li.appendChild(icone("fila"));
    var corpo = h("div", {}, [h("strong", { texto: nome }), h("p", { "class": "situacao", texto: "Conferindo..." })]);
    li.appendChild(corpo);
    lista.appendChild(li);
    return li;
  }

  /* resultado: true = passou, false = falhou, null = não foi testado (porque um teste anterior falhou) */
  function marcar(li, resultado, aviso, dica) {
    li.setAttribute("class", "teste " + (resultado === true ? "teste-ok" : resultado === false ? "teste-falha" : "teste-pulado"));
    li.replaceChild(icone(resultado === true ? "emitida" : resultado === false ? "pendencia" : "fila"), li.firstChild);
    var d = li.querySelector(".situacao");
    d.textContent = aviso;
    if (dica) { d.parentNode.appendChild(h("p", { "class": "como", texto: dica })); }
  }

  function terminar(tudoCerto) {
    botao.disabled = false;
    resumo.hidden = false;
    resumo.setAttribute("class", tudoCerto ? "nota-info" : "aviso");
    limpar(resumo);
    if (tudoCerto) {
      resumo.appendChild(document.createTextNode("Tudo certo: a página de pedido e a de verificação já podem ser usadas. "));
      resumo.appendChild(h("a", { href: "index.html", texto: "Abrir a página de pedido" }));
      resumo.appendChild(document.createTextNode(" · "));
      resumo.appendChild(h("a", { href: "verificar.html", texto: "Abrir a verificação" }));
    } else {
      resumo.textContent = "Há um problema. Resolva o item marcado em vermelho e toque em “Testar de novo”.";
    }
    $("t-teste").focus({ preventScroll: true });
  }

  function testar() {
    botao.disabled = true;
    resumo.hidden = true;
    limpar(lista);
    var p1 = item("O endereço do sistema está preenchido (config.js)");
    var p2 = item("O sistema responde");
    var p3 = item("O sistema consegue ler a planilha");

    if (!enderecoServidor()) {
      var vazio = !SITE.servidor || String(SITE.servidor).indexOf("COLE_AQUI") === 0;
      marcar(p1, false, vazio ? "O arquivo config.js ainda não foi preenchido." : "O endereço escrito em config.js não parece certo.",
        vazio ? "Abra o arquivo config.js, cole o endereço do sistema entre as aspas, no lugar do texto COLE_AQUI..., e salve (LEIA-ME, Passo 7)."
              : "Ele deve começar com https://script.google.com e terminar em /exec (e não em /dev). Copie de novo, pela função verificarConfiguracao do Apps Script.");
      marcar(p2, null, "Não testado: falta o endereço.", "");
      marcar(p3, null, "Não testado: falta o endereço.", "");
      terminar(false);
      return;
    }
    marcar(p1, true, "O endereço começa com https://script.google.com e termina em /exec.", "");

    chamar("config", {}, function (r) {
      if (!r || !r.ok) {
        marcar(p2, false, (r && r.erro) || "O sistema respondeu com um erro.", DICA_VERSAO);
        marcar(p3, null, "Não testado.", "");
        terminar(false);
        return;
      }
      marcar(p2, true, "Carga horária máxima: " + r.chMax + " h. CPF exigido na entrada: " + (r.exigeCpf ? "sim" : "não") + ". Prazo informado às formadoras: em até " + r.prazo + ".", "");
      /* um código que não existe: o sistema só precisa ler a aba Registro e dizer "não encontrada" */
      chamar("verificar", { codigo: "ZZZZ-9999" }, function (v) {
        if (v && v.ok) {
          marcar(p3, true, "Leu a aba Registro da planilha.", "Para conferir também as abas Cursistas, Formadoras e Pedidos, rode a função verificarConfiguracao no Apps Script (LEIA-ME, Passo 7).");
          terminar(true);
        } else {
          marcar(p3, false, (v && v.erro) || "O sistema não conseguiu ler a planilha.", "Confira se a planilha tem as abas Cursistas, Formadoras, Pedidos e Registro, com os títulos das colunas (LEIA-ME, Passo 1), e se você autorizou o acesso do Apps Script à planilha.");
          terminar(false);
        }
      }, function (msg) { marcar(p3, false, msg, DICA_ACESSO); terminar(false); });
    }, function (msg) {
      marcar(p2, false, msg, DICA_ACESSO + " " + DICA_VERSAO);
      marcar(p3, null, "Não testado.", "");
      terminar(false);
    });
  }

  botao.addEventListener("click", testar);
  testar();
})();
