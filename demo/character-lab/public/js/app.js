/**
 * Maya Memory Trial — Frontend App (v2)
 */

const state = { characterState: null, isProcessing: false, eventCount: 0 };


function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/x27/g, "&#39;");
}
async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

// ═══════ 初始化 ═══════

async function init() {
  showLoading(true);
  const [stateRes, eventsRes] = await Promise.all([api('/state'), api('/events')]);
  if (stateRes.ok) { state.characterState = stateRes.state; renderState(stateRes.state); }
  if (eventsRes.ok) renderEventGrid(eventsRes.events);
  bindEvents();
  showLoading(false);
}

function bindEvents() {
  document.getElementById('btn-reset').addEventListener('click', handleReset);
  document.querySelectorAll('.section-title.clickable').forEach(el => {
    el.addEventListener('click', () => {
      const body = document.getElementById(el.dataset.target);
      if (body) { body.classList.toggle('hidden'); const ch = el.querySelector('.chevron'); if (ch) ch.style.transform = body.classList.contains('hidden') ? '' : 'rotate(180deg)'; }
    });
  });
}

// ═══════ 推荐试玩路径 ═══════

const DEMO_PATHS = {
  positive: ['check_in', 'complete_task', 'rest'],      // 然后用户自己点 late_arrival
  negative: ['ignore_message', 'criticize', 'make_demand'], // 然后用户自己点 late_arrival
};

