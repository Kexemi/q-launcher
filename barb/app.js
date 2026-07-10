(function () {
  "use strict";

  var runtime = window.AIOS_CAPSULE_RUNTIME || {};
  var tg = window.Telegram && window.Telegram.WebApp;
  var state = {
    apiBase: "",
    writeSession: "",
    session: null,
    index: 0,
    reviewing: false,
    saving: false,
    view: "activity",
  };

  var el = {
    app: document.getElementById("app"),
    back: document.getElementById("backButton"),
    progressLabel: document.getElementById("progressLabel"),
    progressTrack: document.getElementById("progressTrack"),
    progressFill: document.getElementById("progressFill"),
    activityTab: document.getElementById("activityTab"),
    tasteTab: document.getElementById("tasteTab"),
    loading: document.getElementById("loadingPanel"),
    loadingText: document.getElementById("loadingText"),
    activity: document.getElementById("activityPanel"),
    activityStatus: document.getElementById("activityStatus"),
    activityList: document.getElementById("activityList"),
    activityEmpty: document.getElementById("activityEmpty"),
    replyActivityCount: document.getElementById("replyActivityCount"),
    mentionActivityCount: document.getElementById("mentionActivityCount"),
    likeActivityCount: document.getElementById("likeActivityCount"),
    followActivityCount: document.getElementById("followActivityCount"),
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
    el.activity.hidden = name !== "activity";
    el.card.hidden = name !== "card";
    el.complete.hidden = name !== "complete";
    el.error.hidden = name !== "error";
    el.dock.hidden = name !== "card";
    el.app.setAttribute("aria-busy", String(name === "loading"));
  }

  function setViewChrome(view) {
    state.view = view;
    el.activityTab.setAttribute("aria-selected", String(view === "activity"));
    el.tasteTab.setAttribute("aria-selected", String(view === "taste"));
    el.progressTrack.hidden = view !== "taste";
    el.back.hidden = view !== "taste";
    if (view === "activity") el.progressLabel.textContent = "READ";
  }

  function safeHaptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === "success") tg.HapticFeedback.notificationOccurred("success");
      else tg.HapticFeedback.selectionChanged();
    } catch (error) {
      // Haptics are optional; a failed vibration must never break the account room.
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
    var headers = Object.assign({}, options.headers || {});
    if (path === "/session") headers["X-Telegram-Init-Data"] = tg.initData;
    else headers["X-Barb-Session"] = state.writeSession;
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

  function titleCase(value) {
    var text = String(value || "activity").replace(/_/g, " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function renderActivity() {
    setViewChrome("activity");
    var activity = state.session.activity || { status: "not_connected", summary: { counts: {} }, recent: [] };
    var summary = activity.summary || { counts: {} };
    var totals = summary.counts || {};
    el.replyActivityCount.textContent = String(totals.reply || 0);
    el.mentionActivityCount.textContent = String(totals.mention || 0);
    el.likeActivityCount.textContent = String(totals.like || 0);
    el.followActivityCount.textContent = String(totals.follow || 0);
    var statusLabels = {
      ready: "Receiving",
      waiting_for_x_read_connection: "Receiver ready",
      not_connected: "Not connected",
    };
    el.activityStatus.textContent = statusLabels[activity.status] || "Read only";
    el.activityStatus.dataset.status = activity.status || "unknown";
    while (el.activityList.firstChild) el.activityList.removeChild(el.activityList.firstChild);
    var recent = Array.isArray(activity.recent) ? activity.recent : [];
    el.activityEmpty.hidden = recent.length > 0;
    recent.forEach(function (event) {
      var article = document.createElement("article");
      article.className = "activity-item priority-" + String(event.priority || "ambient");
      var top = document.createElement("div");
      top.className = "activity-item-top";
      var kind = document.createElement("strong");
      kind.textContent = titleCase(event.kind);
      var actor = document.createElement("span");
      var username = event.actor && event.actor.username;
      actor.textContent = username ? "@" + username : "X activity";
      top.appendChild(kind);
      top.appendChild(actor);
      article.appendChild(top);
      if (event.post && event.post.text) {
        var text = document.createElement("p");
        text.textContent = event.post.text;
        article.appendChild(text);
      }
      if (event.post && event.post.url) {
        var link = document.createElement("a");
        link.href = event.post.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open on X";
        article.appendChild(link);
      }
      el.activityList.appendChild(article);
    });
    setPanel("activity");
  }

  function renderTaste() {
    setViewChrome("taste");
    var session = state.session;
    var items = session.round.items;
    var decisions = session.state.decisions || {};
    var completeCount = Object.keys(decisions).length;
    var total = items.length;
    var pct = total ? Math.round((completeCount / total) * 100) : 0;
    el.progressFill.style.width = pct + "%";
    el.progressTrack.setAttribute("aria-valuenow", String(pct));

    if (state.index >= total) {
      state.reviewing = false;
      el.progressLabel.textContent = completeCount + " / " + total;
      var summary = counts();
      el.keepCount.textContent = String(summary.keep);
      el.maybeCount.textContent = String(summary.maybe);
      el.killCount.textContent = String(summary.kill);
      el.back.disabled = total === 0;
      setPanel("complete");
      return;
    }

    var item = items[state.index];
    if (state.reviewing && !decisions[item.candidate_id]) state.reviewing = false;
    el.progressLabel.textContent = state.reviewing
      ? "Review " + (state.index + 1) + " / " + total
      : completeCount + " / " + total;
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

  function switchView(view) {
    if (!state.session) return;
    if (view === "activity") renderActivity();
    else renderTaste();
  }

  function showError(error) {
    var status = error && error.status;
    if (!tg || !tg.initData) {
      el.errorText.textContent = "Open this from the Barb button in Telegram.";
    } else if (status === 401 || status === 403) {
      el.errorText.textContent = "This Barb app is owner-only. Close it and reopen from your Telegram chat.";
    } else {
      el.errorText.textContent = "Barb couldn’t reach the home system. Saved taste labels and activity receipts are safe.";
    }
    setPanel("error");
  }

  function authorityBoundaryIsValid(session) {
    var permissions = session && session.permissions;
    return Boolean(
      session && session.app_id === runtime.appId && permissions &&
      permissions.x_post === false && permissions.x_reply === false &&
      permissions.x_like === false && permissions.x_follow === false &&
      permissions.x_schedule === false && permissions.batch_approval === false
    );
  }

  function loadSession() {
    setPanel("loading");
    el.loadingText.textContent = "Opening Barb…";
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
        if (!authorityBoundaryIsValid(session) || !session.write_session || session.write_session.storage !== "memory_only") {
          throw new Error("capsule_authority_boundary_invalid");
        }
        state.writeSession = session.write_session.token;
        delete session.write_session;
        state.session = session;
        state.reviewing = false;
        state.index = firstUndecided();
        renderActivity();
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
        expected_version: state.session.state.version,
      }),
    }).then(function (response) {
      var permissions = response.permissions || {};
      if (permissions.x_post !== false || permissions.x_reply !== false || permissions.x_like !== false || permissions.x_follow !== false || permissions.batch_approval !== false) {
        throw new Error("capsule_authority_boundary_invalid");
      }
      state.session.state = response.state;
      state.session.counts = response.counts;
      safeHaptic("selection");
      state.index = Math.min(state.index + 1, state.session.round.items.length);
      renderTaste();
      if (state.index >= state.session.round.items.length) safeHaptic("success");
    }).catch(function (error) {
      setSaving(false);
      if (error && error.status === 409) {
        loadSession();
        return;
      }
      showError(error);
    });
  }

  el.choices.forEach(function (button) {
    button.addEventListener("click", function () { decide(button.dataset.choice); });
  });
  el.activityTab.addEventListener("click", function () { switchView("activity"); });
  el.tasteTab.addEventListener("click", function () { switchView("taste"); });
  el.back.addEventListener("click", function () {
    if (!state.saving && state.index > 0) {
      state.index -= 1;
      state.reviewing = true;
      renderTaste();
    }
  });
  el.review.addEventListener("click", function () {
    state.index = 0;
    state.reviewing = true;
    renderTaste();
  });
  el.close.addEventListener("click", function () {
    if (tg && typeof tg.close === "function") tg.close();
  });
  el.retry.addEventListener("click", loadSession);

  loadSession();
})();
