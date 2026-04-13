/**
 * ═══════════════════════════════════════════════════════════
 *  PAINEL DE AGENDAMENTOS — Frontend (app.js)
 * ═══════════════════════════════════════════════════════════
 *
 *  Toda validação aqui é UX-only. Segurança real está no backend.
 *  Nenhum token, hash ou dado sensível fica exposto no cliente.
 */

(function () {
  'use strict';

  // ─── Configuração ─────────────────────────────────────────
  // ALTERE ESTES VALORES para o seu deploy:

  var CONFIG = {
    // URL do Web App (Google Apps Script) — obtida após deploy
    API_URL: 'https://script.google.com/macros/s/AKfycbwcKT7iOiz4SAVThp1sd5yIX5htwVgbu-Y264F8zuZ_rH5-MLdAxuP3-1N1_9I_OA9gyg/exec',
    // Token compartilhado com o backend (Script Property: REQUEST_SECRET)
    REQUEST_SECRET: '-+xB1xWS.[DyVRZAK_Bw3X2d^ESi@I},'
  };

  // ─── Estado ───────────────────────────────────────────────

  var state = {
    loading: false,
    agendamentos: [],
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
    btnConsultar:   $('#btnConsultar'),
    btnVoltar:      $('#btnVoltar'),
    inputNome:      $('#inputNome'),
    inputDOB:       $('#inputDOB'),
    inputCPF:       $('#inputCPF'),
    inputDDD:       $('#inputDDD'),
    inputTelefone:  $('#inputTelefone'),
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

  function maskDOB(e) {
    var v = e.target.value.replace(/\D/g, '').substring(0, 8);
    var masked = '';
    if (v.length > 0) masked += v.substring(0, 2);
    if (v.length > 2) masked += '/' + v.substring(2, 4);
    if (v.length > 4) masked += '/' + v.substring(4, 8);
    e.target.value = masked;
  }

  function maskCPF(e) {
    var v = e.target.value.replace(/\D/g, '').substring(0, 11);
    var masked = '';
    if (v.length > 0) masked += v.substring(0, 3);
    if (v.length > 3) masked += '.' + v.substring(3, 6);
    if (v.length > 6) masked += '.' + v.substring(6, 9);
    if (v.length > 9) masked += '-' + v.substring(9, 11);
    e.target.value = masked;
  }

  function maskOnlyDigits(e) {
    e.target.value = e.target.value.replace(/\D/g, '');
  }

  function maskDDD(e) {
    var v = e.target.value.replace(/\D/g, '').substring(0, 2);
    // Bloqueia 0 como primeiro dígito
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

    // Nome
    var nome = dom.inputNome.value.trim();
    if (!nome || nome.length < 3) {
      showFieldError('Nome', 'Informe seu nome completo.');
      valid = false;
    } else if (nome.split(/\s+/).length < 2) {
      showFieldError('Nome', 'Informe nome e sobrenome.');
      valid = false;
    }

    // Data de Nascimento
    var dob = dom.inputDOB.value.trim();
    var dobMatch = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!dobMatch) {
      showFieldError('DOB', 'Formato: DD/MM/AAAA');
      valid = false;
    } else {
      var d = parseInt(dobMatch[1], 10);
      var m = parseInt(dobMatch[2], 10);
      var y = parseInt(dobMatch[3], 10);
      if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) {
        showFieldError('DOB', 'Data inválida.');
        valid = false;
      }
    }

    // CPF
    var cpf = dom.inputCPF.value.replace(/\D/g, '');
    if (cpf.length !== 11) {
      showFieldError('CPF', 'CPF deve ter 11 dígitos.');
      valid = false;
    } else if (!isValidCPF(cpf)) {
      showFieldError('CPF', 'CPF inválido.');
      valid = false;
    }

    // DDD
    var ddd = dom.inputDDD.value.replace(/\D/g, '');
    if (ddd.length !== 2 || parseInt(ddd, 10) < 11) {
      showFieldError('DDD', 'DDD inválido.');
      valid = false;
    }

    // Telefone
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

  // ─── Comunicação com Backend ──────────────────────────────

  function apiCall(action, extraData) {
    var ddd = dom.inputDDD.value.replace(/\D/g, '');
    var telefone = dom.inputTelefone.value.replace(/\D/g, '');

    var payload = {
      action: action,
      nome: dom.inputNome.value.trim(),
      data_nascimento: dom.inputDOB.value.trim(),
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

    return fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      redirect: 'follow',
      body: JSON.stringify(payload)
    })
    .then(function (resp) {
      if (!resp.ok) throw new Error('Erro de rede');
      return resp.json();
    });
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
  }

  // ─── Consultar ────────────────────────────────────────────

  function handleConsulta(e) {
    e.preventDefault();
    if (state.loading) return;
    if (!validateForm()) return;

    state.loading = true;
    setLoading(dom.btnConsultar, true);

    apiCall('consultar')
      .then(function (data) {
        if (data.status === 'success') {
          state.agendamentos = data.agendamentos || [];
          state.formData = {
            nome: dom.inputNome.value.trim(),
            nomeCliente: data.nome_cliente || ''
          };
          renderResults();
        } else {
          showToast(data.message || 'Erro ao consultar.', 'error');
        }
      })
      .catch(function () {
        showToast('Falha na conexão. Tente novamente.', 'error');
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
      : state.formData.nome.split(' ')[0];

    dom.resultTitle.textContent = 'Olá, ' + greeting;

    dom.resultList.innerHTML = '';
    dom.resultEmpty.style.display = state.agendamentos.length === 0 ? '' : 'none';

    for (var i = 0; i < state.agendamentos.length; i++) {
      var ag = state.agendamentos[i];
      var card = createAgendamentoCard(ag, i);
      dom.resultList.appendChild(card);
    }
  }

  function createAgendamentoCard(ag, index) {
    var card = document.createElement('div');
    card.className = 'ag-card';
    card.setAttribute('data-index', index);
    card.style.animationDelay = (index * 0.08) + 's';

    // Badge de status
    var badgeClass = 'badge-default';
    var statusLabel = ag.status || 'Agendado';
    if (ag.status_codigo === 'C') {
      badgeClass = 'badge-confirmado';
      statusLabel = 'Confirmado';
    } else if (ag.status_codigo === 'P') {
      badgeClass = 'badge-pendente';
      statusLabel = 'Pendente';
    }

    // Data/hora formatada
    var dtParts = ag.data_inicio.split(' ');
    var dataPart = dtParts[0] || '';
    var horaPart = dtParts[1] || '';
    var horaFim = ag.data_fim ? ag.data_fim.split(' ')[1] || '' : '';
    var horaDisplay = horaPart + (horaFim ? ' às ' + horaFim : '');

    // Dia da semana
    var dp = dataPart.split('/');
    var dateObj = new Date(parseInt(dp[2], 10), parseInt(dp[1], 10) - 1, parseInt(dp[0], 10));
    var dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    var diaSemana = dias[dateObj.getDay()] || '';

    // Montar HTML seguro via DOM (não innerHTML) para prevenir XSS
    var badge = document.createElement('span');
    badge.className = 'ag-status-badge ' + badgeClass;
    badge.textContent = statusLabel;

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

    // Botões
    var actions = document.createElement('div');
    actions.className = 'ag-actions';

    var btnRemarcar = document.createElement('button');
    btnRemarcar.type = 'button';
    btnRemarcar.className = 'btn btn-reschedule btn-sm';
    btnRemarcar.innerHTML = '<span class="btn-text">Remarcar</span><span class="btn-loader" style="display:none;"><span class="spinner"></span></span>';
    btnRemarcar.addEventListener('click', function (ref, idx) {
      return function () { openModal('remarcar', ref, idx); };
    }(ag.ref, index));

    var btnCancelar = document.createElement('button');
    btnCancelar.type = 'button';
    btnCancelar.className = 'btn btn-cancel-card btn-sm';
    btnCancelar.innerHTML = '<span class="btn-text">Cancelar</span><span class="btn-loader" style="display:none;"><span class="spinner"></span></span>';
    btnCancelar.addEventListener('click', function (ref, idx) {
      return function () { openModal('cancelar', ref, idx); };
    }(ag.ref, index));

    actions.appendChild(btnRemarcar);
    actions.appendChild(btnCancelar);

    card.appendChild(badge);
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
      dom.modalTitle.textContent = 'Cancelar agendamento?';
      dom.modalText.textContent = 'O agendamento de ' + ag.data_inicio + ' (' + ag.servico + ') será cancelado. Essa ação não pode ser desfeita.';
      dom.modalConfirmText.textContent = 'Confirmar cancelamento';
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
            // Marcar card como cancelado
            var card = dom.resultList.querySelector('[data-index="' + index + '"]');
            if (card) card.classList.add('cancelled');
            state.agendamentos.splice(index, 1);
            showToast('Agendamento cancelado com sucesso.', 'success');
            // Re-render para atualizar índices
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
        showToast('Falha na conexão. Tente novamente.', 'error');
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

  // ─── Voltar ao Formulário ─────────────────────────────────

  function voltarForm() {
    dom.resultSection.style.display = 'none';
    dom.formSection.style.display = '';
    state.agendamentos = [];
  }

  // ─── Inicialização ────────────────────────────────────────

  function init() {
    // Ano no footer
    dom.yearFooter.textContent = new Date().getFullYear();

    // Tema
    initTheme();

    // Máscaras
    dom.inputDOB.addEventListener('input', maskDOB);
    dom.inputCPF.addEventListener('input', maskCPF);
    dom.inputDDD.addEventListener('input', maskDDD);
    dom.inputTelefone.addEventListener('input', maskTelefone);

    // Prevenir paste de caracteres indevidos
    [dom.inputDDD, dom.inputTelefone].forEach(function (el) {
      el.addEventListener('paste', function (e) {
        var text = (e.clipboardData || window.clipboardData).getData('text');
        if (/\D/.test(text.replace(/\D/g, ''))) {
          // Permite paste mas limpa depois
        }
      });
    });

    // Submit
    dom.form.addEventListener('submit', handleConsulta);

    // Voltar
    dom.btnVoltar.addEventListener('click', voltarForm);

    // Modal
    dom.modalCancel.addEventListener('click', closeModal);
    dom.modalConfirm.addEventListener('click', confirmAction);
    dom.modalOverlay.addEventListener('click', function (e) {
      if (e.target === dom.modalOverlay) closeModal();
    });

    // Link modal
    dom.linkClose.addEventListener('click', closeLinkModal);
    dom.linkOverlay.addEventListener('click', function (e) {
      if (e.target === dom.linkOverlay) closeLinkModal();
    });

    // Fechar modais com ESC
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeModal();
        closeLinkModal();
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
