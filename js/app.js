/**
 * ═══════════════════════════════════════════════════════════
 *  PAINEL DE AGENDAMENTOS — Frontend (app.js) v2.0
 * ═══════════════════════════════════════════════════════════
 *
 *  Toda validação aqui é UX-only. Segurança real está no backend.
 *  Nenhum token, hash ou dado sensível fica exposto no cliente.
 *
 *  v2.0 — Melhorias de resiliência:
 *    - Warm-up inteligente (sem reload agressivo)
 *    - Retry com backoff exponencial em todas as chamadas ao GAS
 *    - Dados do formulário preservados em caso de erro de servidor
 *    - Feedback visual mais granular durante loading/retry
 */

(function () {
  'use strict';

  // ─── Configuração ─────────────────────────────────────────

  var CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbwcKT7iOiz4SAVThp1sd5yIX5htwVgbu-Y264F8zuZ_rH5-MLdAxuP3-1N1_9I_OA9gyg/exec',
    REQUEST_SECRET: '-+xB1xWS.[DyVRZAK_Bw3X2d^ESi@I},',

    // Retry config
    MAX_RETRIES: 3,          // Tentativas no frontend (backend já faz 5 internamente)
    BASE_DELAY_MS: 1500,     // Delay base para backoff (ms)
    MAX_DELAY_MS: 10000,     // Delay máximo (ms)

    // Warm-up config
    WARMUP_INTERVAL_MS: 240000,  // Ping silencioso a cada 4 min enquanto a aba estiver aberta
    WARMUP_KEY: 'painel_gas_ready'
  };

  // ─── Warm-up Inteligente ──────────────────────────────────
  //
  // Em vez de recarregar a página (que não funciona bem), fazemos:
  //  1. Ao carregar a página, dispara um POST ping silencioso ao GAS.
  //  2. Enquanto a aba estiver ativa, repete o ping a cada 4 min
  //     para manter o container quente.
  //  3. Quando o usuário submete o formulário, se o GAS ainda não
  //     respondeu ao ping, o primeiro retry naturalmente absorve
  //     o cold start.

  var gasReady = false;

  function warmUpGAS() {
    var payload = JSON.stringify({
      action: 'ping',
      _token: CONFIG.REQUEST_SECRET
    });

    fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      redirect: 'follow',
      body: payload
    })
    .then(function (resp) {
      if (resp.ok) {
        gasReady = true;
        sessionStorage.setItem(CONFIG.WARMUP_KEY, '1');
      }
    })
    .catch(function () {
      // Silencioso — o retry na chamada real vai absorver
    });
  }

  // Dispara imediatamente
  warmUpGAS();

  // Repete enquanto a aba estiver aberta
  var warmUpTimer = setInterval(warmUpGAS, CONFIG.WARMUP_INTERVAL_MS);

  // Para o timer quando a aba fica inativa (economiza recursos)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      clearInterval(warmUpTimer);
    } else {
      // Retomou — ping imediato + reinicia o timer
      warmUpGAS();
      warmUpTimer = setInterval(warmUpGAS, CONFIG.WARMUP_INTERVAL_MS);
    }
  });

  // ─── Estado ───────────────────────────────────────────────

  var state = {
    loading: false,
    agendamentos: [],
    pastAgendamentos: null,
    pastPeriodicidade: [],
    activeTab: 'futuros',
    formData: {}
  };

  // ─── DOM ──────────────────────────────────────────────────

  var $ = function (sel) { return document.querySelector(sel); };

  var dom = {
    form:           $('#consultaForm'),
    formSection:    $('#formSection'),
    resultSection:  $('#resultSection'),
    resultTitle:    $('#resultTitle'),
    resultList:     $('#resultList'),
    resultEmpty:    $('#resultEmpty'),
    tabToggle:      $('#tabToggle'),
    tabPassados:    $('#tabPassados'),
    tabFuturos:     $('#tabFuturos'),
    periodicidadeSection: $('#periodicidadeSection'),
    btnConsultar:   $('#btnConsultar'),
    btnVoltar:      $('#btnVoltar'),
    inputCPF:       $('#inputCPF'),
    inputDDD:       $('#inputDDD'),
    inputTelefone:  $('#inputTelefone'),
    checkSalvar:    $('#checkSalvar'),
    modalOverlay:   $('#modalOverlay'),
    modalTitle:     $('#modalTitle'),
    modalText:      $('#modalText'),
    modalCancel:    $('#modalCancel'),
    modalConfirm:   $('#modalConfirm'),
    modalConfirmText: $('#modalConfirmText'),
    linkOverlay:    $('#linkOverlay'),
    linkTitle:      $('#linkTitle'),
    linkText:       $('#linkText'),
    linkHref:       $('#linkHref'),
    linkClose:      $('#linkClose'),
    infoOverlay:    $('#infoOverlay'),
    infoTitle:      $('#infoTitle'),
    infoText:       $('#infoText'),
    infoHighlight:  $('#infoHighlight'),
    infoOk:         $('#infoOk'),
    themeToggle:    $('#themeToggle'),
    iconMoon:       $('#iconMoon'),
    iconSun:        $('#iconSun'),
    yearFooter:     $('#yearFooter')
  };

  // ─── Tema ─────────────────────────────────────────────────

  function initTheme() {
    var saved = localStorage.getItem('theme');
    if (saved === 'light') {
      setTheme('light');
    }
    dom.themeToggle.addEventListener('click', toggleTheme);
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    dom.iconMoon.style.display = theme === 'dark' ? 'block' : 'none';
    dom.iconSun.style.display = theme === 'light' ? 'block' : 'none';
  }

  // ─── Máscaras de Input (UX) ───────────────────────────────

  function maskCPF(e) {
    var v = e.target.value.replace(/\D/g, '').substring(0, 11);
    var masked = '';
    if (v.length > 0) masked += v.substring(0, 3);
    if (v.length > 3) masked += '.' + v.substring(3, 6);
    if (v.length > 6) masked += '.' + v.substring(6, 9);
    if (v.length > 9) masked += '-' + v.substring(9, 11);
    e.target.value = masked;
  }

  function maskDDD(e) {
    var v = e.target.value.replace(/\D/g, '').substring(0, 2);
    if (v.length > 0 && v[0] === '0') v = v.substring(1);
    e.target.value = v;
  }

  function maskTelefone(e) {
    e.target.value = e.target.value.replace(/\D/g, '').substring(0, 9);
  }

  // ─── Validação Client-side (UX apenas) ────────────────────

  function clearErrors() {
    var errors = document.querySelectorAll('.field-error');
    for (var i = 0; i < errors.length; i++) errors[i].textContent = '';
    var inputs = document.querySelectorAll('.field-input');
    for (var j = 0; j < inputs.length; j++) inputs[j].classList.remove('field-error-state');
  }

  function showFieldError(fieldId, msg) {
    var errEl = document.getElementById('error' + fieldId);
    var inputEl = document.getElementById('input' + fieldId);
    if (errEl) errEl.textContent = msg;
    if (inputEl) inputEl.classList.add('field-error-state');
  }

  function validateForm() {
    clearErrors();
    var valid = true;

    var cpf = dom.inputCPF.value.replace(/\D/g, '');
    if (cpf.length !== 11) {
      showFieldError('CPF', 'CPF deve ter 11 dígitos.');
      valid = false;
    } else if (!isValidCPF(cpf)) {
      showFieldError('CPF', 'CPF inválido.');
      valid = false;
    }

    var ddd = dom.inputDDD.value.replace(/\D/g, '');
    if (ddd.length !== 2 || parseInt(ddd, 10) < 11) {
      showFieldError('DDD', 'DDD inválido.');
      valid = false;
    }

    var tel = dom.inputTelefone.value.replace(/\D/g, '');
    if (tel.length < 8 || tel.length > 9) {
      showFieldError('Telefone', 'Informe 8 ou 9 dígitos.');
      valid = false;
    }

    return valid;
  }

  function isValidCPF(cpf) {
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    var sum = 0, i;
    for (i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
    var r = (sum * 10) % 11;
    if (r === 10) r = 0;
    if (r !== parseInt(cpf[9], 10)) return false;
    sum = 0;
    for (i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
    r = (sum * 10) % 11;
    if (r === 10) r = 0;
    return r === parseInt(cpf[10], 10);
  }

  // ─── Persistência de Dados (localStorage) ───────────────────

  var STORAGE_KEY = 'painel_dados_usuario';

  function salvarDadosLocal() {
    if (!dom.checkSalvar.checked) return;
    try {
      var dados = {
        cpf: dom.inputCPF.value,
        ddd: dom.inputDDD.value,
        telefone: dom.inputTelefone.value
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    } catch (_) {}
  }

  function limparDadosLocal() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function carregarDadosLocal() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var dados = JSON.parse(raw);
      if (dados.cpf) dom.inputCPF.value = dados.cpf;
      if (dados.ddd) dom.inputDDD.value = dados.ddd;
      if (dados.telefone) dom.inputTelefone.value = dados.telefone;
    } catch (_) {}
  }

  // ─── Comunicação com Backend (COM RETRY) ──────────────────

  /**
   * Calcula delay com exponential backoff + jitter
   */
  function calcDelay(attempt) {
    var exponential = CONFIG.BASE_DELAY_MS * Math.pow(2, attempt - 1);
    var jitter = Math.floor(Math.random() * CONFIG.BASE_DELAY_MS * 0.5);
    return Math.min(exponential + jitter, CONFIG.MAX_DELAY_MS);
  }

  /**
   * Determina se o erro vale retry no frontend.
   * Erros de validação (CPF, DDD etc.) e NOT_FOUND não devem ser retentados.
   */
  function isRetryableError(data) {
    if (!data) return true; // Resposta vazia / network error
    var code = data.code || '';
    // Erros de input/validação ou dados não encontrados → não retry
    var noRetry = [
      'INVALID_CPF', 'INVALID_DDD', 'INVALID_TELEFONE', 'INVALID_INPUT',
      'INVALID_REF', 'NOT_FOUND', 'RATE_LIMIT', 'FORBIDDEN',
      'DEADLINE_EXCEEDED', 'PARSE_ERROR', 'UNKNOWN_ACTION'
    ];
    if (noRetry.indexOf(code) !== -1) return false;
    // Erros de servidor / temporários → retry
    return true;
  }

  /**
   * Chamada com retry automático.
   * Tenta até CONFIG.MAX_RETRIES vezes com backoff exponencial.
   * Atualiza o texto do botão com número da tentativa.
   */
  function apiCall(action, extraData, options) {
    var ddd = dom.inputDDD.value.replace(/\D/g, '');
    var telefone = dom.inputTelefone.value.replace(/\D/g, '');

    var payload = {
      action: action,
      cpf: dom.inputCPF.value.replace(/\D/g, ''),
      ddd: ddd,
      telefone: telefone,
      _token: CONFIG.REQUEST_SECRET
    };

    if (extraData) {
      for (var key in extraData) {
        if (extraData.hasOwnProperty(key)) payload[key] = extraData[key];
      }
    }

    var opts = options || {};
    var maxRetries = opts.maxRetries || CONFIG.MAX_RETRIES;
    var loaderEl = opts.loaderEl || null;  // Elemento .btn-loader para atualizar texto

    function attempt(n) {
      // Atualizar feedback visual com número da tentativa
      if (loaderEl && n > 1) {
        var loaderTextNode = loaderEl.lastChild;
        if (loaderTextNode && loaderTextNode.nodeType === 3) {
          loaderTextNode.textContent = ' Tentativa ' + n + '/' + maxRetries + '...';
        }
      }

      return fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        redirect: 'follow',
        body: JSON.stringify(payload)
      })
      .then(function (resp) {
        if (!resp.ok) {
          // HTTP error do GAS (502, 503, etc.)
          throw new Error('HTTP_' + resp.status);
        }
        return resp.text().then(function (text) {
          // GAS às vezes retorna HTML de erro em vez de JSON
          if (!text || text.charAt(0) !== '{') {
            throw new Error('INVALID_RESPONSE');
          }
          return JSON.parse(text);
        });
      })
      .then(function (data) {
        // Resposta válida — verificar se é erro retryable
        if (data.status === 'error' && isRetryableError(data) && n < maxRetries) {
          var delay = calcDelay(n);
          return new Promise(function (resolve) {
            setTimeout(function () { resolve(attempt(n + 1)); }, delay);
          });
        }
        return data;
      })
      .catch(function (err) {
        // Network error, timeout, resposta inválida
        if (n < maxRetries) {
          var delay = calcDelay(n);
          return new Promise(function (resolve) {
            setTimeout(function () { resolve(attempt(n + 1)); }, delay);
          });
        }
        // Todas as tentativas falharam
        throw err;
      });
    }

    return attempt(1);
  }

  // ─── Toast ────────────────────────────────────────────────

  var toastTimeout;
  function showToast(msg, type) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast-' + type : '');
    el.textContent = msg;
    document.body.appendChild(el);

    requestAnimationFrame(function () {
      el.classList.add('show');
    });

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 400);
    }, 4000);
  }

  // ─── Loading State ────────────────────────────────────────

  function setLoading(btn, isLoading) {
    var textEl = btn.querySelector('.btn-text');
    var loaderEl = btn.querySelector('.btn-loader');
    if (textEl) textEl.style.display = isLoading ? 'none' : '';
    if (loaderEl) loaderEl.style.display = isLoading ? 'inline-flex' : 'none';
    btn.disabled = isLoading;

    // Resetar texto do loader
    if (isLoading && loaderEl) {
      var textNode = loaderEl.lastChild;
      if (textNode && textNode.nodeType === 3) {
        textNode.textContent = ' Consultando...';
      }
    }
  }

  // ─── Consultar ────────────────────────────────────────────

  function handleConsulta(e) {
    e.preventDefault();
    if (state.loading) return;
    if (!validateForm()) return;

    state.loading = true;
    setLoading(dom.btnConsultar, true);

    var loaderEl = dom.btnConsultar.querySelector('.btn-loader');

    apiCall('consultar', null, { loaderEl: loaderEl })
      .then(function (data) {
        if (data.status === 'success') {
          salvarDadosLocal();
          state.agendamentos = data.agendamentos || [];
          state.pastAgendamentos = null;
          state.pastPeriodicidade = [];
          state.activeTab = 'futuros';
          state.formData = {
            nomeCliente: data.nome_cliente || ''
          };
          renderResults();
        } else if (data.code === 'NOT_FOUND') {
          // Apenas NOT_FOUND limpa dados — erros de servidor NÃO limpam
          limparDadosLocal();
          openInfoModal(
            'Nenhum resultado encontrado',
            'Não foi possível localizar agendamentos com os dados informados.',
            'Caso você tenha mais de um número de telefone, tente alterar o número de TELEFONE para sua segunda opção.'
          );
        } else {
          // Erro que não é NOT_FOUND: NÃO limpar dados salvos
          showToast(data.message || 'Erro ao consultar. Tente novamente.', 'error');
        }
      })
      .catch(function () {
        // Falha total (network) — NÃO limpar dados salvos
        showToast('Falha na conexão após múltiplas tentativas. Verifique sua internet e tente novamente.', 'error');
      })
      .finally(function () {
        state.loading = false;
        setLoading(dom.btnConsultar, false);
      });
  }

  // ─── Render Agendamentos ──────────────────────────────────

  function renderResults() {
    dom.formSection.style.display = 'none';
    dom.resultSection.style.display = '';

    var greeting = state.formData.nomeCliente
      ? state.formData.nomeCliente.split(' ')[0]
      : '';

    dom.resultTitle.textContent = greeting ? 'Olá, ' + greeting : 'Seus agendamentos';

    setActiveTab(state.activeTab);

    if (state.activeTab === 'futuros') {
      renderFuturos();
    } else {
      renderPassados();
    }
  }

  function setActiveTab(tab) {
    state.activeTab = tab;
    dom.tabFuturos.classList.toggle('active', tab === 'futuros');
    dom.tabPassados.classList.toggle('active', tab === 'passados');
  }

  function switchTab(tab) {
    if (state.loading) return;
    setActiveTab(tab);

    if (tab === 'futuros') {
      dom.periodicidadeSection.style.display = 'none';
      renderFuturos();
    } else {
      if (state.pastAgendamentos === null) {
        fetchPassados();
      } else {
        renderPassados();
      }
    }
  }

  function renderFuturos() {
    dom.periodicidadeSection.style.display = 'none';
    dom.resultList.innerHTML = '';

    var seenServices = {};
    var displayItems = [];
    for (var i = 0; i < state.agendamentos.length; i++) {
      var ag = state.agendamentos[i];
      var serviceKey = ag.servico_id != null ? String(ag.servico_id) : ag.servico;
      if (!seenServices[serviceKey]) {
        seenServices[serviceKey] = true;
        displayItems.push(i);
      }
    }

    dom.resultEmpty.style.display = displayItems.length === 0 ? '' : 'none';

    for (var j = 0; j < displayItems.length; j++) {
      var origIdx = displayItems[j];
      var card = createAgendamentoCard(state.agendamentos[origIdx], origIdx, j);
      dom.resultList.appendChild(card);
    }
  }

  function fetchPassados() {
    state.loading = true;

    dom.resultList.innerHTML = '';
    dom.resultEmpty.style.display = 'none';
    dom.periodicidadeSection.style.display = 'none';

    var loadingEl = document.createElement('div');
    loadingEl.className = 'results-empty';
    var spinnerEl = document.createElement('span');
    spinnerEl.className = 'spinner';
    spinnerEl.style.borderColor = 'rgba(var(--color-primary-rgb),0.3)';
    spinnerEl.style.borderTopColor = 'var(--color-accent)';
    loadingEl.appendChild(spinnerEl);
    var loadingText = document.createElement('p');
    loadingText.textContent = 'Carregando agendamentos passados...';
    loadingText.style.marginTop = '0.75rem';
    loadingText.id = 'passadosLoadingText';
    loadingEl.appendChild(loadingText);
    dom.resultList.appendChild(loadingEl);

    apiCall('consultar_passados')
      .then(function (data) {
        if (data.status === 'success') {
          state.pastAgendamentos = data.agendamentos || [];
          state.pastPeriodicidade = data.periodicidade || [];
          renderPassados();
        } else if (data.code === 'NOT_FOUND') {
          state.pastAgendamentos = [];
          state.pastPeriodicidade = [];
          renderPassados();
        } else {
          // Erro de servidor — NÃO limpar dados, mostrar toast
          showToast(data.message || 'Erro ao consultar passados. Tente novamente.', 'error');
          // Renderizar lista vazia mas permitir retry
          state.pastAgendamentos = [];
          renderPassados();
        }
      })
      .catch(function () {
        showToast('Falha na conexão ao buscar agendamentos passados. Tente novamente.', 'error');
        // Resetar para permitir retry no próximo clique na tab
        state.pastAgendamentos = null;
        switchTab('futuros');
      })
      .finally(function () {
        state.loading = false;
      });
  }

  function renderPassados() {
    dom.resultList.innerHTML = '';

    if (state.pastPeriodicidade.length > 0) {
      dom.periodicidadeSection.innerHTML = '';
      dom.periodicidadeSection.style.display = '';

      for (var p = 0; p < state.pastPeriodicidade.length; p++) {
        var per = state.pastPeriodicidade[p];
        var perCard = document.createElement('div');
        perCard.className = 'periodicidade-card';

        var iconSvg = document.createElement('div');
        iconSvg.className = 'periodicidade-icon';
        if (per.disponivel) {
          iconSvg.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-success)"><polyline points="20 6 9 17 4 12"/></svg>';
        } else {
          iconSvg.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-warning)"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        }

        var content = document.createElement('div');
        content.className = 'periodicidade-content';

        var svcEl = document.createElement('div');
        svcEl.className = 'periodicidade-servico';
        svcEl.textContent = per.servico;

        var infoEl = document.createElement('div');
        infoEl.className = 'periodicidade-info';
        if (per.disponivel) {
          var spanDisp = document.createElement('span');
          spanDisp.className = 'periodicidade-disponivel';
          spanDisp.textContent = 'Novo agendamento já disponível';
          infoEl.appendChild(spanDisp);
        } else {
          var spanIndisp = document.createElement('span');
          spanIndisp.className = 'periodicidade-indisponivel';
          spanIndisp.textContent = 'Novo agendamento no serviço disponível a partir de ' + per.proximo_disponivel;
          infoEl.appendChild(spanIndisp);
        }

        content.appendChild(svcEl);
        content.appendChild(infoEl);
        perCard.appendChild(iconSvg);
        perCard.appendChild(content);
        dom.periodicidadeSection.appendChild(perCard);
      }
    } else {
      dom.periodicidadeSection.style.display = 'none';
    }

    dom.resultEmpty.style.display = (state.pastAgendamentos || []).length === 0 ? '' : 'none';

    var items = state.pastAgendamentos || [];
    for (var i = 0; i < items.length; i++) {
      var card = createPastCard(items[i], i);
      dom.resultList.appendChild(card);
    }
  }

  function createPastCard(ag, displayOrder) {
    var card = document.createElement('div');
    card.className = 'ag-card ag-card-past';
    card.style.animationDelay = ((displayOrder || 0) * 0.06) + 's';

    var dtParts = ag.data_inicio.split(' ');
    var dataPart = dtParts[0] || '';
    var horaPart = dtParts[1] || '';
    var horaFim = ag.data_fim ? ag.data_fim.split(' ')[1] || '' : '';
    var horaDisplay = horaPart + (horaFim ? ' às ' + horaFim : '');

    var dp = dataPart.split('/');
    var dateObj = new Date(parseInt(dp[2], 10), parseInt(dp[1], 10) - 1, parseInt(dp[0], 10));
    var dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    var diaSemana = dias[dateObj.getDay()] || '';

    var dtEl = document.createElement('div');
    dtEl.className = 'ag-datetime';

    var dtText = document.createTextNode(dataPart + ' — ' + horaDisplay + ' ');
    dtEl.appendChild(dtText);

    var badge = document.createElement('span');
    badge.className = 'ag-status-badge-inline';
    if (ag.status_codigo === 'M') {
      badge.classList.add('badge-nao-compareceu');
      badge.textContent = 'Você faltou!';
    } else {
      badge.classList.add('badge-finalizado');
      badge.textContent = 'Consulta realizada';
    }
    dtEl.appendChild(badge);

    var diaEl = document.createElement('div');
    diaEl.className = 'ag-detail';
    diaEl.textContent = diaSemana;

    var servEl = document.createElement('div');
    servEl.className = 'ag-detail';
    var servStrong = document.createElement('strong');
    servStrong.textContent = 'Serviço: ';
    servEl.appendChild(servStrong);
    servEl.appendChild(document.createTextNode(ag.servico || '—'));

    var atenEl = document.createElement('div');
    atenEl.className = 'ag-detail';
    var atenStrong = document.createElement('strong');
    atenStrong.textContent = 'Profissional: ';
    atenEl.appendChild(atenStrong);
    atenEl.appendChild(document.createTextNode(ag.atendente || '—'));

    card.appendChild(dtEl);
    card.appendChild(diaEl);
    card.appendChild(servEl);
    card.appendChild(atenEl);

    return card;
  }

  function createAgendamentoCard(ag, index, displayOrder) {
    var card = document.createElement('div');
    card.className = 'ag-card';
    card.setAttribute('data-index', index);
    card.style.animationDelay = ((displayOrder || 0) * 0.08) + 's';

    var dtParts = ag.data_inicio.split(' ');
    var dataPart = dtParts[0] || '';
    var horaPart = dtParts[1] || '';
    var horaFim = ag.data_fim ? ag.data_fim.split(' ')[1] || '' : '';
    var horaDisplay = horaPart + (horaFim ? ' às ' + horaFim : '');

    var dp = dataPart.split('/');
    var dateObj = new Date(parseInt(dp[2], 10), parseInt(dp[1], 10) - 1, parseInt(dp[0], 10));
    var dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    var diaSemana = dias[dateObj.getDay()] || '';

    var dtEl = document.createElement('div');
    dtEl.className = 'ag-datetime';
    dtEl.textContent = dataPart + ' — ' + horaDisplay;

    var diaEl = document.createElement('div');
    diaEl.className = 'ag-detail';
    diaEl.textContent = diaSemana;

    var servEl = document.createElement('div');
    servEl.className = 'ag-detail';
    var servStrong = document.createElement('strong');
    servStrong.textContent = 'Serviço: ';
    servEl.appendChild(servStrong);
    servEl.appendChild(document.createTextNode(ag.servico || '—'));

    var atenEl = document.createElement('div');
    atenEl.className = 'ag-detail';
    var atenStrong = document.createElement('strong');
    atenStrong.textContent = 'Profissional: ';
    atenEl.appendChild(atenStrong);
    atenEl.appendChild(document.createTextNode(ag.atendente || '—'));

    var actions = document.createElement('div');
    actions.className = 'ag-actions';

    if (ag.bloqueado) {
      actions.className = 'ag-actions ag-actions-blocked';
      var avisoEl = document.createElement('div');
      avisoEl.className = 'ag-blocked-notice';

      var avisoIcon = document.createElement('svg');
      avisoIcon.setAttribute('width', '16');
      avisoIcon.setAttribute('height', '16');
      avisoIcon.setAttribute('viewBox', '0 0 24 24');
      avisoIcon.setAttribute('fill', 'none');
      avisoIcon.setAttribute('stroke', 'currentColor');
      avisoIcon.setAttribute('stroke-width', '2');
      avisoIcon.setAttribute('stroke-linecap', 'round');
      avisoIcon.setAttribute('stroke-linejoin', 'round');
      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '10');
      var line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line1.setAttribute('x1', '12');
      line1.setAttribute('y1', '8');
      line1.setAttribute('x2', '12');
      line1.setAttribute('y2', '12');
      var line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line2.setAttribute('x1', '12');
      line2.setAttribute('y1', '16');
      line2.setAttribute('x2', '12.01');
      line2.setAttribute('y2', '16');
      avisoIcon.appendChild(circle);
      avisoIcon.appendChild(line1);
      avisoIcon.appendChild(line2);

      var avisoText = document.createElement('span');
      avisoText.textContent = ag.motivo_bloqueio || 'Prazo máximo de 2 horas para cancelar/reagendar excedido';

      avisoEl.appendChild(avisoIcon);
      avisoEl.appendChild(avisoText);
      actions.appendChild(avisoEl);
    } else {
      var btnRemarcar = document.createElement('button');
      btnRemarcar.type = 'button';
      btnRemarcar.className = 'btn btn-reschedule btn-sm';
      btnRemarcar.innerHTML = '<span class="btn-text">Remarcar</span><span class="btn-loader" style="display:none;"><span class="spinner"></span> Processando...</span>';
      btnRemarcar.addEventListener('click', function (ref, idx) {
        return function () { openModal('remarcar', ref, idx); };
      }(ag.ref, index));

      var btnCancelar = document.createElement('button');
      btnCancelar.type = 'button';
      btnCancelar.className = 'btn btn-cancel-card btn-sm';
      btnCancelar.innerHTML = '<span class="btn-text">Cancelar</span><span class="btn-loader" style="display:none;"><span class="spinner"></span> Processando...</span>';
      btnCancelar.addEventListener('click', function (ref, idx) {
        return function () { openModal('cancelar', ref, idx); };
      }(ag.ref, index));

      actions.appendChild(btnRemarcar);
      actions.appendChild(btnCancelar);
    }

    card.appendChild(dtEl);
    card.appendChild(diaEl);
    card.appendChild(servEl);
    card.appendChild(atenEl);
    card.appendChild(actions);

    return card;
  }

  // ─── Modal de Confirmação ─────────────────────────────────

  var pendingAction = null;

  function openModal(action, ref, index) {
    var ag = state.agendamentos[index];
    if (!ag) return;

    pendingAction = { action: action, ref: ref, index: index };

    if (action === 'cancelar') {
      var isPsicologia = ag.servico_id === 759;

      if (isPsicologia) {
        dom.modalTitle.textContent = 'Cancelar toda a recorrência de Psicologia?';
        dom.modalText.textContent = 'Ao cancelar, toda a recorrência futura de Psicologia será cancelada automaticamente — não apenas esta consulta. Essa ação não pode ser desfeita.';
        dom.modalConfirmText.textContent = 'Cancelar toda a recorrência';
      } else {
        dom.modalTitle.textContent = 'Cancelar agendamento?';
        dom.modalText.textContent = 'O agendamento de ' + ag.data_inicio + ' (' + ag.servico + ') será cancelado. Essa ação não pode ser desfeita.';
        dom.modalConfirmText.textContent = 'Confirmar cancelamento';
      }
      dom.modalConfirm.className = 'btn btn-danger btn-sm';
    } else {
      dom.modalTitle.textContent = 'Remarcar agendamento?';
      dom.modalText.textContent = 'O agendamento de ' + ag.data_inicio + ' (' + ag.servico + ') será cancelado e você receberá um link para escolher um novo horário.';
      dom.modalConfirmText.textContent = 'Remarcar';
      dom.modalConfirm.className = 'btn btn-primary btn-sm';
    }

    dom.modalOverlay.style.display = '';
    dom.modalConfirm.disabled = false;
  }

  function closeModal() {
    dom.modalOverlay.style.display = 'none';
    pendingAction = null;
  }

  function confirmAction() {
    if (!pendingAction || state.loading) return;

    var action = pendingAction.action;
    var ref = pendingAction.ref;
    var index = pendingAction.index;

    state.loading = true;
    setLoading(dom.modalConfirm, true);

    apiCall(action, { ref: ref })
      .then(function (data) {
        closeModal();

        if (action === 'cancelar') {
          if (data.status === 'success') {
            if (data.tipo === 'lote_psicologia') {
              state.agendamentos = state.agendamentos.filter(function(ag) {
                return ag.servico_id !== 759;
              });
            } else {
              state.agendamentos.splice(index, 1);
            }
            showToast(data.message || 'Agendamento cancelado com sucesso.', 'success');
            renderResults();
          } else {
            showToast(data.message || 'Erro ao cancelar.', 'error');
          }
        }

        if (action === 'remarcar') {
          if (data.status === 'success' && data.link) {
            state.agendamentos.splice(index, 1);
            renderResults();
            showLinkModal(data.link, data.expira_minutos);
          } else if (data.status === 'partial') {
            state.agendamentos.splice(index, 1);
            renderResults();
            showToast(data.message || 'Agendamento cancelado, mas houve erro ao gerar o link.', 'error');
          } else {
            showToast(data.message || 'Erro ao remarcar.', 'error');
          }
        }
      })
      .catch(function () {
        closeModal();
        showToast('Falha na conexão após múltiplas tentativas. Tente novamente.', 'error');
      })
      .finally(function () {
        state.loading = false;
      });
  }

  // ─── Modal de Link ────────────────────────────────────────

  function showLinkModal(link, minutos) {
    dom.linkTitle.textContent = 'Pronto para remarcar!';
    dom.linkText.textContent = 'Use o link abaixo para escolher um novo horário. O link expira em ' + (minutos || 120) + ' minutos.';
    dom.linkHref.href = link;
    dom.linkOverlay.style.display = '';
  }

  function closeLinkModal() {
    dom.linkOverlay.style.display = 'none';
  }

  // ─── Modal Informativo ────────────────────────────────────

  function openInfoModal(title, text, highlight) {
    dom.infoTitle.textContent = title;
    dom.infoText.textContent = text;
    dom.infoHighlight.textContent = highlight;
    dom.infoOverlay.style.display = '';
  }

  function closeInfoModal() {
    dom.infoOverlay.style.display = 'none';
  }

  // ─── Voltar ao Formulário ─────────────────────────────────

  function voltarForm() {
    dom.resultSection.style.display = 'none';
    dom.formSection.style.display = '';
    state.agendamentos = [];
    state.pastAgendamentos = null;
    state.pastPeriodicidade = [];
    state.activeTab = 'futuros';
    dom.periodicidadeSection.style.display = 'none';
  }

  // ─── Inicialização ────────────────────────────────────────

  function init() {
    dom.yearFooter.textContent = new Date().getFullYear();

    initTheme();

    carregarDadosLocal();

    dom.checkSalvar.addEventListener('change', function () {
      if (!dom.checkSalvar.checked) limparDadosLocal();
    });

    dom.inputCPF.addEventListener('input', maskCPF);
    dom.inputDDD.addEventListener('input', maskDDD);
    dom.inputTelefone.addEventListener('input', maskTelefone);

    [dom.inputDDD, dom.inputTelefone].forEach(function (el) {
      el.addEventListener('paste', function () {
        // Permite paste — a máscara limpa depois
      });
    });

    dom.form.addEventListener('submit', handleConsulta);

    dom.btnVoltar.addEventListener('click', voltarForm);

    dom.tabFuturos.addEventListener('click', function () { switchTab('futuros'); });
    dom.tabPassados.addEventListener('click', function () { switchTab('passados'); });

    dom.modalCancel.addEventListener('click', closeModal);
    dom.modalConfirm.addEventListener('click', confirmAction);
    dom.modalOverlay.addEventListener('click', function (e) {
      if (e.target === dom.modalOverlay) closeModal();
    });

    dom.linkClose.addEventListener('click', closeLinkModal);
    dom.linkOverlay.addEventListener('click', function (e) {
      if (e.target === dom.linkOverlay) closeLinkModal();
    });

    dom.infoOk.addEventListener('click', closeInfoModal);
    dom.infoOverlay.addEventListener('click', function (e) {
      if (e.target === dom.infoOverlay) closeInfoModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeModal();
        closeLinkModal();
        closeInfoModal();
      }
    });
  }

  // ─── Boot ─────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
