// ─────────────────────────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────────────────────────
let activePhase  = 0;
let activeCourse = "AW";

// Persisted state (localStorage)
const STATE_KEY = "examMastery_v2";
let state = loadState();

function defaultState() {
  const qa = {};
  Object.keys(content).forEach(code => {
    qa[code] = {};
    content[code].qa.forEach((_, i) => { qa[code][i] = null; }); // null | "known" | "review"
  });
  const confidence = {};
  Object.keys(content).forEach(code => { confidence[code] = 0; });
  return { qa, confidence, timerSessions: 0, checklist: {}, overviewVisible: true };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return defaultState();
    const saved = JSON.parse(raw);
    // merge so new keys aren't lost after updates
    const def = defaultState();
    return {
      qa:             { ...def.qa,             ...saved.qa },
      confidence:     { ...def.confidence,     ...saved.confidence },
      timerSessions:  saved.timerSessions  ?? 0,
      checklist:      saved.checklist      ?? {},
      overviewVisible: saved.overviewVisible ?? true,
    };
  } catch { return defaultState(); }
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

// ─────────────────────────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

// ─────────────────────────────────────────────────────────────────────────────
//  PHASE / COURSE / PROGRESS RENDERS (original, unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function renderPhaseTabs() {
  document.getElementById("phaseTabs").innerHTML = phases
    .map((p, i) =>
      `<button class="ptab${i === activePhase ? " active" : ""}" onclick="setPhase(${i})">${p.name}</button>`)
    .join("");
}

function renderPhaseBanner() {
  const p = phases[activePhase];
  const scheduleHTML = p.schedule.map(s =>
    `<div class="sched-item">
      <div class="day-label">${s.day}</div>
      <div class="day-task">${s.task}</div>
      <div class="day-hrs">${s.hrs}</div>
    </div>`).join("");
  document.getElementById("phaseBanner").innerHTML = `
    <div><div class="phase-badge">${p.days}</div></div>
    <div class="phase-text">
      <h3>${p.name}</h3>
      <p><strong style="color:${p.color}">${p.goal}</strong></p>
      <p style="margin-top:6px">${p.detail}</p>
      <div class="schedule-grid" style="margin-top:16px">${scheduleHTML}</div>
    </div>`;
}

