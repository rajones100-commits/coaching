const CONFIG = {
  sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS9TNj5LT4xQbMo_EQXt13u-YZzNaBQ9jZyhVsGffMmdvqjNG7PQKIvlnw00ptSZhwc9c5CNvoJn-xB/pub?output=csv",
  locale: 'en-GB',
  categoryName: 'Coaching'
};

let allEvents = [];
let currentView = 'today';

const el = id => document.getElementById(id);

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"' && quoted && next === '"') {
      field += '"';
      i++;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && next === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(x => String(x).trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some(x => String(x).trim() !== '')) rows.push(row);
  }

  return rows;
}

function parseUKDate(text, timeText = '00:00') {
  const match = String(text || '').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!match) return null;

  let day = Number(match[1]);
  let month = Number(match[2]) - 1;
  let year = Number(match[3]);
  if (year < 100) year += 2000;

  let hours = 0;
  let minutes = 0;
  const tm = String(timeText || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (tm) {
    hours = Number(tm[1]);
    minutes = Number(tm[2]);
  }

  const d = new Date(year, month, day, hours, minutes, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isTimeHeader(value) {
  return /^\d{1,2}:\d{2}$/.test(String(value || '').trim());
}

function convertGridToEvents(rows) {
  if (rows.length < 2) return [];

  const header = rows[0];
  const timeColumns = [];

  header.forEach((value, index) => {
    const time = String(value || '').trim();
    if (index > 0 && isTimeHeader(time)) {
      timeColumns.push({ index, time });
    }
  });

  const events = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const dateText = String(row[0] || '').trim();
    if (!dateText) continue;

    for (const slot of timeColumns) {
      const name = String(row[slot.index] || '').trim();
      if (!name) continue;

      const date = parseUKDate(dateText, slot.time);
      if (!date) continue;

      events.push({
        id: `${r}-${slot.index}`,
        date,
        title: name,
        category: CONFIG.categoryName,
        location: '',
        notes: '',
        startText: slot.time,
        endText: ''
      });
    }
  }

  return events.sort((a, b) => a.date - b.date);
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
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[ch]));
}

function formatTime(event) {
  return event.date.toLocaleTimeString(CONFIG.locale, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function populateCategories() {
  const select = el('categoryFilter');
  if (!select) return;

  select.innerHTML =
    '<option value="">All categories</option>' +
    `<option value="${CONFIG.categoryName}">${CONFIG.categoryName}</option>`;
}

function updateSummary() {
  const now = new Date();
  const today = startOfDay(now);
  const end7 = new Date(today);
  end7.setDate(end7.getDate() + 7);

  const upcoming = allEvents.filter(e => e.date >= today);

  el('todayCount').textContent =
    upcoming.filter(e => sameDay(e.date, today)).length;

  el('weekCount').textContent =
    upcoming.filter(e => e.date < end7).length;

  const next =
    allEvents.find(e => e.date >= now) ||
    upcoming[0];

  if (next) {
    el('nextTitle').textContent = next.title;
    el('nextWhen').textContent =
      `${next.date.toLocaleDateString(CONFIG.locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      })} • ${formatTime(next)}`;
  } else {
    el('nextTitle').textContent = 'Nothing scheduled';
    el('nextWhen').textContent = '—';
  }
}

function eventsForView() {
  const now = new Date();
  const today = startOfDay(now);
  let events = allEvents.filter(e => e.date >= today);

  if (currentView === 'today') {
    events = events.filter(e => sameDay(e.date, today));
  }

  if (currentView === 'week') {
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    events = events.filter(e => e.date < end);
  }

  if (currentView === 'month') {
    events = events.filter(e =>
      e.date.getMonth() === today.getMonth() &&
      e.date.getFullYear() === today.getFullYear()
    );
  }

  const search = el('searchInput')?.value.trim().toLowerCase() || '';
  if (search) {
    events = events.filter(e =>
      [e.title, e.category, e.location, e.notes]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }

  const category = el('categoryFilter')?.value || '';
  if (category) {
    events = events.filter(e => e.category === category);
  }

  return events;
}

function render() {
  const events = eventsForView();
  const list = el('calendarList');

  el('status').textContent = '';
  el('status').className = 'status';

  if (!events.length) {
    list.innerHTML =
      '<div class="empty">No coaching appointments found for this view.</div>';
    return;
  }

  const groups = new Map();

  events.forEach(event => {
    const key =
      `${event.date.getFullYear()}-${event.date.getMonth()}-${event.date.getDate()}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });

  list.innerHTML = [...groups.values()].map(dayEvents => {
    const d = dayEvents[0].date;

    const heading = d.toLocaleDateString(CONFIG.locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    return `
      <article class="day-group">
        <div class="day-heading">
          <h2>${escapeHtml(heading)}</h2>
          <span>${dayEvents.length} ${dayEvents.length === 1 ? 'booking' : 'bookings'}</span>
        </div>

        ${dayEvents.map(event => `
          <div class="event">
            <div class="event-time">${escapeHtml(formatTime(event))}</div>
            <div>
              <h3 class="event-title">${escapeHtml(event.title)}</h3>
              <p class="event-meta">Coaching appointment</p>
            </div>
            <span class="category">${escapeHtml(event.category)}</span>
          </div>
        `).join('')}
      </article>
    `;
  }).join('');
}

async function loadCalendar() {
  const status = el('status');

  status.textContent = 'Loading coaching calendar…';
  status.className = 'status';

  el('refreshBtn').disabled = true;

  try {
    const separator = CONFIG.sheetCsvUrl.includes('?') ? '&' : '?';
    const url = CONFIG.sheetCsvUrl + separator + 't=' + Date.now();

    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`Google Sheet returned HTTP ${response.status}`);
    }

    const text = await response.text();
    const rows = parseCSV(text);

    if (rows.length < 2) {
      throw new Error('The Google Sheet did not return any booking rows.');
    }

    allEvents = convertGridToEvents(rows);

    if (!allEvents.length) {
      throw new Error(
        'The sheet loaded, but no bookings were found. Row 1 must contain time slots such as 17:00 and 18:00.'
      );
    }

    populateCategories();
    updateSummary();
    render();

    el('lastUpdated').textContent =
      'Updated ' +
      new Date().toLocaleTimeString(CONFIG.locale, {
        hour: '2-digit',
        minute: '2-digit'
      });

  } catch (error) {
    console.error(error);

    status.className = 'status error';
    status.innerHTML = `
      <strong>Calendar could not load.</strong><br>
      ${escapeHtml(error.message)}
    `;

    el('calendarList').innerHTML = '';
  } finally {
    el('refreshBtn').disabled = false;
  }
}

document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab')
      .forEach(b => b.classList.remove('active'));

    button.classList.add('active');
    currentView = button.dataset.view;
    render();
  });
});

el('searchInput')?.addEventListener('input', render);
el('categoryFilter')?.addEventListener('change', render);
el('refreshBtn')?.addEventListener('click', loadCalendar);

const now = new Date();

el('todayLabel').textContent =
  now.toLocaleDateString(CONFIG.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

loadCalendar();
