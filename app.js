
// College Momentum 6 — merges v5 features with v3-stable behaviors
(function () {
  // ----- Utilities -----
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function isoToday() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ----- Storage keys (versioned to avoid old schema collisions) -----
  const K = {
    HABITS: 'cm6:habits:v1',
    TASKS:  'cm6:tasks:v1',
    NOTES:  'cm6:notes:v1',
    TIMER:  'cm6:timer:v1'
  };

  const Storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : (fallback ?? null);
      } catch {
        localStorage.removeItem(key);
        return fallback ?? null;
      }
    },
    set(key, val) {
      localStorage.setItem(key, JSON.stringify(val));
    }
  };

  // ----- Tabs / views -----
  function initTabs() {
    const tabs = $$('.tab');
    const views = $$('.view');
    function show(viewId) {
      views.forEach(v => v.hidden = v.id !== viewId);
      tabs.forEach(t => t.setAttribute('aria-selected', t.dataset.view === viewId ? 'true' : 'false'));
      if (viewId === 'todayView') renderToday();
    }
    tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.view)));
    show('todayView'); // default
  }

  // ----- Today (summary of tasks due today + habits streaks) -----
  function renderToday() {
    const box = $('#todaySummary');
    const tasks = Storage.get(K.TASKS, []);
    const today = isoToday();
    const dueToday = tasks.filter(t => t.date === today && !t.done);
    const habits = Storage.get(K.HABITS, []);
    const streaks = habits.map(h => ({ name: h.name, streak: calcStreak(h.days || []) }));

    box.innerHTML = `
      <div class="stack">
        <div class="card">
          <h3>Tasks due today</h3>
          ${dueToday.length ? dueToday.map(t => `<div class="task-row">
            <span class="task-title">${escapeHTML(t.title)}</span>
            <span class="task-date">Due: ${t.date || ''}</span>
            <button data-action="done-task" data-id="${t.id}">Mark done</button>
          </div>`).join('') : '<p>Nothing due today 🎉</p>'}
        </div>
        <div class="card">
          <h3>Habit streaks</h3>
          ${streaks.length ? streaks.map(s => `<div class="row"><strong>${escapeHTML(s.name)}</strong><span class="habit-streak">Streak: ${s.streak}</span></div>`).join('') : '<p>No habits yet. Add one in Habits.</p>'}
        </div>
      </div>
    `;

    box.addEventListener('click', (e) => {
      const id = e.target?.dataset?.id;
      if (e.target?.matches('[data-action="done-task"]') && id) {
        let tasks = Storage.get(K.TASKS, []);
        const t = tasks.find(x => x.id === id);
        if (t) t.done = true;
        Storage.set(K.TASKS, tasks);
        renderToday();
      }
    }, { once: true });
  }

  // ----- Planner (simple task list with optional dates) -----
  function initPlanner() {
    const form = $('#task-form');
    const title = $('#task-title');
    const date = $('#task-date');
    const list = $('#task-list');
    if (!form || !title || !list) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = title.value.trim();
      if (!t) return;
      const tasks = Storage.get(K.TASKS, []);
      tasks.push({ id: uid(), title: t, date: date.value || '', done: false });
      Storage.set(K.TASKS, tasks);
      title.value = '';
      date.value = '';
      renderTasks();
    });

    list.addEventListener('click', (e) => {
      const id = e.target.closest('[data-id]')?.dataset.id;
      if (!id) return;
      let tasks = Storage.get(K.TASKS, []);
      const t = tasks.find(x => x.id === id);
      if (!t) return;
      if (e.target.matches('[data-action="toggle"]')) t.done = !t.done;
      if (e.target.matches('[data-action="delete"]')) tasks = tasks.filter(x => x.id !== id);
      Storage.set(K.TASKS, tasks);
      renderTasks();
    });

    function renderTasks() {
      const tasks = Storage.get(K.TASKS, []);
      if (!tasks.length) { list.innerHTML = '<p>No tasks yet.</p>'; return; }
      list.innerHTML = tasks.map(t => `
        <div class="task-row" data-id="${t.id}">
          <span class="task-title">${t.done ? '✅ ' : ''}${escapeHTML(t.title)}</span>
          <span class="task-date">${t.date || ''}</span>
          <button data-action="toggle">${t.done ? 'Undo' : 'Done'}</button>
          <button data-action="delete">Delete</button>
        </div>
      `).join('');
    }

    renderTasks();
  }

  // ----- Habits (v3-stable behavior) -----
  function initHabits() {
    const form = $('#habit-form');
    const nameInput = $('#habit-name');
    const listEl = $('#habit-list');
    if (!form || !nameInput || !listEl) return;

    let habits = Storage.get(K.HABITS, []);
    if (!Array.isArray(habits)) habits = [];

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      habits.push({ id: uid(), name, days: [] });
      Storage.set(K.HABITS, habits);
      nameInput.value = '';
      render();
    });

    listEl.addEventListener('click', (e) => {
      const row = e.target.closest('[data-id]');
      if (!row) return;
      const id = row.dataset.id;
      const h = habits.find(x => x.id === id);
      if (!h) return;

      if (e.target.matches('[data-action="toggle"]')) {
        const today = isoToday();
        const i = h.days.indexOf(today);
        if (i >= 0) h.days.splice(i, 1); else h.days.push(today);
        Storage.set(K.HABITS, habits);
        render();
      }
      if (e.target.matches('[data-action="clear"]')) {
        h.days = [];
        Storage.set(K.HABITS, habits);
        render();
      }
      if (e.target.matches('[data-action="delete"]')) {
        habits = habits.filter(x => x.id !== id);
        Storage.set(K.HABITS, habits);
        render();
      }
    });

    function render() {
      habits = Storage.get(K.HABITS, []);
      if (!habits?.length) { listEl.innerHTML = '<p>No habits yet. Add one above.</p>'; return; }
      const today = isoToday();
      listEl.innerHTML = habits.map(h => {
        const done = h.days?.includes(today);
        const streak = calcStreak(h.days || []);
        return `
          <div class="habit-row" data-id="${h.id}">
            <span class="habit-name">${escapeHTML(h.name)}</span>
            <span class="habit-streak">Streak: ${streak}</span>
            <button data-action="toggle">${done ? 'Uncheck' : 'Done today'}</button>
            <button data-action="clear">Clear</button>
            <button data-action="delete">Delete</button>
          </div>
        `;
      }).join('');
    }

    render();
  }

  function calcStreak(days) {
    const set = new Set(days || []);
    let streak = 0;
    const d = new Date();
    for (;;) {
      const iso = d.toISOString().slice(0,10);
      if (set.has(iso)) { streak++; d.setDate(d.getDate()-1); }
      else break;
    }
    return streak;
  }

  // ----- Focus Timer (Pomodoro-style) -----
  function initTimer() {
    const disp = $('#timer-display');
    const startBtn = $('#start-timer');
    const pauseBtn = $('#pause-timer');
    const resetBtn = $('#reset-timer');
    const workM = $('#work-mins');
    const breakM = $('#break-mins');

    if (!disp || !startBtn) return;

    let state = Storage.get(K.TIMER, { mode:'work', secs: 25*60, work:25, brk:5, running:false });
    let tick = null;

    function fmt(secs) {
      const m = Math.floor(secs/60).toString().padStart(2,'0');
      const s = (secs%60).toString().padStart(2,'0');
      return `${m}:${s}`;
    }

    function render() {
      disp.textContent = fmt(state.secs);
      workM.value = state.work;
      breakM.value = state.brk;
    }

    function loop() {
      if (!state.running) return;
      state.secs -= 1;
      if (state.secs <= 0) {
        if (state.mode === 'work') {
          state.mode = 'break';
          state.secs = state.brk * 60;
        } else {
          state.mode = 'work';
          state.secs = state.work * 60;
        }
        notify(`Time for ${state.mode}!`);
      }
      Storage.set(K.TIMER, state);
      render();
      tick = setTimeout(loop, 1000);
    }

    startBtn.addEventListener('click', () => {
      state.running = true;
      Storage.set(K.TIMER, state);
      if (!tick) loop();
    });

    pauseBtn.addEventListener('click', () => {
      state.running = false;
      Storage.set(K.TIMER, state);
      if (tick) { clearTimeout(tick); tick = null; }
    });

    resetBtn.addEventListener('click', () => {
      state.running = false;
      state.mode = 'work';
      state.secs = state.work * 60;
      Storage.set(K.TIMER, state);
      if (tick) { clearTimeout(tick); tick = null; }
      render();
    });

    workM.addEventListener('change', () => {
      const v = Math.max(1, parseInt(workM.value || '25', 10));
      state.work = v;
      if (state.mode === 'work') state.secs = v*60;
      Storage.set(K.TIMER, state);
      render();
    });
    breakM.addEventListener('change', () => {
      const v = Math.max(1, parseInt(breakM.value || '5', 10));
      state.brk = v;
      if (state.mode === 'break') state.secs = v*60;
      Storage.set(K.TIMER, state);
      render();
    });

    function notify(msg) {
      try {
        if (Notification?.permission === 'granted') new Notification(msg);
        else if (Notification && Notification.permission !== 'denied') Notification.requestPermission();
      } catch {}
    }

    render();
    if (state.running) loop();
  }

  // ----- Notes -----
  function initNotes() {
    const area = $('#notes-area');
    const btn = $('#save-notes');
    const status = $('#notes-status');
    if (!area || !btn) return;
    area.value = Storage.get(K.NOTES, '') || '';
    btn.addEventListener('click', () => {
      Storage.set(K.NOTES, area.value);
      status.textContent = 'Saved';
      setTimeout(() => status.textContent = '', 1200);
    });
  }

  function uid() {
    if (crypto?.getRandomValues) {
      const a = new Uint32Array(4); crypto.getRandomValues(a);
      return Array.from(a, n => n.toString(16)).join('');
    }
    return 'id-' + Math.random().toString(16).slice(2);
  }

  // ----- Service worker -----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }

  // ----- Init -----
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initPlanner();
    initHabits();
    initTimer();
    initNotes();
  });
})();