function renderCourseTabs() {
  document.getElementById("courseTabs").innerHTML = courses.map(c =>
    `<button class="ctab" onclick="setCourse('${c.code}')"
      style="${c.code === activeCourse ? `background:${c.color};border-color:${c.color};color:#fff;font-weight:500` : ""}"
    >${c.code}: ${c.name}</button>`).join("");
}

function renderProgress() {
  const pct = Math.round(((activePhase + 1) / 5) * 100);
  document.getElementById("progressLabel").textContent = `${phases[activePhase].name} · ${phases[activePhase].days}`;
  document.getElementById("progressPct").textContent   = pct + "%";
  document.getElementById("progressBar").style.width   = pct + "%";
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIDENCE RATING (NEW)
// ─────────────────────────────────────────────────────────────────────────────
const CONF_LABELS = ["", "Just started", "Getting there", "Okay-ish", "Pretty solid", "Got this! 🔥"];

function renderConfidenceRow() {
  const cur  = state.confidence[activeCourse] || 0;
  const hint = cur > 0 ? CONF_LABELS[cur] : "Rate your confidence in this course";
  const course = courses.find(c => c.code === activeCourse);
  const starsHTML = [1,2,3,4,5].map(n =>
    `<span class="conf-star${n <= cur ? " active" : ""}" 
      onclick="setConfidence(${n})" 
      title="${CONF_LABELS[n]}"
      style="${n <= cur ? `color:${course.color}` : "color:var(--bg3)"}"
    >★</span>`).join("");
  document.getElementById("confidenceRow").innerHTML = `
    <span class="conf-label">Your confidence:</span>
    <div class="conf-stars-row">${starsHTML}</div>
    <span class="conf-hint" id="confHint">${hint}</span>`;
}

function setConfidence(n) {
  state.confidence[activeCourse] = n;
  saveState();
  renderConfidenceRow();
  renderOverview();
  showToast(`Confidence for ${activeCourse} set to ${n}/5 — ${CONF_LABELS[n]}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  COURSE CONTENT WITH Q&A MARKING (ENHANCED)
// ─────────────────────────────────────────────────────────────────────────────
function qaStats(code) {
  const marks = state.qa[code] || {};
  const total  = Object.keys(marks).length;
  const known  = Object.values(marks).filter(v => v === "known").length;
  const review = Object.values(marks).filter(v => v === "review").length;
  return { total, known, review, answered: known + review };
}

function renderCourseContent() {
  const d      = content[activeCourse];
  const course = courses.find(c => c.code === activeCourse);
  const marks  = state.qa[activeCourse] || {};
  const stats  = qaStats(activeCourse);
  const pct    = stats.total > 0 ? Math.round((stats.known / stats.total) * 100) : 0;

  const kpHTML = d.keypoints.map(k =>
    `<div class="kp-item"><div class="kp-bullet"></div><div><span class="kp-term">${k.term}</span> ${k.def}</div></div>`
  ).join("");

  const resHTML = d.resources.map(r =>
    `<a class="res-btn" href="${r.url}" target="_blank" rel="noopener">${r.label}</a>`
  ).join("");

  const qaHTML = d.qa.map((item, i) => {
    const mark = marks[i];
    return `<div class="qa-item${mark === "known" ? " marked-known" : mark === "review" ? " marked-review" : ""}" id="qa-${activeCourse}-${i}">
      <button class="qa-q" onclick="toggleQA('${activeCourse}',${i})">
        <span class="qa-q-left">
          <span class="qa-status-dot"></span>
          <span>${item.q}</span>
        </span>
        <span class="qa-arrow" id="arr${activeCourse}${i}">▶</span>
      </button>
      <div class="qa-a" id="ans${activeCourse}${i}">
        ${item.a}
        <div class="qa-mark-row">
          <button class="qa-mark-btn known${mark === "known" ? " active-known" : ""}" 
            onclick="markQA('${activeCourse}',${i},'known')">✓ Got it</button>
          <button class="qa-mark-btn review${mark === "review" ? " active-review" : ""}" 
            onclick="markQA('${activeCourse}',${i},'review')">⚑ Review again</button>
          ${mark ? `<button class="qa-mark-btn" onclick="markQA('${activeCourse}',${i},null)" style="margin-left:auto">✕ Clear</button>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

  document.getElementById("courseContent").innerHTML = `
    <div class="section-card">
      <h2 style="color:${course.color}">
        <span class="icon">${d.emoji}</span>
        ${d.title} — Plain English Explanation
      </h2>
      <div class="chip chip-red">Step 1: The simple explanation</div>
      <div class="plain-text">${d.plain}</div>
      <div class="analogy-box">${d.analogy}</div>
      <div class="divider"></div>
      <div class="chip chip-blue">Key concepts to master</div>
      <div class="kp-list">${kpHTML}</div>
      <div class="divider"></div>
      <div class="chip chip-amber">Worked example</div>
      <div class="example-box">
        <div class="ex-label">${d.example.label}</div>
        ${d.example.text.replace(/\n/g, "<br>")}
      </div>
      <div class="divider"></div>
      <div class="chip chip-green">Useful resources</div>
      <div class="resources">${resHTML}</div>
    </div>

    <div class="section-card">
      <div class="qa-section-header">
        <h2 style="margin-bottom:0">
          <span class="icon">🎯</span>
          Practice Q&amp;A
        </h2>
        <div class="qa-score-badge">
          <span>${stats.known}/${stats.total} known</span>
          <div class="qa-score-fill">
            <div class="qa-score-inner" style="width:${pct}%"></div>
          </div>
          <span>${pct}%</span>
        </div>
      </div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px">
        Try answering each question from memory first, then reveal the answer and mark it.
      </p>
      ${qaHTML}
    </div>`;
}

function toggleQA(code, i) {
  const ans = document.getElementById(`ans${code}${i}`);
  const arr = document.getElementById(`arr${code}${i}`);
  if (!ans) return;
  const isOpen = ans.classList.toggle("open");
  arr.classList.toggle("open", isOpen);
}

function markQA(code, i, value) {
  if (!state.qa[code]) state.qa[code] = {};
  state.qa[code][i] = value;
  saveState();
  renderCourseContent();
  renderOverview();
  if (value === "known")  showToast("✓ Marked as known!");
  if (value === "review") showToast("⚑ Flagged for review");
  if (value === null)     showToast("Mark cleared");
  // Re-open the Q&A that was just marked
  requestAnimationFrame(() => {
    const ans = document.getElementById(`ans${code}${i}`);
    const arr = document.getElementById(`arr${code}${i}`);
    if (ans && !ans.classList.contains("open")) {
      ans.classList.add("open");
      arr && arr.classList.add("open");
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  OVERVIEW DASHBOARD (NEW)
// ─────────────────────────────────────────────────────────────────────────────
function renderOverview() {
  let totalKnown = 0, totalQA = 0;
  const gridHTML = courses.map(c => {
    const stats = qaStats(c.code);
    const pct   = stats.total > 0 ? Math.round((stats.known / stats.total) * 100) : 0;
    const conf  = state.confidence[c.code] || 0;
    const stars = [1,2,3,4,5].map(n => `<span style="color:${n <= conf ? c.color : "var(--dim)"}">★</span>`).join("");
    totalKnown += stats.known;
    totalQA    += stats.total;
    return `<div class="ov-course-item">
      <div class="ov-ci-top">
        <span class="ov-ci-name">${c.code}: ${c.name}</span>
        <span class="ov-ci-pct">${stats.known}/${stats.total}</span>
      </div>
      <div class="ov-ci-bar">
        <div class="ov-ci-fill" style="width:${pct}%;background:${c.color}"></div>
      </div>
      <div class="ov-ci-conf">Confidence: <span class="conf-stars">${stars}</span></div>
    </div>`;
  }).join("");

  document.getElementById("overviewGrid").innerHTML = gridHTML;
  const totalPct = totalQA > 0 ? Math.round((totalKnown / totalQA) * 100) : 0;
  document.getElementById("totalQAScore").textContent = `${totalKnown} / ${totalQA}`;
  document.getElementById("totalQABar").style.width = totalPct + "%";
}

function toggleOverview() {
  state.overviewVisible = !state.overviewVisible;
  saveState();
  const body = document.getElementById("overviewBody");
  const btn  = document.querySelector(".ov-toggle");
  body.style.display = state.overviewVisible ? "" : "none";
  btn.textContent    = state.overviewVisible ? "Hide" : "Show";
}

// ─────────────────────────────────────────────────────────────────────────────
//  FULL-TEXT SEARCH (NEW)
// ─────────────────────────────────────────────────────────────────────────────
let searchVisible = false;

function toggleSearch() {
  searchVisible = !searchVisible;
  const panel = document.getElementById("searchPanel");
  const btn   = document.getElementById("searchToggleBtn");
  panel.style.display = searchVisible ? "block" : "none";
  btn.classList.toggle("active", searchVisible);
  if (searchVisible) {
    document.getElementById("searchInput").focus();
    document.getElementById("searchResults").innerHTML = "";
  }
}

function doSearch(query) {
  const q = query.trim().toLowerCase();
  const out = document.getElementById("searchResults");
  if (q.length < 2) { out.innerHTML = ""; return; }

  const results = [];
  courses.forEach(c => {
    const d = content[c.code];
    // Search plain text
    if (stripHtml(d.plain).toLowerCase().includes(q)) {
      results.push({ code: c.code, type: "Explanation", text: stripHtml(d.plain), action: () => jumpToCourse(c.code) });
    }
    // Search key points
    d.keypoints.forEach(k => {
      const text = k.term + " " + k.def;
      if (text.toLowerCase().includes(q)) {
        results.push({ code: c.code, type: "Key Concept", text: k.term + ": " + k.def, action: () => jumpToCourse(c.code) });
      }
    });
    // Search Q&A
    d.qa.forEach((item, i) => {
      if (item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)) {
        results.push({ code: c.code, type: "Q&A", text: item.q, action: () => { jumpToCourse(c.code); setTimeout(() => toggleQA(c.code, i), 200); } });
      }
    });
  });

  if (results.length === 0) {
    out.innerHTML = `<div class="search-empty">No results for "<strong>${escHtml(query)}</strong>"</div>`;
    return;
  }

  out.innerHTML = results.slice(0, 12).map((r, idx) => {
    const highlighted = highlightMatch(r.text.substring(0, 120), q);
    return `<div class="search-result-item" onclick="searchItems[${idx}].action(); toggleSearch()">
      <div class="sri-top">
        <span class="sri-course">${r.code}</span>
        <span class="sri-type">${r.type}</span>
      </div>
      <div class="sri-text">${highlighted}…</div>
    </div>`;
  }).join("");

  // Store actions so onclick can access them
  window.searchItems = results.slice(0, 12);
}

function highlightMatch(text, query) {
  const re = new RegExp(`(${escRegex(query)})`, "gi");
  return escHtml(text).replace(re, "<mark>$1</mark>");
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function escRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jumpToCourse(code) {
  activeCourse = code;
  renderCourseTabs();
  renderConfidenceRow();
  renderCourseContent();
  document.getElementById("courseContent").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Keyboard shortcut: Ctrl+K to open search, Esc to close
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); toggleSearch(); }
  if (e.key === "Escape" && searchVisible) toggleSearch();
});

// ─────────────────────────────────────────────────────────────────────────────
//  POMODORO TIMER (NEW)
// ─────────────────────────────────────────────────────────────────────────────
let timerVisible   = false;
let timerInterval  = null;
let timerMinutes   = 25;
let timerSeconds   = 0;
let timerRunning   = false;
let timerTotalSecs = 25 * 60;
let timerRemaining = 25 * 60;

function toggleTimer() {
  timerVisible = !timerVisible;
  const panel = document.getElementById("timerPanel");
  const btn   = document.getElementById("timerBtn");
  panel.style.display = timerVisible ? "block" : "none";
  btn.classList.toggle("active", timerVisible);
  // Hide checklist if open
  if (timerVisible) {
    document.getElementById("checklistPanel").style.display = "none";
  }
  updateTimerDisplay();
  updateSessionCount();
}

function setTimerMode(btn, mins) {
  document.querySelectorAll(".tmode").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  clearInterval(timerInterval);
  timerRunning   = false;
  timerMinutes   = mins;
  timerTotalSecs = mins * 60;
  timerRemaining = mins * 60;
  document.getElementById("timerStart").textContent = "▶ Start";
  document.getElementById("timerDisplay").className = "timer-display";
  updateTimerDisplay();
}

function startPause() {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    document.getElementById("timerStart").textContent = "▶ Resume";
    document.getElementById("timerDisplay").className = "timer-display";
  } else {
    timerRunning = true;
    document.getElementById("timerStart").textContent = "⏸ Pause";
    timerInterval = setInterval(() => {
      timerRemaining--;
      updateTimerDisplay();
      updateTimerColors();
      if (timerRemaining <= 0) {
        clearInterval(timerInterval);
        timerRunning = false;
        state.timerSessions++;
        saveState();
        updateSessionCount();
        showToast("🍅 Session complete! Take a break.");
        document.getElementById("timerStart").textContent = "▶ Start";
        document.getElementById("timerDisplay").className = "timer-display";
        timerRemaining = timerTotalSecs;
        updateTimerDisplay();
        // Browser notification if permitted
        if (Notification.permission === "granted") {
          new Notification("Study session complete!", { body: "Time for a break 🎉" });
        }
      }
    }, 1000);
    // Request notification permission
    if (Notification.permission === "default") Notification.requestPermission();
  }
}

function resetTimerClock() {
  clearInterval(timerInterval);
  timerRunning   = false;
  timerRemaining = timerTotalSecs;
  document.getElementById("timerStart").textContent = "▶ Start";
  document.getElementById("timerDisplay").className = "timer-display";
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const m = Math.floor(timerRemaining / 60);
  const s = timerRemaining % 60;
  document.getElementById("timerDisplay").textContent =
    String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function updateTimerColors() {
  const pct = timerRemaining / timerTotalSecs;
  const el  = document.getElementById("timerDisplay");
  if (!timerRunning) return;
  if (pct <= 0.1)      el.className = "timer-display urgent";
  else if (pct <= 0.25) el.className = "timer-display warning";
  else                  el.className = "timer-display running";
}

function updateSessionCount() {
  const n = state.timerSessions;
  document.getElementById("sessionCount").textContent =
    `🍅 ${n} session${n !== 1 ? "s" : ""} today`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  DAY CHECKLIST (NEW)
// ─────────────────────────────────────────────────────────────────────────────
let checklistVisible = false;

function toggleChecklist() {
  checklistVisible = !checklistVisible;
  const panel = document.getElementById("checklistPanel");
  panel.style.display = checklistVisible ? "block" : "none";
  if (checklistVisible) {
    // Hide timer if open
    document.getElementById("timerPanel").style.display = "none";
    timerVisible = false;
    document.getElementById("timerBtn").classList.remove("active");
    populateDaySelect();
    renderChecklist();
  }
}

function populateDaySelect() {
  const sel = document.getElementById("daySelect");
  if (sel.options.length > 0) return; // already populated
  phases.forEach(p => {
    p.schedule.forEach(s => {
      const opt = document.createElement("option");
      opt.value = `${p.name}||${s.day}`;
      opt.textContent = `${s.day} — ${p.name.replace("Phase ", "Ph").split(":")[0]}`;
      sel.appendChild(opt);
    });
  });
  // Default to today suggestion (day 1)
  sel.value = sel.options[0]?.value;
}

function renderChecklist() {
  const val = document.getElementById("daySelect").value;
  if (!val) return;
  const [phaseName, dayLabel] = val.split("||");
  const phase = phases.find(p => p.name === phaseName);
  const sched = phase?.schedule.find(s => s.day === dayLabel);
  if (!sched) return;

  const key = val; // use as checklist key
  if (!state.checklist[key]) {
    state.checklist[key] = {
      tasks: buildChecklistTasks(sched),
    };
    saveState();
  }

  const tasks = state.checklist[key].tasks;
  const done  = tasks.filter(t => t.done).length;
  document.getElementById("checklistProgress").textContent = `${done} / ${tasks.length}`;

  document.getElementById("checklistItems").innerHTML = tasks.map((t, i) =>
    `<div class="checklist-item${t.done ? " done" : ""}" id="cli-${i}">
      <input type="checkbox" id="chk-${i}" ${t.done ? "checked" : ""} onchange="toggleCheckItem('${key}',${i})"/>
      <label for="chk-${i}">${t.label}</label>
    </div>`).join("");
}

function buildChecklistTasks(sched) {
  const base = [
    { label: `📖 ${sched.task}`, done: false },
    { label: `⏱ Complete study block (${sched.hrs})`, done: false },
    { label: "📝 Take handwritten notes", done: false },
    { label: "🎯 Answer at least 3 Q&As from memory", done: false },
    { label: "⭐ Update your confidence rating", done: false },
  ];
  return base;
}

function toggleCheckItem(key, i) {
  if (!state.checklist[key]) return;
  state.checklist[key].tasks[i].done = !state.checklist[key].tasks[i].done;
  saveState();
  renderChecklist();
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXPORT PROGRESS (NEW)
// ─────────────────────────────────────────────────────────────────────────────
function exportProgress() {
  const lines = ["# 31-Day Exam Mastery Plan — Progress Report", `Generated: ${new Date().toLocaleString()}`, ""];
  courses.forEach(c => {
    const stats = qaStats(c.code);
    const conf  = state.confidence[c.code] || 0;
    lines.push(`## ${c.code}: ${c.name}`);
    lines.push(`Confidence: ${"★".repeat(conf)}${"☆".repeat(5-conf)} (${conf}/5)`);
    lines.push(`Q&As mastered: ${stats.known}/${stats.total} (${stats.total > 0 ? Math.round(stats.known/stats.total*100) : 0}%)`);
    lines.push(`Flagged for review: ${stats.review}`);
    // List review items
    const marks = state.qa[c.code] || {};
    const reviewItems = content[c.code].qa.filter((_, i) => marks[i] === "review");
    if (reviewItems.length > 0) {
      lines.push("Review list:");
      reviewItems.forEach(q => lines.push(`  - ${q.q}`));
    }
    lines.push("");
  });
  lines.push(`Total Pomodoro sessions: ${state.timerSessions}`);

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "exam-mastery-progress.txt";
  a.click();
  URL.revokeObjectURL(url);
  showToast("📥 Progress exported!");
}

// ─────────────────────────────────────────────────────────────────────────────
//  RESET
// ─────────────────────────────────────────────────────────────────────────────
function resetProgress() {
  if (!confirm("Reset all progress? This clears all Q&A marks, confidence ratings, and sessions. Cannot be undone.")) return;
  state = defaultState();
  saveState();
  renderOverview();
  renderConfidenceRow();
  renderCourseContent();
  updateSessionCount();
  showToast("Progress reset.");
}

// ─────────────────────────────────────────────────────────────────────────────
//  SET PHASE / COURSE
// ─────────────────────────────────────────────────────────────────────────────
function setPhase(i) {
  activePhase = i;
  renderPhaseTabs();
  renderPhaseBanner();
  renderProgress();
}

function setCourse(c) {
  activeCourse = c;
  renderCourseTabs();
  renderConfidenceRow();
  renderCourseContent();
}

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────
function init() {
  renderPhaseTabs();
  renderPhaseBanner();
  renderCourseTabs();
  renderProgress();
  renderCourseContent();
  renderConfidenceRow();
  renderOverview();
  // Restore overview visibility
  if (!state.overviewVisible) {
    document.getElementById("overviewBody").style.display = "none";
    document.querySelector(".ov-toggle").textContent = "Show";
  }
  updateSessionCount();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