async function runDemoPath(type) {
  if (state.isProcessing) return;
  const events = DEMO_PATHS[type];
  if (!events) return;

  state.isProcessing = true;
  const container = document.getElementById('demo-paths');
  container.classList.add('demo-path-running');
  document.querySelectorAll('.event-btn-highlight').forEach(el => el.classList.remove('event-btn-highlight'));

  try {
    await api('/reset', { method: 'POST' });
    state.eventCount = 0;

    for (let i = 0; i < events.length; i++) {
      const res = await api('/event', { method: 'POST', body: { eventId: events[i] } });
      if (res.ok) {
        state.characterState = res.state;
        state.eventCount++;
        renderState(res.state);
        renderResponseAndBT(res);
        renderExplanation(res.explanation);
        renderMemoryTimeline(res.memory);
        document.getElementById('narrative-text').textContent = res.state.narrative;
        await new Promise(r => setTimeout(r, 400));
      }
    }

    const lateBtn = document.querySelector('[data-id="late_arrival"]');
    if (lateBtn) {
      lateBtn.classList.add('event-btn-highlight');
      lateBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } finally {
    state.isProcessing = false;
    container.classList.remove('demo-path-running');
  }
}

// ═══════ 事件池 ═══════

function renderEventGrid(events) {
  document.getElementById('event-grid').innerHTML = events.map(e =>
    `<button class="event-btn" data-id="${e.id}" onclick="handleEvent('${e.id}')">
       <span class="event-btn-label">${escapeHtml(e.label)}</span>
       <span class="event-btn-desc">${escapeHtml(e.description)}</span>
     </button>`
  ).join('');
}

async function handleEvent(eventId) {
  if (state.isProcessing) return;
  // 移除推荐路径的高亮
  document.querySelectorAll('.event-btn-highlight').forEach(el => el.classList.remove('event-btn-highlight'));
  state.isProcessing = true;
  try {
    const res = await api('/event', { method: 'POST', body: { eventId } });
    if (!res.ok) return;
    state.characterState = res.state;
    state.eventCount++;

    renderState(res.state);
    renderResponseAndBT(res);   // 合并回复+行为树对比为一个整体
    renderExplanation(res.explanation);
    renderMemoryTimeline(res.memory);

    document.getElementById('narrative-text').textContent = res.state.narrative;
  } catch (e) { console.error(e); }
  finally { state.isProcessing = false; }
}

// ═══════ 重置 ═══════

async function handleReset() {
  const res = await api('/reset', { method: 'POST' });
  if (res.ok) {
    state.characterState = res.state;
    state.eventCount = 0;
    renderState(res.state);
    document.querySelectorAll('.event-btn-highlight').forEach(el => el.classList.remove('event-btn-highlight'));
    document.getElementById('response-box').innerHTML = '<div class="response-placeholder">点击上方事件，看看 Maya 会怎么反应。</div>';
    document.getElementById('narrative-text').textContent = '—';
    document.getElementById('explanation-section').classList.add('hidden');
    document.getElementById('memory-timeline').innerHTML = '<div class="memory-empty">暂无记忆</div>';
  }
}

// ═══════ 渲染：角色状态 ═══════

function renderState(s) {
  document.getElementById('mood-text').textContent = s.mood;
  document.getElementById('mood-emoji').textContent = moodEmoji(s.mood);
  document.getElementById('core-meters').innerHTML = meters([
    { label: '信任', value: s.trust, color: 'var(--green)' },
    { label: '压力', value: s.stress, color: stressColor(s.stress) },
    { label: '精力', value: s.energy, color: 'var(--yellow)' },
    { label: '亲密', value: s.closeness, color: 'var(--pink)' },
    { label: '安全感', value: 100 - s.safetyNeed, color: 'var(--blue)' },
  ]);
  document.getElementById('needs-meters').innerHTML = meters([
    { label: '饱腹', value: s.needs.hunger, color: 'var(--yellow)' },
    { label: '精力', value: s.needs.energy, color: 'var(--green)' },
    { label: '社交', value: s.needs.social, color: 'var(--pink)' },
    { label: '舒适', value: s.needs.comfort, color: 'var(--blue)' },
    { label: '刺激', value: s.needs.stimulation, color: 'var(--purple)' },
  ], true);
  document.getElementById('emotion-tags').innerHTML = s.dominantEmotions.map(e =>
    `<span class="emotion-tag">${escapeHtml(e.name)} <span class="tag-value">${escapeHtml(e.value)}</span></span>`
  ).join('');
  document.getElementById('trait-bars').innerHTML = [
    { k: 'openness', c: 'O' }, { k: 'conscientiousness', c: 'C' },
    { k: 'extraversion', c: 'E' }, { k: 'agreeableness', c: 'A' }, { k: 'neuroticism', c: 'N' },
  ].map(t => `<div class="trait-bar"><span class="trait-name">${t.c}</span><div class="trait-track"><div class="trait-fill" style="width:${s.personality[t.k]}%"></div></div><span class="trait-val">${s.personality[t.k]}</span></div>`).join('');
}

function meters(arr, small) {
  return arr.map(m => `<div class="meter"><div class="meter-header"><span class="meter-label">${m.label}</span><span class="meter-value">${Math.round(m.value)}</span></div><div class="meter-bar"><div class="meter-fill" style="width:${Math.max(0, Math.min(100, m.value))}%;background:${m.color}"></div></div></div>`).join('');
}

// ═══════ 渲染：回复 + 行为树对比（合并为一个视觉整体）═══════

function renderResponseAndBT(r) {
  // 情绪变化摘要
  const trustDelta = r.explanation.factors.find(f => f.text.includes('信任'));
  const summary = trustDelta ? trustDelta.text : '';

  document.getElementById('response-box').innerHTML =
    `<div class="response-event-label"><span class="label-dot"></span>你${escapeHtml(r.eventLabel)}</div>

     <div class="bt-hero">
       <div class="bt-hero-row">
         <div class="bt-hero-engine">
           <div class="bt-hero-tag"><span class="bt-dot engine-dot"></span>Andy Engine</div>
           <div class="bt-hero-quote fade-in">"${escapeHtml(r.response)}"</div>
         </div>
         <div class="bt-hero-tree">
           <div class="bt-hero-tag"><span class="bt-dot tree-dot"></span>行为树</div>
           <div class="bt-hero-quote bt-hero-muted">"${r.btResponse}"</div>
         </div>
       </div>
       <div class="bt-hero-diff">${buildDiffText(r)}</div>
     </div>`;
}

function buildDiffText(r) {
  const factors = r.explanation.factors;
  const hasMemory = factors.some(f => f.type === 'memory');
  const hasPersonality = factors.some(f => f.type === 'personality');
  const hasState = factors.some(f => f.type === 'state');

  let diff = '行为树只看当前事件→条件分支。';
  if (hasState) diff += ' 但当前状态（信任、压力）改变了事件的感知方式。';
  if (hasMemory) diff += ' 让她想起过去经历。';
  if (hasPersonality) diff += ' 人格让同样的事产生不同理解。';
  if (!hasMemory && !hasPersonality && !hasState) diff = '行为树只看当前事件→条件分支。Andy Engine 的状态层让同一个输入产生不同输出。';
  return diff;
}

// ═══════ 渲染：因果解释 ★ ═══════

function renderExplanation(expl) {
  const sec = document.getElementById('explanation-section');
  const box = document.getElementById('explanation-box');
  sec.classList.remove('hidden');

  const icon = { state: '📊', memory: '🧠', personality: '🧬', emotion: '💫' };
  const label = { state: '状态', memory: '记忆', personality: '人格', emotion: '情绪' };

  const factors = expl.factors.map(f =>
    `<div class="expl-factor"><span class="expl-icon">${icon[f.type] || '•'}</span><span class="expl-label">${label[f.type] || f.type}</span><span class="expl-text">${escapeHtml(f.text)}</span></div>`
  ).join('');

  box.innerHTML = `
    <div class="expl-factors">${factors || '<div class="expl-factor"><span class="expl-text">当前状态比较平稳，没有特别的因素被激活。</span></div>'}</div>
    <div class="expl-conclusion">${escapeHtml(expl.conclusion)}</div>
  `;
}

// ═══════ 渲染：记忆 ═══════

function renderMemoryTimeline(memories) {
  const el = document.getElementById('memory-timeline');
  if (!memories || memories.length === 0) { el.innerHTML = '<div class="memory-empty">暂无记忆</div>'; return; }
  el.innerHTML = memories.map(m =>
    `<div class="memory-item fade-in">
       <div class="memory-indicator ${m.emotionTag || 'neutral'}"></div>
       <div class="memory-content">
         <div class="memory-text">${escapeHtml(m.content)}</div>
         <div class="memory-meta"><span>${m.emotionTag === 'happy' ? '积极' : m.emotionTag === 'sad' ? '消极' : '中性'}</span><span>重要性 ${m.importance}%</span></div>
       </div>
     </div>`
  ).join('');
}

// ═══════ 工具 ═══════

function moodEmoji(m) { return { '开心':'😊','还不错':'🙂','平静':'😐','有些低落':'😔','难过':'😢','焦虑':'😰','崩溃边缘':'😭' }[m] || '😐'; }
function stressColor(s) { return s < 30 ? 'var(--green)' : s < 60 ? 'var(--yellow)' : s < 80 ? 'var(--orange)' : 'var(--red)'; }
function showLoading(v) { document.getElementById('loading').classList.toggle('hidden', !v); }

document.addEventListener('DOMContentLoaded', init);
