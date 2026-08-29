/* PICKX Engine - 웹앱 프론트엔드
 * 문제 생성은 전부 서버(/api/generate -> engine.py)에서 처리한다.
 * 이 파일은 화면 전환/렌더링만 담당한다.
 */

const COLORS = {
  border: "#E8E9F0",
  text: "#171A2B",
  text2: "#70758A",
  bright: "#5145E5",
  primary: "#6657F4",
  light: "#A79BFA",
  success: "#48B96F",
};

const CIRCLED = ["①", "②", "③", "④", "⑤"];

const STEP_INFO = [
  ["Q1", "출제 여부"],
  ["Q2", "문항 선택"],
  ["Q3", "난이도 범위"],
  ["Q4", "출제"],
];

const MODES = [
  { key: "attendance", icon: "▦", name: "출석", en: "ATTENDANCE", enabled: false },
  { key: "math", icon: "ƒ(x)", name: "수학", en: "MATH", enabled: true },
  { key: "english", icon: "AB", name: "영어", en: "ENGLISH", enabled: false },
  { key: "people", icon: "◍", name: "사람", en: "PEOPLE", enabled: false },
];

const GENERATING_MESSAGES = [
  "출제 영역 분석 중...",
  "난이도 분석 중...",
  "문항 구조 생성 중...",
  "기출문제 유사도 분석 중...",
  "출제 예측률 계산 중...",
];

// ---- 상태 ----
const appData = { count: 1, difficulty: 2, problems: [] };
let history = [];
let current = null;
let pendingTimers = [];
let toastTimer = null;

