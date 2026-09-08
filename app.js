const CONFIG = {
  sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS9TNj5LT4xQbMo_EQXt13u-YZzNaBQ9jZyhVsGffMmdvqjNG7PQKIvlnw00ptSZhwc9c5CNvoJn-xB/pub?output=csv",
  locale: 'en-GB',
  dateFormat: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  shortDateFormat: { weekday: 'short', day: 'numeric', month: 'short' }
};

let allEvents = [];
let currentView = 'today';

const el = id => document.getElementById(id);

function normaliseKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const aliases = {
  date: ['date', 'eventdate', 'appointmentdate', 'day'],
  start: ['starttime', 'time', 'start', 'appointmenttime'],
  end: ['endtime', 'finish', 'finishtime', 'end'],
  title: ['event', 'appointment', 'title', 'activity', 'description', 'name', 'eventname'],
  category: ['category', 'type', 'eventtype', 'group'],
  location: ['location', 'venue', 'place', 'where'],
  notes: ['notes', 'note', 'details', 'comments', 'comment']
};

function valueFor(row, field) {
  const map = Object.fromEntries(Object.entries(row).map(([k, v]) => [normaliseKey(k), v]));
  for (const alias of aliases[field]) {
    if (map[alias] !== undefined && String(map[alias]).trim() !== '') return String(map[alias]).trim();
  }
  return '';
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"' && quoted && next === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && next === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); if (row.some(x => x.trim() !== '')) rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
}

function parseDate(dateText, timeText = '') {
  if (!dateText) return null;
  const clean = String(dateText).trim();

  let y, m, d;
  const uk = clean.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  const iso = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (uk) {
    d = Number(uk[1]); m = Number(uk[2]) - 1; y = Number(uk[3]);
    if (y < 100) y += 2000;
  } else if (iso) {
    y = Number(iso[1]); m = Number(iso[2]) - 1; d = Number(iso[3]);
  } else {
    const fallback = new Date(clean);
    if (Number.isNaN(fallback.getTime())) return null;
    y = fallback.getFullYear(); m = fallback.getMonth(); d = fallback.getDate();
  }

  let hh = 0, mm = 0;
  if (timeText) {
    const t = String(timeText).trim().toLowerCase();
    const mt = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (mt) {
      hh = Number(mt[1]); mm = Number(mt[2] || 0);
      if (mt[3] === 'pm' && hh < 12) hh += 12;
      if (mt[3] === 'am' && hh === 12) hh = 0;
    }
  }
  const result = new Date(y, m, d, hh, mm);
  return Number.isNaN(result.getTime()) ? null : result;
}

function formatTime(text, dateObj) {
  if (!text) return 'All day';
  return dateObj.toLocaleTimeString(CONFIG.locale, { hour: '2-digit', minute: '2-digit' });
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[ch]));
}

function convertRows(rows) {
  return rows.map((row, i) => {
    const dateText = valueFor(row, 'date');
    const timeText = valueFor(row, 'start');
    const date = parseDate(dateText, timeText);
    if (!date) return null;
    return {
      id: i,
      date,
      dateText,
      startText: timeText,
      endText: valueFor(row, 'end'),
      title: valueFor(row, 'title') || 'Appointment',
      category: valueFor(row, 'category'),
      location: valueFor(row, 'location'),
      notes: valueFor(row, 'notes')
    };
  }).filter(Boolean).sort((a,b) => a.date - b.date);
}

function populateCategories() {
  const cats = [...new Set(allEvents.map(e => e.category).filter(Boolean))].sort();
  const select = el('categoryFilter');
  select.innerHTML = '<option value="">All categories</option>' +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

function updateSummary() {
  const now = new Date();
  const today = startOfDay(now);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);

  const upcoming = allEvents.filter(e => e.date >= today);
  el('todayCount').textContent = upcoming.filter(e => sameDay(e.date, today)).length;
  el('weekCount').textContent = upcoming.filter(e => e.date < in7).length;

  const next = allEvents.find(e => e.date >= now) || upcoming[0];
  if (next) {
    el('nextTitle').textContent = next.title;
    el('nextWhen').textContent =
      `${next.date.toLocaleDateString(CONFIG.locale, CONFIG.shortDateFormat)} • ${formatTime(next.startText, next.date)}`;
  } else {
    el('nextTitle').textContent = 'Nothing scheduled';
    el('nextWhen').textContent = '—';
  }
}

