
(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    schedule: {},
    resources: [],
    settings: {},
    subjects: {},
    exams: {},
    supabaseClient: null,
    user: null,
    currentDate: localStorage.getItem("reviseflow_current_date"),
    currentMonth: null,
    activeTab: localStorage.getItem("reviseflow_active_tab") || "home",
    currentSubject: null,
    completed: JSON.parse(localStorage.getItem("reviseflow_completed") || "{}"),
    rag: JSON.parse(localStorage.getItem("reviseflow_rag") || "{}"),
    theme: localStorage.getItem("reviseflow_theme") || "dark",
  };

  function showError(msg) {
    const box = $("errorBox");
    if (box) {
      box.textContent = msg;
      box.classList.remove("hidden");
    }
    console.error(msg);
  }

  async function loadJson(path, fallback) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`${path} returned ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn("Failed to load", path, e);
      return fallback;
    }
  }

  function saveLocal() {
    localStorage.setItem("reviseflow_completed", JSON.stringify(state.completed));
    localStorage.setItem("reviseflow_rag", JSON.stringify(state.rag));
    localStorage.setItem("reviseflow_current_date", state.currentDate || "");
    localStorage.setItem("reviseflow_active_tab", state.activeTab);
    localStorage.setItem("reviseflow_theme", state.theme);
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.body.setAttribute("data-theme", theme);
    saveLocal();
  }

  function prettyDate(ds) {
    return new Date(ds + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function monthLabel(ym) {
    return new Date(ym + "-01T12:00:00").toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }

  function taskId(ds, idx) {
    return `${ds}__${idx}`;
  }

  function isDone(ds, idx) {
    return !!state.completed[taskId(ds, idx)];
  }

  function setSyncStatus(text) {
    if ($("syncStatus")) $("syncStatus").textContent = text;
  }

  function setUserStatus(text) {
    if ($("userStatus")) $("userStatus").textContent = text;
  }

  async function setCompleted(ds, idx, value) {
    const id = taskId(ds, idx);
    state.completed[id] = value;
    saveLocal();
    render();
    if (state.user && state.supabaseClient) {
      try {
        await state.supabaseClient.from("progress").upsert({
          user_id: state.user.id,
          task_id: id,
          completed: value,
        });
        setSyncStatus("Cloud synced");
      } catch (e) {
        showError("Cloud sync failed.");
      }
    }
  }

  function setRag(subject, topic, level) {
    state.rag[`${subject}__${topic}`] = level;
    saveLocal();
    renderSubjectsDetail();
  }

  function getRag(subject, topic) {
    return state.rag[`${subject}__${topic}`] || "red";
  }

  function allDates() {
    return Object.keys(state.schedule).sort();
  }

  function carryOverTasks(ds) {
    const items = [];
    for (const d of allDates()) {
      if (d >= ds) break;
      (state.schedule[d] || []).forEach((task, idx) => {
        if (!isDone(d, idx)) items.push({ date: d, idx, task });
      });
    }
    return items.slice(-8);
  }

  function progressForDate(ds) {
    const tasks = state.schedule[ds] || [];
    const done = tasks.filter((_, idx) => isDone(ds, idx)).length;
    return { done, total: tasks.length, pct: tasks.length ? Math.round((done * 100) / tasks.length) : 0 };
  }

  function shiftDay(ds, n) {
    const d = new Date(ds + "T12:00:00");
    d.setDate(d.getDate() + n);
    const next = d.toISOString().slice(0, 10);
    if (state.settings.startDate && next < state.settings.startDate) return state.settings.startDate;
    if (state.settings.endDate && next > state.settings.endDate) return state.settings.endDate;
    return next;
  }

  function renderTaskList(container, items, mode = "main") {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<div class="task">Nothing here right now.</div>';
      return;
    }
    container.innerHTML = items.map((item, idx) => {
      const task = mode === "main" ? item : item.task;
      const ds = mode === "main" ? state.currentDate : item.date;
      const tIdx = mode === "main" ? idx : item.idx;
      const done = isDone(ds, tIdx);
      return `<div class="task ${done ? "done" : ""} ${mode === "carry" ? "carry" : ""}">
        <div class="subject">${task.subject || ""}</div>
        <div class="taskTitle">${task.title || ""}</div>
        ${mode === "carry" ? `<div class="miniLabel">From ${prettyDate(item.date)}</div>` : ""}
        <div class="taskDetails">${task.details || ""}</div>
        <div class="topicToolbar"><button class="small" type="button" onclick="window.rfToggleDone('${ds}', ${tIdx})">${done ? "Untick" : "Tick complete"}</button></div>
      </div>`;
    }).join("");
  }

  function renderHome() {
    const today = new Date().toISOString().slice(0, 10);
    const tasks = state.schedule[state.currentDate] || [];
    const subjects = [...new Set(tasks.map((t) => t.subject))];
    const examsToday = state.exams[state.currentDate] || [];
    $("homeDateTag").textContent = state.currentDate === today ? "Today" : "Selected day";
    $("homeDateTitle").textContent = prettyDate(state.currentDate);
    $("homeMeta").innerHTML = `<span class="pill">${subjects.length} subjects</span><span class="pill">${examsToday.length ? examsToday.length + " exam item" + (examsToday.length > 1 ? "s" : "") : "Revision day"}</span>`;
    const p = progressForDate(state.currentDate);
    $("progressText").textContent = `${p.done} of ${p.total} tasks done`;
    $("progressFill").style.width = p.pct + "%";
    renderTaskList($("todayTasks"), tasks, "main");
    renderTaskList($("carryTasks"), carryOverTasks(state.currentDate), "carry");
    $("linksBox").innerHTML = (state.resources || []).map((r) => `<div class="linkCard"><div class="subject">${r.name || ""}</div><div class="taskTitle">${r.label || ""}</div><a href="${r.url}" target="_blank">${r.url}</a></div>`).join("") || '<div class="task">No links added yet.</div>';
  }

  function renderCalendar() {
    $("monthTitle").textContent = monthLabel(state.currentMonth);
    const start = new Date(state.currentMonth + "-01T12:00:00");
    const firstDow = (start.getDay() + 6) % 7;
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - firstDow);
    const today = new Date().toISOString().slice(0, 10);
    let cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      const ex = state.exams[ds] || [];
      const prog = progressForDate(ds);
      cells.push(`<button class="dayCell ${ds.slice(0, 7) !== state.currentMonth ? "other" : ""} ${ds === state.currentDate ? "selected" : ""}" type="button" onclick="window.rfSelectDate('${ds}')"><div class="dayNum">${d.getDate()}</div><div class="miniDots">${ex.length ? '<span class="miniDot" style="background:var(--amber)"></span>' : ""}${(state.schedule[ds] || []).length ? '<span class="miniDot"></span>' : ""}${prog.total && prog.done === prog.total ? '<span class="miniDot" style="background:var(--green)"></span>' : ""}</div><div class="miniLabel">${ds === today ? "Today" : ex.length ? "Exam" : (state.schedule[ds] || []).length ? prog.done + "/" + prog.total : ""}</div></button>`);
    }
    $("calendarGrid").innerHTML = cells.join("");
    $("selectedDateTitle").textContent = prettyDate(state.currentDate);
    $("selectedExamPills").innerHTML = ((state.exams[state.currentDate] || []).map((e) => `<span class="pill">${e.title}</span>`).join("")) || '<span class="pill">No exam on this date</span>';
    renderTaskList($("selectedTasks"), state.schedule[state.currentDate] || [], "main");
  }

  function renderSubjectsGrid() {
    $("subjectsGrid").innerHTML = Object.keys(state.subjects).map((name) => {
      const s = state.subjects[name];
      return `<div class="subjectCard" onclick='window.rfOpenSubject(${JSON.stringify(name)})'><div class="subject">${s.board || ""}</div><h3>${name}</h3><div class="small">${(s.key_topics || []).slice(0, 3).join(" · ")}</div></div>`;
    }).join("");
  }

  function renderSubjectsDetail() {
    if (!state.currentSubject) return;
    const s = state.subjects[state.currentSubject];
    $("subjectDetail").classList.remove("hidden");
    $("subjectTitle").textContent = state.currentSubject;
    $("subjectBoard").textContent = s.board || "";
    $("subjectKeyTopics").innerHTML = `<div class="subject">Key topics</div><div class="taskTitle">${(s.key_topics || []).join(" · ")}</div>`;
    $("subjectWebsites").innerHTML = `<div class="subject">Useful websites</div>${(s.websites || []).map((w) => `<div class="taskTitle" style="font-size:.96rem">${w.label}</div><a href="${w.url}" target="_blank">${w.url}</a>`).join("")}`;
    const english = $("englishExtras");
    if (state.currentSubject === "English Literature" && s.english_sets) {
      english.classList.remove("hidden");
      english.innerHTML = `<div class="subject">English extras</div>${Object.keys(s.english_sets).map((book) => `<div class="quoteCard"><div class="taskTitle">${book}</div><div class="small"><strong>Themes:</strong> ${(s.english_sets[book].themes || []).join(", ")}</div><div class="small"><strong>Characters:</strong> ${(s.english_sets[book].characters || []).join(", ")}</div><div class="small"><strong>Key quotes:</strong> ${(s.english_sets[book].quotes || []).join(" | ")}</div></div>`).join("")}`;
    } else {
      english.classList.add("hidden");
      english.innerHTML = "";
    }
    $("subjectTopicsList").innerHTML = (s.topics || []).map((topic) => {
      const level = getRag(state.currentSubject, topic);
      return `<div class="topicCard"><div class="subject">${state.currentSubject}</div><div class="taskTitle">${topic}</div><div class="small">Set your confidence:</div><div class="topicToolbar"><button class="small rag-red ${level === "red" ? "activeChoice" : ""}" type="button" onclick='window.rfSetRag(${JSON.stringify(state.currentSubject)}, ${JSON.stringify(topic)}, "red")'>Red</button><button class="small rag-amber ${level === "amber" ? "activeChoice" : ""}" type="button" onclick='window.rfSetRag(${JSON.stringify(state.currentSubject)}, ${JSON.stringify(topic)}, "amber")'>Amber</button><button class="small rag-green ${level === "green" ? "activeChoice" : ""}" type="button" onclick='window.rfSetRag(${JSON.stringify(state.currentSubject)}, ${JSON.stringify(topic)}, "green")'>Green</button></div></div>`;
    }).join("");
  }

  function showTab(tab) {
    state.activeTab = tab;
    ["home", "calendar", "subjects", "menu"].forEach((p) => {
      $(p + "Page").classList.toggle("active", p === tab);
      $(p + "TabBtn").classList.toggle("active", p === tab);
    });
    saveLocal();
  }

  function showApp() {
    $("authView").classList.add("hidden");
    $("appView").classList.remove("hidden");
  }

  function showAuth() {
    $("authView").classList.remove("hidden");
    $("appView").classList.add("hidden");
  }

  async function handleSession() {
    if (!state.supabaseClient) {
      showApp();
      setSyncStatus("Local mode");
      setUserStatus("Signed out");
      render();
      return;
    }
    const { data, error } = await state.supabaseClient.auth.getSession();
    if (error) {
      showError("Could not read Supabase session.");
      return;
    }
    state.user = data.session?.user || null;
    if (state.user) {
      showApp();
      $("logoutBtn").classList.remove("hidden");
      setUserStatus(state.user.email || "Signed in");
      setSyncStatus("Cloud connected");
      await loadCloudProgress();
      render();
    } else {
      showAuth();
    }
  }

  async function loadCloudProgress() {
    if (!state.user || !state.supabaseClient) return;
    const { data, error } = await state.supabaseClient.from("progress").select("task_id,completed").eq("user_id", state.user.id);
    if (error) {
      showError("Could not load cloud progress.");
      return;
    }
    (data || []).forEach((row) => { state.completed[row.task_id] = row.completed; });
    saveLocal();
  }

  async function signUp() {
    try {
      if (!state.supabaseClient) return showError("Supabase is not configured in settings.json.");
      const email = $("emailInput").value.trim();
      const password = $("passwordInput").value.trim();
      const { error } = await state.supabaseClient.auth.signUp({ email, password });
      if (error) return showError(error.message);
      showError("Account created. If email confirmation is enabled, confirm it, then sign in.");
    } catch (e) {
      showError("Create account failed: " + e.message);
    }
  }

  async function signIn() {
    try {
      if (!state.supabaseClient) return showError("Supabase is not configured in settings.json.");
      const email = $("emailInput").value.trim();
      const password = $("passwordInput").value.trim();
      const { error } = await state.supabaseClient.auth.signInWithPassword({ email, password });
      if (error) return showError(error.message);
    } catch (e) {
      showError("Sign in failed: " + e.message);
    }
  }

  async function signOut() {
    if (!state.supabaseClient) return;
    await state.supabaseClient.auth.signOut();
    state.user = null;
    showAuth();
  }

  function render() {
    renderHome();
    renderCalendar();
    renderSubjectsGrid();
    if (state.currentSubject) renderSubjectsDetail();
    showTab(state.activeTab);
  }

  function bindUI() {
    $("signUpBtn").addEventListener("click", signUp);
    $("signInBtn").addEventListener("click", signIn);
    $("guestBtn").addEventListener("click", () => {
      showApp();
      setSyncStatus("Local mode");
      setUserStatus("Signed out");
      render();
    });
    $("logoutBtn").addEventListener("click", signOut);
    $("themeBtn").addEventListener("click", () => applyTheme(document.body.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("homePrevBtn").addEventListener("click", () => { state.currentDate = shiftDay(state.currentDate, -1); state.currentMonth = state.currentDate.slice(0, 7); saveLocal(); render(); });
    $("homeNextBtn").addEventListener("click", () => { state.currentDate = shiftDay(state.currentDate, 1); state.currentMonth = state.currentDate.slice(0, 7); saveLocal(); render(); });
    $("prevMonthBtn").addEventListener("click", () => { const d = new Date(state.currentMonth + "-01T12:00:00"); d.setMonth(d.getMonth() - 1); state.currentMonth = d.toISOString().slice(0, 7); renderCalendar(); });
    $("nextMonthBtn").addEventListener("click", () => { const d = new Date(state.currentMonth + "-01T12:00:00"); d.setMonth(d.getMonth() + 1); state.currentMonth = d.toISOString().slice(0, 7); renderCalendar(); });
    $("closeSubjectBtn").addEventListener("click", () => $("subjectDetail").classList.add("hidden"));
    $("homeTabBtn").addEventListener("click", () => showTab("home"));
    $("calendarTabBtn").addEventListener("click", () => showTab("calendar"));
    $("subjectsTabBtn").addEventListener("click", () => showTab("subjects"));
    $("menuTabBtn").addEventListener("click", () => showTab("menu"));
    window.rfToggleDone = (ds, idx) => setCompleted(ds, idx, !isDone(ds, idx));
    window.rfSelectDate = (ds) => { state.currentDate = ds; state.currentMonth = ds.slice(0, 7); saveLocal(); render(); };
    window.rfOpenSubject = (name) => { state.currentSubject = name; renderSubjectsDetail(); showTab("subjects"); };
    window.rfSetRag = setRag;
  }

  async function start() {
    try {
      bindUI(); // bind first so buttons always work
      state.settings = await loadJson("./settings.json", {});
      state.schedule = await loadJson("./schedule.json", {});
      state.resources = await loadJson("./resources.json", []);
      state.subjects = await loadJson("./subjects.json", {});
      state.exams = state.settings.exams || {};
      document.title = state.settings.appName || "ReviseFlow v6";
      $("appTitle").textContent = state.settings.appName || "ReviseFlow v6";
      applyTheme(state.theme || state.settings.defaultTheme || "dark");
      const today = new Date().toISOString().slice(0, 10);
      if (!state.currentDate || !state.schedule[state.currentDate]) {
        state.currentDate = state.schedule[today] ? today : (state.settings.startDate || today);
      }
      state.currentMonth = state.currentDate.slice(0, 7);
      if (state.settings.supabaseUrl && state.settings.supabaseAnonKey && window.supabase) {
        state.supabaseClient = window.supabase.createClient(state.settings.supabaseUrl, state.settings.supabaseAnonKey);
      }
      await handleSession();
      render();
    } catch (e) {
      showError("App failed to start: " + e.message);
    }
  }

  start();
})();
