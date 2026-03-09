(function(){
  const STORAGE_KEY = 'ats_schedule_v1_demo';
  const ROTATION_START = new Date('2026-04-02T00:00:00');
  const CLEANERS = ['Ali','Caprea','Cappy','Laurie','Matt','Shannon','Shauna'];
  const CLIENTS = [
    'Ang RL','Arliene Eck','Barry','Becca and Jim','Catherine','Chris H.','Christopher','Cory W.','Deb B.','Elaine G.','Eveline','Jill','Joanne','Jodi','Julie Artist','Julie F.','Justine','Kelly','Kim C','Linda M.','Liz and Billy','Margaret','Mason','Michelle','Nancy A','Rose','Sharon','Sue P.','Wenda','Yvonne','Ziad','Terry','Melissa','Jess','Janet','Kimmie','Aegis Mcgee Solutions 1','Aegis Mcgee Solutions 2','HSA Chapman','HSA Walbert','Mindful Movements','RL Reppert'
  ];
  const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  let state = loadState();
  let viewOffset = 0; // 0=this week, 1=next week
  let modalDayIndex = null;

  const els = {
    weekBtns: Array.from(document.querySelectorAll('[data-week]')),
    metaView: document.getElementById('metaView'),
    metaStart: document.getElementById('metaStart'),
    metaRotation: document.getElementById('metaRotation'),
    dayGrid: document.getElementById('dayGrid'),
    modal: document.getElementById('dayModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalSubtitle: document.getElementById('modalSubtitle'),
    cleanerSelect: document.getElementById('cleanerSelect'),
    clientSelect: document.getElementById('clientSelect'),
    existingAssignments: document.getElementById('existingAssignments'),
    addBtn: document.getElementById('addAssignmentBtn'),
    clearDayBtn: document.getElementById('clearDayBtn'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    prevWeekBtn: document.getElementById('prevWeekBtn'),
    todayWeekBtn: document.getElementById('todayWeekBtn'),
    nextWeekBtn: document.getElementById('nextWeekBtn')
  };

  function startOfWeek(date){
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0,0,0,0);
    return d;
  }
  function addDays(date, days){ const d = new Date(date); d.setDate(d.getDate() + days); return d; }
  function formatDate(date){ return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(date); }
  function formatDateLong(date){ return new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(date); }
  function isoDate(date){ return date.toISOString().slice(0,10); }
  function rotationWeek(weekStart){
    const diffDays = Math.round((startOfWeek(weekStart) - startOfWeek(ROTATION_START)) / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);
    return ((diffWeeks % 4) + 4) % 4 + 1;
  }

  function getWeekStart(){ return addDays(startOfWeek(new Date()), viewOffset * 7); }
  function getWeekKey(){ return isoDate(getWeekStart()); }

  function baseWeekTemplate(){
    return DAY_NAMES.map((day, idx) => ({
      day,
      date: isoDate(addDays(getWeekStart(), idx)),
      items: []
    }));
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { weeks: {} };
    }catch(e){
      return { weeks: {} };
    }
  }
  function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function ensureWeek(){
    const key = getWeekKey();
    if (!state.weeks[key]) state.weeks[key] = baseWeekTemplate();
    saveState();
    return state.weeks[key];
  }

  function populateSelect(select, options, placeholder){
    select.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    select.appendChild(ph);
    options.forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v; select.appendChild(o);
    });
  }

  function render(){
    const weekStart = getWeekStart();
    const key = getWeekKey();
    const week = ensureWeek();
    els.metaView.textContent = viewOffset === 0 ? 'This Week' : (viewOffset === 1 ? 'Next Week' : `Week +${viewOffset}`);
    els.metaStart.textContent = formatDateLong(weekStart);
    els.metaRotation.textContent = `Week ${rotationWeek(weekStart)}`;
    els.weekBtns.forEach(btn => btn.classList.toggle('is-active', btn.dataset.week === (viewOffset === 0 ? 'this' : 'next')));
    els.dayGrid.innerHTML = '';
    week.forEach((dayObj, idx) => {
      const dateObj = new Date(dayObj.date + 'T00:00:00');
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'ats-day';
      card.innerHTML = `
        <div class="ats-day-head">
          <h3>${dayObj.day}</h3>
          <div class="ats-date-chip">${formatDate(dateObj)}</div>
        </div>
        <div class="ats-list">
          ${dayObj.items.length ? dayObj.items
            .slice().sort((a,b)=> a.cleaner.localeCompare(b.cleaner) || a.client.localeCompare(b.client))
            .map(item => `<div class="ats-item"><div class="top">${item.cleaner} — ${item.client}</div><div class="sub">Tap day to edit</div></div>`).join('')
            : '<div class="ats-empty">No assignments yet. Tap to add one.</div>'}
        </div>
        <div class="ats-hint">Tap to edit ${dayObj.day.toLowerCase()}.</div>`;
      card.addEventListener('click', ()=> openModal(idx));
      els.dayGrid.appendChild(card);
    });
  }

  function openModal(dayIndex){
    modalDayIndex = dayIndex;
    const week = ensureWeek();
    const dayObj = week[dayIndex];
    const dateObj = new Date(dayObj.date + 'T00:00:00');
    els.modalTitle.textContent = dayObj.day;
    els.modalSubtitle.textContent = `${viewOffset === 0 ? 'This Week' : 'Next Week'} • ${formatDateLong(dateObj)}`;
    populateSelect(els.cleanerSelect, CLEANERS, 'Choose cleaner');
    populateSelect(els.clientSelect, CLIENTS, 'Choose client');
    renderExisting(dayObj);
    els.modal.classList.add('open');
    els.modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(){
    els.modal.classList.remove('open');
    els.modal.setAttribute('aria-hidden', 'true');
    modalDayIndex = null;
  }

  function renderExisting(dayObj){
    els.existingAssignments.innerHTML = '';
    if (!dayObj.items.length){
      els.existingAssignments.innerHTML = '<div class="ats-empty">No assignments on this day yet.</div>';
      return;
    }
    dayObj.items.slice().sort((a,b)=> a.cleaner.localeCompare(b.cleaner) || a.client.localeCompare(b.client)).forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'ats-existing-row';
      const cleanerOptions = CLEANERS.map(name => `<option value="${name}" ${name === item.cleaner ? 'selected' : ''}>${name}</option>`).join('');
      row.innerHTML = `
        <div>
          <div class="ats-existing-name">${item.cleaner} — ${item.client}</div>
          <div class="ats-existing-sub">Adjust cleaner or remove this assignment.</div>
        </div>
        <div class="ats-inline-actions">
          <select data-role="reassign">${cleanerOptions}</select>
          <button class="ats-btn danger" type="button" data-role="remove">Remove</button>
        </div>`;
      row.querySelector('[data-role="reassign"]').addEventListener('change', (e)=> {
        item.cleaner = e.target.value;
        updateCurrentDay(dayObj);
      });
      row.querySelector('[data-role="remove"]').addEventListener('click', ()=> {
        const index = dayObj.items.indexOf(item);
        if (index > -1) dayObj.items.splice(index,1);
        updateCurrentDay(dayObj);
      });
      els.existingAssignments.appendChild(row);
    });
  }

  function updateCurrentDay(dayObj){
    const week = ensureWeek();
    week[modalDayIndex] = dayObj;
    saveState();
    renderExisting(dayObj);
    render();
  }

  els.addBtn.addEventListener('click', ()=> {
    if (modalDayIndex == null) return;
    const cleaner = els.cleanerSelect.value;
    const client = els.clientSelect.value;
    if (!cleaner || !client) return;
    const week = ensureWeek();
    const dayObj = week[modalDayIndex];
    dayObj.items.push({ cleaner, client });
    saveState();
    renderExisting(dayObj);
    render();
    els.cleanerSelect.value = '';
    els.clientSelect.value = '';
  });

  els.clearDayBtn.addEventListener('click', ()=> {
    if (modalDayIndex == null) return;
    const week = ensureWeek();
    week[modalDayIndex].items = [];
    saveState();
    renderExisting(week[modalDayIndex]);
    render();
  });
  els.closeModalBtn.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e)=> { if (e.target === els.modal) closeModal(); });
  document.addEventListener('keydown', (e)=> { if (e.key === 'Escape') closeModal(); });

  els.weekBtns.forEach(btn => btn.addEventListener('click', ()=> { viewOffset = btn.dataset.week === 'next' ? 1 : 0; render(); }));
  els.prevWeekBtn.addEventListener('click', ()=> { viewOffset -= 1; render(); });
  els.todayWeekBtn.addEventListener('click', ()=> { viewOffset = 0; render(); });
  els.nextWeekBtn.addEventListener('click', ()=> { viewOffset += 1; render(); });

  render();
})();