function clearPending() {
  pendingTimers.forEach((id) => clearTimeout(id));
  pendingTimers = [];
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

// ---- 화면 전환 ----
const RENDERERS = {
  home: () => {},
  mode: renderModeGrid,
  wizard: (p) => renderWizard(p.step || 1),
  generating: renderGenerating,
  result: (p) => renderResult(p.tabIndex || 0),
  solution: (p) => renderSolution(p.tabIndex || 0),
};

function showScreen(name, params = {}, push = true) {
  clearPending();
  if (push && current) history.push(current);
  current = { name, params };
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById("screen-" + name).classList.add("active");
  RENDERERS[name](params);
  updateNavState();
}

function goBack() {
  if (!history.length) return;
  const prev = history.pop();
  showScreen(prev.name, prev.params, false);
}

function goHome() {
  history = [];
  showScreen("home", {}, false);
}

function updateNavState() {
  const busy = current && current.name === "generating";
  document.getElementById("btn-back").disabled = busy || history.length === 0;
  document.getElementById("btn-home").disabled = busy;
}

function showToast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---- 원형 게이지 (예측률 / 유사율) ----
function buildGaugeSVG(pct, color, size) {
  const r = size * 0.42;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${COLORS.border}" stroke-width="${size * 0.09}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${size * 0.09}"
        stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy - size * 0.02}" text-anchor="middle" fill="${COLORS.text}"
        font-size="${size * 0.22}" font-weight="800">${pct}</text>
      <text x="${cx}" y="${cy + size * 0.2}" text-anchor="middle" fill="${COLORS.text2}"
        font-size="${size * 0.09}" font-weight="700">%</text>
    </svg>`;
}

// ---- MODE SELECT ----
function renderModeGrid() {
  const grid = document.getElementById("mode-grid");
  grid.innerHTML = "";
  MODES.forEach((m) => {
    const card = document.createElement("div");
    card.className = "card mode-card" + (m.enabled ? " card-selected" : "");
    card.innerHTML = `
      <div class="mode-icon">${m.icon}</div>
      <div class="mode-name">${m.name}</div>
      <div class="mode-en">${m.en}</div>
      ${m.enabled ? '<div class="mode-check">✔</div>' : ""}`;
    card.onclick = () => {
      if (m.enabled) {
        showScreen("wizard", { step: 1 }, true);
      } else {
        showToast("현재 Demo에서는 수학 Mode만 지원합니다.");
      }
    };
    grid.appendChild(card);
  });
}

// ---- MATH WIZARD ----
function renderWizard(step) {
  const nav = document.getElementById("step-nav");
  nav.innerHTML = "";
  STEP_INFO.forEach(([code, label], idx) => {
    const i = idx + 1;
    const item = document.createElement("div");
    item.className = "step-item" + (i === step ? " current" : "") + (i <= step ? " clickable" : "");
    item.innerHTML = `<div class="step-code">${code}</div><div class="step-label">${label}</div>`;
    if (i <= step) item.onclick = () => showScreen("wizard", { step: i }, false);
    nav.appendChild(item);
    if (i < STEP_INFO.length) {
      const line = document.createElement("div");
      line.className = "step-line";
      nav.appendChild(line);
    }
  });

  const card = document.getElementById("question-card");
  const [code, label] = STEP_INFO[step - 1];
  card.innerHTML = `<div class="q-tag">${code} · ${label}</div><div class="q-body" id="q-body"></div><div class="btn-row" id="q-btns"></div>`;
  const body = document.getElementById("q-body");
  const btns = document.getElementById("q-btns");

  if (step === 1) {
    body.innerHTML = `<h2>27학년도 수능 수학 문제를 출제 할까요?</h2>`;
    btns.innerHTML = `<button class="btn btn-secondary" id="w-no">아니오</button><button class="btn btn-primary" id="w-yes">예</button>`;
    document.getElementById("w-no").onclick = () => showScreen("mode", {}, false);
    document.getElementById("w-yes").onclick = () => showScreen("wizard", { step: 2 }, false);
  } else if (step === 2) {
    body.innerHTML = `
      <h2>몇 문항을 제조할까요?</h2>
      <div class="stepper">
        <button id="w-minus">－</button>
        <input id="w-count" type="text" inputmode="numeric" value="${appData.count}">
        <button id="w-plus">＋</button>
        <span>문항</span>
      </div>
      <div class="q-error" id="w-error"></div>`;
    btns.innerHTML = `<button class="btn btn-secondary" id="w-prev">이전</button><button class="btn btn-primary" id="w-next">다음</button>`;
    const countInput = document.getElementById("w-count");
    document.getElementById("w-minus").onclick = () => {
      let v = Math.max(1, (parseInt(countInput.value, 10) || 1) - 1);
      countInput.value = v;
    };
    document.getElementById("w-plus").onclick = () => {
      let v = Math.max(1, (parseInt(countInput.value, 10) || 0) + 1);
      countInput.value = v;
    };
    document.getElementById("w-prev").onclick = () => showScreen("wizard", { step: 1 }, false);
    document.getElementById("w-next").onclick = () => {
      const raw = countInput.value.trim();
      const v = parseInt(raw, 10);
      if (!/^\d+$/.test(raw) || isNaN(v) || v < 1) {
        document.getElementById("w-error").textContent = "문항 수는 1 이상의 정수로 입력해 주세요.";
        return;
      }
      appData.count = v;
      showScreen("wizard", { step: 3 }, false);
    };
  } else if (step === 3) {
    body.innerHTML = `
      <h2>난이도의 범위를 정해주세요.</h2>
      <div class="diff-row" id="diff-row"></div>
      <div class="q-hint">난이도 3 이상은 학습영역의 결합문제 또는 주관식 문제로 출제될 수 있습니다.</div>`;
    const diffRow = document.getElementById("diff-row");
    for (let i = 1; i <= 4; i++) {
      const b = document.createElement("button");
      b.className = "diff-btn" + (appData.difficulty === i ? " selected" : "");
      b.textContent = i;
      b.onclick = () => {
        appData.difficulty = i;
        renderWizard(3);
      };
      diffRow.appendChild(b);
    }
    btns.innerHTML = `<button class="btn btn-secondary" id="w-prev">이전</button><button class="btn btn-primary" id="w-next">다음</button>`;
    document.getElementById("w-prev").onclick = () => showScreen("wizard", { step: 2 }, false);
    document.getElementById("w-next").onclick = () => showScreen("wizard", { step: 4 }, false);
  } else if (step === 4) {
    body.innerHTML = `<h2>문제 출제를 진행할까요?</h2>
      <p style="color:var(--text2);margin-top:12px;">문항 수 ${appData.count}개 · 난이도 ${appData.difficulty}단계</p>`;
    btns.innerHTML = `<button class="btn btn-secondary" id="w-no">아니오</button><button class="btn btn-primary" id="w-yes">예</button>`;
    document.getElementById("w-no").onclick = () => showScreen("wizard", { step: 3 }, false);
    document.getElementById("w-yes").onclick = () => showScreen("generating", {}, true);
  }
}

// ---- GENERATING (서버 /api/generate 호출, 최소 5초 연출 유지) ----
function renderGenerating() {
  const statusEl = document.getElementById("gen-status");
  const fillEl = document.getElementById("gen-progress-fill");
  statusEl.textContent = GENERATING_MESSAGES[0];
  fillEl.style.width = "0%";

  let idx = 0;
  const tick = () => {
    idx++;
    if (idx < GENERATING_MESSAGES.length) {
      statusEl.textContent = GENERATING_MESSAGES[idx];
      pendingTimers.push(setTimeout(tick, 1000));
    }
  };
  pendingTimers.push(setTimeout(tick, 1000));

  const totalMs = 5000;
  const steps = 50;
  const animate = (i = 0) => {
    fillEl.style.width = `${Math.min(100, (i / steps) * 100)}%`;
    if (i < steps) pendingTimers.push(setTimeout(() => animate(i + 1), totalMs / steps));
  };
  animate();

  const startedAt = Date.now();
  fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: appData.count, difficulty: appData.difficulty }),
  })
    .then(async (r) => ({ ok: r.ok, data: await r.json() }))
    .then(({ ok, data }) => {
      const wait = Math.max(0, 5000 - (Date.now() - startedAt));
      const tid = setTimeout(() => {
        if (!ok) {
          showToast(data.error || "문제 생성에 실패했습니다.");
          showScreen("wizard", { step: 4 }, false);
          return;
        }
        appData.problems = data.problems;
        showScreen("result", { tabIndex: 0 }, false);
      }, wait);
      pendingTimers.push(tid);
    })
    .catch(() => {
      showToast("서버와 연결할 수 없습니다.");
      showScreen("wizard", { step: 4 }, false);
    });
}

// ---- RESULT ----
function evalRow(num, title, value) {
  return `<div class="eval-row">
      ${num ? `<div class="eval-num">${num}</div>` : ""}
      <div class="eval-title">${escapeHtml(title)}</div>
      <div class="eval-value">${escapeHtml(value)}</div>
    </div>`;
}

function renderResult(tabIndex) {
  const problems = appData.problems;
  if (!problems || !problems.length) {
    document.getElementById("result-title").textContent = "생성된 문제가 없습니다.";
    document.getElementById("result-tabs").innerHTML = "";
    document.getElementById("result-problem").textContent = "";
    document.getElementById("result-choices").innerHTML = "";
    document.getElementById("result-eval").innerHTML = "";
    return;
  }
  tabIndex = Math.max(0, Math.min(tabIndex, problems.length - 1));
  const data = problems[tabIndex];

  document.getElementById("result-title").textContent = `문제 번호 ${tabIndex + 1}`;

  const predictPct = parseInt(data.predict_prob, 10);
  document.getElementById("result-gauge").innerHTML = buildGaugeSVG(predictPct, COLORS.bright, 150);
  document.getElementById("result-predict-desc").textContent =
    `27년 수학능력의 예측율은 ${predictPct}%입니다`;

  const tabBar = document.getElementById("result-tabs");
  tabBar.innerHTML = "";
  if (problems.length > 1) {
    problems.forEach((_, i) => {
      const b = document.createElement("button");
      b.className = "tab-btn" + (i === tabIndex ? " active" : "");
      b.textContent = `문제 ${i + 1}`;
      b.onclick = () => showScreen("result", { tabIndex: i }, false);
      tabBar.appendChild(b);
    });
  }

  document.getElementById("result-problem").textContent = data.problem;

  const choicesEl = document.getElementById("result-choices");
  choicesEl.innerHTML = "";
  data.choices.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "choice-row";
    row.innerHTML = `<span class="choice-num">${CIRCLED[i]}</span><span>${escapeHtml(c)}</span>`;
    choicesEl.appendChild(row);
  });

  document.getElementById("result-eval").innerHTML = `
    <h3>평가 항목</h3>
    ${evalRow("①", "출제 영역", data.area)}
    ${evalRow("②", "결합 영역", data.combo)}
    ${evalRow("③", "사용공식의 영역", data.formula_area)}
    ${evalRow("④", "사용된 공식", `${data.formula}\n\n미지수 개수: ${data.unknown_count}   조건분기 수: ${data.condition_branch}   차수: ${data.degree_count}`)}
    ${evalRow("⑤", "난이도와 연산지수", `난이도 ${data.difficulty}단계 · 연산지수 ${data.op_index}`)}
    ${evalRow("⑥", "기준 기출문제와의 유사도", data.similarity)}
    ${evalRow("⑦", "출제의도", data.intent)}
    <div class="eval-sep"></div>
    <h3>27학년도 출제 경향 예측</h3>
    ${evalRow("", "출제영역", data.trend_area)}
    ${evalRow("", "결합영역 내용", data.trend_combo)}
  `;

  document.getElementById("btn-solve").onclick = () => showScreen("solution", { tabIndex }, true);
}

// ---- SOLUTION ----
function renderSolution(tabIndex) {
  const data = appData.problems[tabIndex];
  const simPct = parseInt(data.similarity, 10);
  document.getElementById("sol-title").textContent = `문항번호 ${tabIndex + 1}`;
  document.getElementById("sol-text").textContent = data.solution;
  document.getElementById("sol-answer").textContent = `정답 : ${CIRCLED[data.answer - 1]}`;
  document.getElementById("sol-gauge").innerHTML = buildGaugeSVG(simPct, COLORS.success, 170);
  document.getElementById("sol-note").textContent = `문항번호 ${tabIndex + 1}에 대하여 기출과의 유사율은 ${simPct}%입니다`;
}

// ---- INIT ----
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("cta-card").onclick = () => showScreen("mode", {}, true);
  document.getElementById("btn-manual").onclick = () => document.getElementById("manual-modal").classList.add("show");
  document.getElementById("btn-manual-close").onclick = () => document.getElementById("manual-modal").classList.remove("show");
  document.getElementById("btn-back").onclick = goBack;
  document.getElementById("btn-home").onclick = goHome;

  current = { name: "home", params: {} };
  updateNavState();
});
