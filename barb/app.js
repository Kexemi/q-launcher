(function () {
  "use strict";

  var runtime = window.AIOS_CAPSULE_RUNTIME || {};
  var tg = window.Telegram && window.Telegram.WebApp;
  var state = {
    apiBase: "",
    session: null,
    index: 0,
    saving: false,
  };

  var el = {
    app: document.getElementById("app"),
    back: document.getElementById("backButton"),
    progressLabel: document.getElementById("progressLabel"),
    progressTrack: document.getElementById("progressTrack"),
    progressFill: document.getElementById("progressFill"),
    loading: document.getElementById("loadingPanel"),
    loadingText: document.getElementById("loadingText"),
    card: document.getElementById("tasteCard"),
    environment: document.getElementById("environment"),
    candidate: document.getElementById("candidateText"),
    question: document.getElementById("question"),
    complete: document.getElementById("completePanel"),
    error: document.getElementById("errorPanel"),
    errorText: document.getElementById("errorText"),
    dock: document.getElementById("actionDock"),
    choices: Array.prototype.slice.call(document.querySelectorAll("[data-choice]")),
    review: document.getElementById("reviewButton"),
    close: document.getElementById("closeButton"),
    retry: document.getElementById("retryButton"),
    keepCount: document.getElementById("keepCount"),
    maybeCount: document.getElementById("maybeCount"),
    killCount: document.getElementById("killCount"),
  };

  function setPanel(name) {
    el.loading.hidden = name !== "loading";
    el.card.hidden = name !== "card";
    el.complete.hidden = name !== "complete";
    el.error.hidden = name !== "error";
    el.dock.hidden = name !== "card";
    el.app.setAttribute("aria-busy", String(name === "loading"));
  }

  function safeHaptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === "success") tg.HapticFeedback.notificationOccurred("success");
      else tg.HapticFeedback.selectionChanged();
    } catch (error) {
      // Haptics are optional; a failed vibration must never break taste capture.
    }
  }

  function isAllowedApiUrl(value) {
    var parsed;
    try { parsed = new URL(value); } catch (error) { return false; }
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost"))) {
      return false;
    }
    var allowed = runtime.allowedApiHosts || [];
    return allowed.some(function (host) {
      return parsed.hostname === host || parsed.hostname.endsWith("." + host);
    });
  }

  function discoverApiBase() {
    if (runtime.apiBase) {
      if (!isAllowedApiUrl(runtime.apiBase)) return Promise.reject(new Error("api_base_refused"));
      return Promise.resolve(new URL(runtime.apiBase).origin);
    }
    return fetch(runtime.discoveryUrl || "../url.json", { cache: "no-store", referrerPolicy: "no-referrer" })
      .then(function (response) {
        if (!response.ok) throw new Error("api_discovery_failed");
        return response.json();
      })
      .then(function (payload) {
        var candidate = payload && payload.url;
        if (!isAllowedApiUrl(candidate)) throw new Error("api_discovery_refused");
        return new URL(candidate).origin;
      });
  }

  function apiFetch(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {}, {
      "X-Telegram-Init-Data": tg.initData,
    });
    return fetch(state.apiBase + (runtime.apiPath || "/api/capsules/barb") + path, Object.assign({}, options, {
      headers: headers,
      cache: "no-store",
      referrerPolicy: "no-referrer",
    })).then(function (response) {
      return response.text().then(function (text) {
        var payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch (error) { payload = {}; }
        if (!response.ok) {
          var failure = new Error(payload.error || "capsule_request_failed");
          failure.status = response.status;
          throw failure;
        }
        return payload;
      });
    });
  }

  function counts() {
    var values = Object.values(state.session.state.decisions || {});
    return {
      keep: values.filter(function (value) { return value === "keep"; }).length,
      maybe: values.filter(function (value) { return value === "maybe"; }).length,
      kill: values.filter(function (value) { return value === "kill"; }).length,
    };
  }

  function firstUndecided() {
    var decisions = state.session.state.decisions || {};
    var items = state.session.round.items;
    for (var index = 0; index < items.length; index += 1) {
      if (!decisions[items[index].candidate_id]) return index;
    }
    return items.length;
  }

  function setSaving(value) {
    state.saving = value;
    el.choices.forEach(function (button) { button.disabled = value; });
    el.back.disabled = value || state.index <= 0;
  }

  function render() {
    var session = state.session;
    var items = session.round.items;
    var decisions = session.state.decisions || {};
    var completeCount = Object.keys(decisions).length;
    var total = items.length;
    var pct = total ? Math.round((completeCount / total) * 100) : 0;
    el.progressLabel.textContent = completeCount + " / " + total;
    el.progressFill.style.width = pct + "%";
    el.progressTrack.setAttribute("aria-valuenow", String(pct));

    if (state.index >= total) {
      var summary = counts();
      el.keepCount.textContent = String(summary.keep);
      el.maybeCount.textContent = String(summary.maybe);
      el.killCount.textContent = String(summary.kill);
      el.back.disabled = total === 0;
      setPanel("complete");
      return;
    }

    var item = items[state.index];
    var action = (item.action_type || "item").replace(/_/g, " ").toUpperCase();
    el.environment.textContent = action + " · " + item.environment;
    el.candidate.textContent = item.text;
    el.question.textContent = session.round.question;
    el.choices.forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.choice === decisions[item.candidate_id]));
    });
    setPanel("card");
    setSaving(false);
  }

  function showError(error) {
    var status = error && error.status;
    if (!tg || !tg.initData) {
      el.errorText.textContent = "Open this from the Barb button in Telegram.";
    } else if (status === 401 || status === 403) {
      el.errorText.textContent = "This Barb app is owner-only. Close it and reopen from your Telegram chat.";
    } else {
      el.errorText.textContent = "Barb couldn’t reach the home system. Your last saved labels are safe.";
    }
    setPanel("error");
  }

  function loadSession() {
    setPanel("loading");
    el.loadingText.textContent = "Opening your taste round…";
    if (!tg || !tg.initData) {
      showError(new Error("telegram_launch_required"));
      return Promise.resolve();
    }
    tg.ready();
    tg.expand();
    if (typeof tg.disableVerticalSwipes === "function") tg.disableVerticalSwipes();
    return discoverApiBase()
      .then(function (apiBase) {
        state.apiBase = apiBase;
        return apiFetch("/session", { method: "GET" });
      })
      .then(function (session) {
        if (session.app_id !== runtime.appId || !session.permissions || session.permissions.x_post !== false || session.permissions.batch_approval !== false) {
          throw new Error("capsule_authority_boundary_invalid");
        }
        state.session = session;
        state.index = firstUndecided();
        render();
      })
      .catch(showError);
  }

  function decide(choice) {
    if (state.saving || !state.session) return;
    var item = state.session.round.items[state.index];
    if (!item) return;
    setSaving(true);
    apiFetch("/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        round_id: state.session.round.round_id,
        candidate_id: item.candidate_id,
        choice: choice,
      }),
    }).then(function (response) {
      if (!response.permissions || response.permissions.x_post !== false || response.permissions.batch_approval !== false) {
        throw new Error("capsule_authority_boundary_invalid");
      }
      state.session.state = response.state;
      state.session.counts = response.counts;
      safeHaptic("selection");
      state.index = Math.min(state.index + 1, state.session.round.items.length);
      render();
      if (state.index >= state.session.round.items.length) safeHaptic("success");
    }).catch(function (error) {
      setSaving(false);
      showError(error);
    });
  }

  el.choices.forEach(function (button) {
    button.addEventListener("click", function () { decide(button.dataset.choice); });
  });
  el.back.addEventListener("click", function () {
    if (!state.saving && state.index > 0) {
      state.index -= 1;
      render();
    }
  });
  el.review.addEventListener("click", function () {
    state.index = 0;
    render();
  });
  el.close.addEventListener("click", function () {
    if (tg && typeof tg.close === "function") tg.close();
  });
  el.retry.addEventListener("click", loadSession);

  loadSession();
})();