function eventsForView() {
  const now = new Date();
  const today = startOfDay(now);
  let events = allEvents.filter(e => e.date >= today);

  if (currentView === 'today') events = events.filter(e => sameDay(e.date, today));
  if (currentView === 'week') {
    const end = new Date(today); end.setDate(end.getDate() + 7);
    events = events.filter(e => e.date < end);
  }
  if (currentView === 'month') {
    events = events.filter(e =>
      e.date.getMonth() === today.getMonth() &&
      e.date.getFullYear() === today.getFullYear()
    );
  }

  const q = el('searchInput').value.trim().toLowerCase();
  const cat = el('categoryFilter').value;
  if (q) {
    events = events.filter(e =>
      [e.title, e.category, e.location, e.notes].join(' ').toLowerCase().includes(q)
    );
  }
  if (cat) events = events.filter(e => e.category === cat);

  return events;
}

function render() {
  const events = eventsForView();
  const list = el('calendarList');
  el('status').textContent = '';
  el('status').className = 'status';

  if (!events.length) {
    list.innerHTML = '<div class="empty">No appointments found for this view.</div>';
    return;
  }

  const groups = new Map();
  events.forEach(event => {
    const key = `${event.date.getFullYear()}-${event.date.getMonth()}-${event.date.getDate()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });

  list.innerHTML = [...groups.values()].map(dayEvents => {
    const d = dayEvents[0].date;
    const heading = d.toLocaleDateString(CONFIG.locale, CONFIG.dateFormat);
    return `
      <article class="day-group">
        <div class="day-heading">
          <h2>${escapeHtml(heading)}</h2>
          <span>${dayEvents.length} ${dayEvents.length === 1 ? 'appointment' : 'appointments'}</span>
        </div>
        ${dayEvents.map(event => `
          <div class="event">
            <div class="event-time">${escapeHtml(formatTime(event.startText, event.date))}</div>
            <div>
              <h3 class="event-title">${escapeHtml(event.title)}</h3>
              ${event.location ? `<p class="event-meta">📍 ${escapeHtml(event.location)}</p>` : ''}
              ${event.endText ? `<p class="event-meta">Ends: ${escapeHtml(event.endText)}</p>` : ''}
              ${event.notes ? `<p class="event-notes">${escapeHtml(event.notes)}</p>` : ''}
            </div>
            ${event.category ? `<span class="category">${escapeHtml(event.category)}</span>` : ''}
          </div>
        `).join('')}
      </article>
    `;
  }).join('');
}

async function loadCalendar() {
  const status = el('status');
  status.textContent = 'Loading calendar…';
  status.className = 'status';
  el('refreshBtn').disabled = true;

  try {
    const cacheBust = CONFIG.sheetCsvUrl + (CONFIG.sheetCsvUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
    const response = await fetch(cacheBust, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Google Sheet returned HTTP ${response.status}`);
    const text = await response.text();
    const rows = parseCSV(text);
    allEvents = convertRows(rows);

    if (!rows.length) throw new Error('No data rows were found in the published sheet.');

    populateCategories();
    updateSummary();
    render();
    el('lastUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString(CONFIG.locale, {hour:'2-digit', minute:'2-digit'});
  } catch (error) {
    console.error(error);
    status.className = 'status error';
    status.innerHTML = `
      <strong>Calendar could not load.</strong><br>
      Check that the Google Sheet is published to the web as CSV and that the first row contains column headings.<br>
      <small>${escapeHtml(error.message)}</small>
    `;
    el('calendarList').innerHTML = '';
  } finally {
    el('refreshBtn').disabled = false;
  }
}

document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    currentView = button.dataset.view;
    render();
  });
});

el('searchInput').addEventListener('input', render);
el('categoryFilter').addEventListener('change', render);
el('refreshBtn').addEventListener('click', loadCalendar);

const now = new Date();
el('todayLabel').textContent = now.toLocaleDateString(CONFIG.locale, CONFIG.dateFormat);
loadCalendar();
