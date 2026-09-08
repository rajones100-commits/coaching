const CONFIG = {
  googlePublishedId: '2PACX-1vS9TNj5LT4xQbMo_EQXt13u-YZzNaBQ9jZyhVsGffMmdvqjNG7PQKIvlnw00ptSZhwc9c5CNvoJn-xB',
  sheetGid: '0',
  locale: 'en-GB',
  categoryName: 'Coaching'
};

let allEvents = [];
let currentView = 'today';

const el = id => document.getElementById(id);

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

function cellValue(cell) {
  if (!cell) return '';
  if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
  if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
  return '';
}

function convertGoogleTableToEvents(table) {
  if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) return [];

  // Google Visualization often treats first spreadsheet row as headers/labels.
  // Use column labels when available, otherwise inspect first returned row.
  const headers = table.cols.map(col => String(col.label || '').trim());

  const timeColumns = [];
  headers.forEach((label, index) => {
    if (index > 0 && /^\d{1,2}:\d{2}$/.test(label)) {
      timeColumns.push({ index, time: label });
    }
  });

  // Fallback in case Google didn't promote row 1 to labels.
  let rows = table.rows;
  if (!timeColumns.length && rows.length) {
    const first = rows[0].c || [];
    first.forEach((cell, index) => {
      const value = cellValue(cell);
      if (index > 0 && /^\d{1,2}:\d{2}$/.test(value)) {
        timeColumns.push({ index, time: value });
      }
    });
    if (timeColumns.length) rows = rows.slice(1);
  }

  const events = [];

  rows.forEach((row, rowIndex) => {
    const cells = row.c || [];
    const dateText = cellValue(cells[0]);
    if (!dateText) return;

    timeColumns.forEach(slot => {
      const name = cellValue(cells[slot.index]);
      if (!name) return;

      const date = parseUKDate(dateText, slot.time);
      if (!date) return;

      events.push({
        id: `${rowIndex}-${slot.index}`,
        date,
        title: name,
        category: CONFIG.categoryName,
        location: '',
        notes: '',
        startText: slot.time
      });
    });
  });

  return events.sort((a, b) => a.date - b.date);
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

  const next = allEvents.find(e => e.date >= now) || upcoming[0];

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
      [e.title, e.category].join(' ').toLowerCase().includes(search)
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

function showError(message) {
  const status = el('status');
  status.className = 'status error';
  status.innerHTML = `<strong>Calendar could not load.</strong><br>${escapeHtml(message)}`;
  el('calendarList').innerHTML = '';
  el('refreshBtn').disabled = false;
}

window.handleGoogleSheetResponse = function(response) {
  try {
    if (!response || response.status === 'error') {
      const detail = response?.errors?.[0]?.detailed_message ||
                     response?.errors?.[0]?.message ||
                     'Google returned an error.';
      throw new Error(detail);
    }

    allEvents = convertGoogleTableToEvents(response.table);

    if (!allEvents.length) {
      throw new Error(
        'Google loaded the sheet, but no bookings were recognised. Check that row 1 has times such as 17:00 and 18:00.'
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

    el('refreshBtn').disabled = false;
  } catch (error) {
    console.error(error);
    showError(error.message);
  }
};

function loadCalendar() {
  const status = el('status');
  status.textContent = 'Loading coaching calendar…';
  status.className = 'status';
  el('refreshBtn').disabled = true;

  // Remove any previous JSONP script before refreshing.
  const old = document.getElementById('google-sheet-loader');
  if (old) old.remove();

  const callback = 'handleGoogleSheetResponse';
  const url =
    `https://docs.google.com/spreadsheets/d/e/${CONFIG.googlePublishedId}/gviz/tq` +
    `?gid=${encodeURIComponent(CONFIG.sheetGid)}` +
    `&tqx=responseHandler:${callback}` +
    `&t=${Date.now()}`;

  const script = document.createElement('script');
  script.id = 'google-sheet-loader';
  script.src = url;
  script.async = true;

  script.onerror = () => {
    showError(
      'The Google Sheet feed could not be reached. Make sure the sheet is still published to the web.'
    );
  };

  document.head.appendChild(script);
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
