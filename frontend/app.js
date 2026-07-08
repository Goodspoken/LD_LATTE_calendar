// ============================================================
// State Management
// ============================================================
const state = {
    apiUrl: localStorage.getItem('calendar_api_url') || 'http://localhost:8000',
    currentDate: new Date(),        // FIX: was hardcoded to 2026-07-08
    currentView: 'month',           // 'month' | 'week' | 'agenda'
    theme: localStorage.getItem('calendar_theme') || 'dark',
    meetings: [],
    selectedMeeting: null,
    editingMeeting: null,           // Meeting currently being edited (null = create mode)
    filterParticipant: ''           // Participant name filter string
};

// Russian month names
const MONTHS_RU = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

// DOM elements cache
const DOM = {
    btnNewMeeting:          document.getElementById('btn-new-meeting'),
    btnPrev:                document.getElementById('btn-prev'),
    btnNext:                document.getElementById('btn-next'),
    btnToday:               document.getElementById('btn-today'),
    currentDateLabel:       document.getElementById('current-date-label'),
    apiStatus:              document.getElementById('api-status'),

    // Views
    monthView:              document.getElementById('month-view'),
    weekView:               document.getElementById('week-view'),
    agendaView:             document.getElementById('agenda-view'),
    navItems:               document.querySelectorAll('.nav-item'),

    // Grids
    monthDaysGrid:          document.getElementById('month-days-grid'),
    weekColumnsContainer:   document.getElementById('week-columns-container'),
    agendaList:             document.getElementById('agenda-list'),

    // Create/Edit Modal
    modalCreate:            document.getElementById('modal-create'),
    modalCreateTitle:       document.getElementById('modal-create-title'),
    formCreateMeeting:      document.getElementById('form-create-meeting'),
    btnCloseCreate:         document.getElementById('btn-close-create'),
    btnCancelCreate:        document.getElementById('btn-cancel-create'),
    inputDate:              document.getElementById('input-date'),
    inputStartTime:         document.getElementById('input-start-time'),
    inputEndTime:           document.getElementById('input-end-time'),

    // Details Modal
    modalDetails:           document.getElementById('modal-details'),
    btnCloseDetails:        document.getElementById('btn-close-details'),
    detailTitle:            document.getElementById('detail-title'),
    detailTime:             document.getElementById('detail-time'),
    detailParticipants:     document.getElementById('detail-participants'),
    detailDescription:      document.getElementById('detail-description'),
    btnDeleteMeeting:       document.getElementById('btn-delete-meeting'),
    btnEditMeeting:         document.getElementById('btn-edit-meeting'),
    commentsList:           document.getElementById('comments-list'),
    formAddComment:         document.getElementById('form-add-comment'),
    commentAuthor:          document.getElementById('comment-author'),
    commentText:            document.getElementById('comment-text'),

    // Settings
    toggleSettings:         document.getElementById('toggle-settings'),
    settingsContent:        document.getElementById('settings-content'),
    apiUrlInput:            document.getElementById('api-url-input'),
    btnSaveSettings:        document.getElementById('btn-save-settings'),

    // Toasts & Stats
    toastContainer:         document.getElementById('toast-container'),
    statMeetingsToday:      document.getElementById('stat-meetings-today'),
    statTotalPeople:        document.getElementById('stat-total-people'),

    // Theme & Filter
    themeBtns:              document.querySelectorAll('.theme-btn'),
    participantFilter:      document.getElementById('participant-filter'),
    btnClearFilter:         document.getElementById('btn-clear-filter'),
};

// ============================================================
// Initialize Application
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(state.theme);
    initEventListeners();
    DOM.apiUrlInput.value = state.apiUrl;
    checkApiStatus();
    render();
    fetchTodayStats(); // Stats are independent of current calendar view
});

// ============================================================
// Event Listeners
// ============================================================
function initEventListeners() {
    // Navigation
    DOM.btnPrev.addEventListener('click', () => navigateDate(-1));
    DOM.btnNext.addEventListener('click', () => navigateDate(1));
    DOM.btnToday.addEventListener('click', () => {
        state.currentDate = new Date(); // FIX: was hardcoded date
        render();
    });

    // View Switching
    DOM.navItems.forEach(item => {
        item.addEventListener('click', () => {
            DOM.navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            state.currentView = item.dataset.view;
            render();
        });
    });

    // Open Create Modal
    DOM.btnNewMeeting.addEventListener('click', () => openCreateModal());

    const closeCreateModal = () => {
        DOM.modalCreate.classList.add('id-hidden');
        DOM.formCreateMeeting.reset();
        state.editingMeeting = null;
        // Reset modal title and button back to create mode
        if (DOM.modalCreateTitle) DOM.modalCreateTitle.innerHTML = '<i class="fa-solid fa-circle-plus"></i> Запланировать встречу';
        const submitSpan = DOM.formCreateMeeting.querySelector('button[type="submit"] span');
        if (submitSpan) submitSpan.innerText = 'Забронировать';
    };
    DOM.btnCloseCreate.addEventListener('click', closeCreateModal);
    DOM.btnCancelCreate.addEventListener('click', closeCreateModal);

    // Form Submit: Create or Edit Meeting
    DOM.formCreateMeeting.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title        = document.getElementById('input-title').value.trim();
        const dateStr      = DOM.inputDate.value;
        const startTimeStr = DOM.inputStartTime.value;
        const endTimeStr   = DOM.inputEndTime.value;
        const participantsRaw = document.getElementById('input-participants').value;
        const description  = document.getElementById('input-description').value.trim();

        // FIX: Client-side validation — end must be after start (same-day meetings only for simplicity)
        if (endTimeStr <= startTimeStr) {
            showToast("Ошибка ввода", "Время окончания должно быть позже времени начала", "error");
            return;
        }

        const participants = participantsRaw.split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0);

        if (participants.length === 0) {
            showToast("Ошибка ввода", "Укажите хотя бы одного участника", "error");
            return;
        }

        const start_time = `${dateStr}T${startTimeStr}:00`;
        const end_time   = `${dateStr}T${endTimeStr}:00`;

        const submitBtn = DOM.formCreateMeeting.querySelector('button[type="submit"]');
        const submitSpan = submitBtn.querySelector('span');
        submitBtn.disabled = true;
        submitSpan.innerText = state.editingMeeting ? "Сохранение..." : "Бронирование...";

        try {
            const isEdit = !!state.editingMeeting;
            const url    = isEdit ? `/api/meetings/${state.editingMeeting.id}` : '/api/meetings';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await apiFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description: description || null, start_time, end_time, participants })
            });

            if (res.status === 201 || res.status === 200) {
                showToast("Успех!", isEdit ? "Встреча успешно обновлена" : "Встреча успешно запланирована", "success");
                closeCreateModal();
                await fetchAndRenderMeetings();
                await fetchTodayStats();
            } else if (res.status === 409) {
                const errorData = await res.json();
                showToast("Конфликт бронирования!", errorData.detail.message || "Один из участников уже занят.", "error", errorData.detail.conflicts || []);
            } else {
                const errorData = await res.json();
                const msg = errorData.detail || "Произошла неизвестная ошибка";
                showToast("Ошибка", typeof msg === 'string' ? msg : JSON.stringify(msg), "error");
            }
        } catch (err) {
            console.error(err);
            showToast("Ошибка соединения", "Не удалось связаться с сервером бэкенда", "error");
        } finally {
            submitBtn.disabled = false;
            submitSpan.innerText = state.editingMeeting ? "Сохранить" : "Забронировать";
        }
    });

    // Details Modal: Close
    const closeDetailsModal = () => {
        DOM.modalDetails.classList.add('id-hidden');
        state.selectedMeeting = null;
        DOM.formAddComment.reset();
    };
    DOM.btnCloseDetails.addEventListener('click', closeDetailsModal);

    // Details Modal: Edit button — pre-fill create form with existing data
    DOM.btnEditMeeting.addEventListener('click', () => {
        if (!state.selectedMeeting) return;
        const meeting = state.selectedMeeting;
        closeDetailsModal();
        openCreateModal(meeting);
    });

    // Details Modal: Delete
    DOM.btnDeleteMeeting.addEventListener('click', async () => {
        if (!state.selectedMeeting) return;
        if (!confirm(`Вы уверены, что хотите отменить встречу "${state.selectedMeeting.title}"?`)) return;

        try {
            const res = await apiFetch(`/api/meetings/${state.selectedMeeting.id}`, { method: 'DELETE' });
            if (res.status === 204) {
                showToast("Отменено", "Встреча успешно удалена", "success");
                closeDetailsModal();
                await fetchAndRenderMeetings();
                await fetchTodayStats();
            } else {
                showToast("Ошибка удаления", "Не удалось отменить встречу", "error");
            }
        } catch (err) {
            showToast("Ошибка соединения", "Нет связи с сервером", "error");
        }
    });

    // Add Comment
    DOM.formAddComment.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.selectedMeeting) return;

        const author = DOM.commentAuthor.value.trim();
        const text   = DOM.commentText.value.trim();

        try {
            const res = await apiFetch(`/api/meetings/${state.selectedMeeting.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ author, text })
            });
            if (res.status === 201) {
                DOM.commentText.value = '';
                await loadComments(state.selectedMeeting.id);
            } else {
                showToast("Ошибка", "Не удалось отправить комментарий", "error");
            }
        } catch (err) {
            showToast("Ошибка соединения", "Нет связи с сервером", "error");
        }
    });

    // Settings Panel Toggle
    DOM.toggleSettings.addEventListener('click', () => {
        DOM.toggleSettings.classList.toggle('open');
        DOM.settingsContent.classList.toggle('id-hidden');
    });

    DOM.btnSaveSettings.addEventListener('click', () => {
        let val = DOM.apiUrlInput.value.trim().replace(/\/$/, '');
        state.apiUrl = val;
        localStorage.setItem('calendar_api_url', val);
        showToast("Настройки сохранены", `API: ${val}`, "success");
        checkApiStatus();
        fetchAndRenderMeetings();
    });

    // Theme Selector
    DOM.themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            state.theme = btn.dataset.theme;
            localStorage.setItem('calendar_theme', btn.dataset.theme);
            applyTheme(btn.dataset.theme);
        });
    });

    // Participant Filter
    if (DOM.participantFilter) {
        DOM.participantFilter.addEventListener('input', () => {
            state.filterParticipant = DOM.participantFilter.value.trim().toLowerCase();
            renderCurrentView();
        });
    }
    if (DOM.btnClearFilter) {
        DOM.btnClearFilter.addEventListener('click', () => {
            state.filterParticipant = '';
            if (DOM.participantFilter) DOM.participantFilter.value = '';
            renderCurrentView();
        });
    }
}

// ============================================================
// Theme
// ============================================================
function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    DOM.themeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.theme === theme));
}

// ============================================================
// Open Create/Edit Modal
// ============================================================
function openCreateModal(meetingToEdit = null) {
    state.editingMeeting = meetingToEdit;

    if (meetingToEdit) {
        // ── Edit mode ──
        if (DOM.modalCreateTitle) {
            DOM.modalCreateTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Изменить встречу';
        }
        const startDt = new Date(meetingToEdit.start_time);
        const endDt   = new Date(meetingToEdit.end_time);

        const yyyy = startDt.getFullYear();
        const mm   = String(startDt.getMonth() + 1).padStart(2, '0');
        const dd   = String(startDt.getDate()).padStart(2, '0');

        document.getElementById('input-title').value       = meetingToEdit.title;
        DOM.inputDate.value                                = `${yyyy}-${mm}-${dd}`;
        DOM.inputStartTime.value = `${String(startDt.getHours()).padStart(2,'0')}:${String(startDt.getMinutes()).padStart(2,'0')}`;
        DOM.inputEndTime.value   = `${String(endDt.getHours()).padStart(2,'0')}:${String(endDt.getMinutes()).padStart(2,'0')}`;
        document.getElementById('input-participants').value = meetingToEdit.participants.join(', ');
        document.getElementById('input-description').value  = meetingToEdit.description || '';

        const submitSpan = DOM.formCreateMeeting.querySelector('button[type="submit"] span');
        if (submitSpan) submitSpan.innerText = 'Сохранить';
    } else {
        // ── Create mode ──
        if (DOM.modalCreateTitle) {
            DOM.modalCreateTitle.innerHTML = '<i class="fa-solid fa-circle-plus"></i> Запланировать встречу';
        }
        const now = state.currentDate;
        DOM.inputDate.value      = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        DOM.inputStartTime.value = "10:00";
        DOM.inputEndTime.value   = "11:00";

        const submitSpan = DOM.formCreateMeeting.querySelector('button[type="submit"] span');
        if (submitSpan) submitSpan.innerText = 'Забронировать';
    }

    DOM.modalCreate.classList.remove('id-hidden');
}

// ============================================================
// API Helper
// ============================================================
async function apiFetch(path, options = {}) {
    return fetch(`${state.apiUrl}${path}`, options);
}

// ============================================================
// API Status
// ============================================================
async function checkApiStatus() {
    DOM.apiStatus.className = "api-status-badge offline";
    DOM.apiStatus.querySelector('.status-text').innerText = "Проверка...";
    try {
        const res = await apiFetch('/api/meetings?limit=1');
        if (res.ok) {
            DOM.apiStatus.className = "api-status-badge online";
            DOM.apiStatus.querySelector('.status-text').innerText = "Онлайн";
        } else {
            throw new Error();
        }
    } catch {
        DOM.apiStatus.className = "api-status-badge offline";
        DOM.apiStatus.querySelector('.status-text').innerText = "Офлайн";
    }
}

// ============================================================
// Date Navigation
// ============================================================
function navigateDate(direction) {
    if (state.currentView === 'month') {
        state.currentDate.setMonth(state.currentDate.getMonth() + direction);
    } else if (state.currentView === 'week') {
        state.currentDate.setDate(state.currentDate.getDate() + direction * 7);
    } else {
        state.currentDate.setDate(state.currentDate.getDate() + direction);
    }
    render();
}

// ============================================================
// Primary Render Router
// ============================================================
async function render() {
    updateHeaderLabel();

    DOM.monthView.classList.add('id-hidden');
    DOM.weekView.classList.add('id-hidden');
    DOM.agendaView.classList.add('id-hidden');

    if (state.currentView === 'month')       DOM.monthView.classList.remove('id-hidden');
    else if (state.currentView === 'week')   DOM.weekView.classList.remove('id-hidden');
    else if (state.currentView === 'agenda') DOM.agendaView.classList.remove('id-hidden');

    await fetchAndRenderMeetings();
}

function renderCurrentView() {
    if (state.currentView === 'month')       renderMonthView();
    else if (state.currentView === 'week')   renderWeekView();
    else if (state.currentView === 'agenda') renderAgendaView();
}

// ============================================================
// Header Label
// ============================================================
function updateHeaderLabel() {
    const year = state.currentDate.getFullYear();
    if (state.currentView === 'month') {
        DOM.currentDateLabel.innerText = `${MONTHS_RU[state.currentDate.getMonth()]} ${year}`;
    } else if (state.currentView === 'week') {
        const weekdays = getWeekDays(state.currentDate);
        const start = weekdays[0], end = weekdays[6];
        let startStr = `${start.getDate()} ${MONTHS_RU[start.getMonth()].substring(0,3).toLowerCase()}`;
        let endStr   = `${end.getDate()} ${MONTHS_RU[end.getMonth()].substring(0,3).toLowerCase()}`;
        if (start.getFullYear() !== end.getFullYear()) {
            startStr += ` ${start.getFullYear()}`;
            endStr   += ` ${end.getFullYear()}`;
        } else if (start.getMonth() === end.getMonth()) {
            startStr = String(start.getDate());
        }
        DOM.currentDateLabel.innerText = `${startStr} — ${endStr} ${year}`;
    } else {
        DOM.currentDateLabel.innerText = state.currentDate.toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }
}

// ============================================================
// Fetch Meetings (view-range scoped)
// ============================================================
async function fetchAndRenderMeetings() {
    let startStr = '', endStr = '';

    if (state.currentView === 'month') {
        const year = state.currentDate.getFullYear(), month = state.currentDate.getMonth();
        startStr = new Date(year, month, -7).toISOString().split('T')[0] + "T00:00:00";
        endStr   = new Date(year, month + 1, 14).toISOString().split('T')[0] + "T23:59:59";
    } else if (state.currentView === 'week') {
        const weekdays = getWeekDays(state.currentDate);
        startStr = weekdays[0].toISOString().split('T')[0] + "T00:00:00";
        endStr   = weekdays[6].toISOString().split('T')[0] + "T23:59:59";
    } else {
        const end = new Date(state.currentDate);
        end.setDate(end.getDate() + 30);
        startStr = state.currentDate.toISOString().split('T')[0] + "T00:00:00";
        endStr   = end.toISOString().split('T')[0] + "T23:59:59";
    }

    try {
        const res = await apiFetch(`/api/meetings?start=${startStr}&end=${endStr}`);
        if (res.ok) state.meetings = await res.json();
    } catch (e) {
        console.error("Failed to load meetings", e);
        state.meetings = [];
    }

    renderCurrentView();
}

// ============================================================
// FIX: Stats fetched independently for REAL today — not based on current view
// ============================================================
async function fetchTodayStats() {
    const today    = new Date(); // Real today
    const todayStr = today.toISOString().split('T')[0];
    try {
        const res = await apiFetch(`/api/meetings?start=${todayStr}T00:00:00&end=${todayStr}T23:59:59`);
        if (res.ok) {
            const todayMeetings = await res.json();
            DOM.statMeetingsToday.innerText = todayMeetings.length;
            const participants = new Set();
            todayMeetings.forEach(m => m.participants.forEach(p => participants.add(p.toLowerCase())));
            DOM.statTotalPeople.innerText = participants.size;
        }
    } catch {
        // Fail silently — stats remain as last value
    }
}

// ============================================================
// Participant Filter
// ============================================================
function getFilteredMeetings() {
    if (!state.filterParticipant) return state.meetings;
    return state.meetings.filter(m =>
        m.participants.some(p => p.toLowerCase().includes(state.filterParticipant))
    );
}

// ============================================================
// Month View
// ============================================================
function renderMonthView() {
    DOM.monthDaysGrid.innerHTML = '';
    const days = getMonthDays(state.currentDate);
    const filtered = getFilteredMeetings();
    const systemToday = new Date(); // FIX: Real today

    days.forEach(dayInfo => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        if (!dayInfo.isCurrentMonth) {
            dayDiv.classList.add(dayInfo.date.getMonth() < state.currentDate.getMonth() ? 'prev-month' : 'next-month');
        }
        if (isSameDay(dayInfo.date, systemToday)) dayDiv.classList.add('today');

        const header = document.createElement('div');
        header.className = 'day-header';
        const numSpan = document.createElement('span');
        numSpan.className = 'day-number';
        numSpan.innerText = dayInfo.date.getDate();
        header.appendChild(numSpan);
        dayDiv.appendChild(header);

        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'day-events';

        filtered
            .filter(m => isSameDay(new Date(m.start_time), dayInfo.date))
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .forEach(meeting => {
                const pill = document.createElement('div');
                pill.className = 'event-pill';
                const timeStr = new Date(meeting.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                // FIX: textContent prevents XSS from meeting titles
                pill.textContent = `${timeStr} ${meeting.title}`;
                pill.title = `${meeting.title}\nУчастники: ${meeting.participants.join(', ')}`;
                pill.addEventListener('click', e => { e.stopPropagation(); openDetailsModal(meeting); });
                eventsContainer.appendChild(pill);
            });

        dayDiv.appendChild(eventsContainer);

        dayDiv.addEventListener('click', () => {
            const yyyy = dayInfo.date.getFullYear();
            const mm   = String(dayInfo.date.getMonth() + 1).padStart(2, '0');
            const dd   = String(dayInfo.date.getDate()).padStart(2, '0');
            DOM.inputDate.value = `${yyyy}-${mm}-${dd}`;
            openCreateModal();
        });

        DOM.monthDaysGrid.appendChild(dayDiv);
    });
}

// ============================================================
// Week View
// ============================================================
function renderWeekView() {
    DOM.weekColumnsContainer.innerHTML = '';
    const weekdays = getWeekDays(state.currentDate);
    const systemToday = new Date(); // FIX: Real today
    const filtered = getFilteredMeetings();

    const headers = DOM.weekView.querySelectorAll('.weekday-header');
    weekdays.forEach((day, i) => {
        headers[i].querySelector('.date-num').innerText = day.getDate();
        headers[i].style.color = isSameDay(day, systemToday) ? 'var(--primary)' : '';
    });

    weekdays.forEach(day => {
        const column = document.createElement('div');
        column.className = 'week-column';
        if (isSameDay(day, systemToday)) column.classList.add('today');

        const dayMeetings = filtered
            .filter(m => isSameDay(new Date(m.start_time), day))
            .sort((a, b) => a.start_time.localeCompare(b.start_time));

        if (dayMeetings.length === 0) {
            column.innerHTML = '<div style="margin:auto;color:var(--text-muted);font-size:11px;text-align:center;">Нет встреч</div>';
        } else {
            dayMeetings.forEach(meeting => {
                const card = document.createElement('div');
                card.className = 'event-card';

                const tStart = new Date(meeting.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                const tEnd   = new Date(meeting.end_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

                // FIX: Build via DOM, not innerHTML, to prevent XSS from user-supplied meeting titles
                const titleEl = document.createElement('div');
                titleEl.className = 'event-card-title';
                titleEl.textContent = meeting.title; // XSS-safe

                const timeEl = document.createElement('div');
                timeEl.className = 'event-card-time';
                timeEl.innerHTML = `<i class="fa-regular fa-clock"></i> `;
                timeEl.appendChild(document.createTextNode(`${tStart} - ${tEnd}`));

                const participantsEl = document.createElement('div');
                participantsEl.className = 'event-card-participants';
                meeting.participants.slice(0, 3).forEach(p => {
                    const tag = document.createElement('span');
                    tag.className = 'p-tag';
                    tag.textContent = p; // XSS-safe
                    participantsEl.appendChild(tag);
                });
                if (meeting.participants.length > 3) {
                    const tag = document.createElement('span');
                    tag.className = 'p-tag';
                    tag.textContent = `+${meeting.participants.length - 3}`;
                    participantsEl.appendChild(tag);
                }

                card.appendChild(titleEl);
                card.appendChild(timeEl);
                card.appendChild(participantsEl);
                card.addEventListener('click', () => openDetailsModal(meeting));
                column.appendChild(card);
            });
        }

        DOM.weekColumnsContainer.appendChild(column);
    });
}

// ============================================================
// Agenda View
// ============================================================
function renderAgendaView() {
    DOM.agendaList.innerHTML = '';
    const filtered = getFilteredMeetings();

    if (filtered.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'no-meetings-placeholder';
        placeholder.innerHTML = '<i class="fa-regular fa-calendar-xmark"></i>';
        const p = document.createElement('p');
        // FIX: textContent for user-supplied filter string to prevent XSS
        p.textContent = state.filterParticipant
            ? `Нет встреч с участием «${state.filterParticipant}»`
            : 'Нет запланированных встреч на ближайшие 30 дней.';
        placeholder.appendChild(p);
        DOM.agendaList.appendChild(placeholder);
        return;
    }

    const groups = {};
    filtered.forEach(meeting => {
        const key = new Date(meeting.start_time).toDateString();
        if (!groups[key]) groups[key] = { date: new Date(meeting.start_time), items: [] };
        groups[key].items.push(meeting);
    });

    Object.keys(groups).sort((a, b) => new Date(a) - new Date(b)).forEach(key => {
        const group = groups[key];
        const groupDiv = document.createElement('div');
        groupDiv.className = 'agenda-day-group';

        const divider = document.createElement('div');
        divider.className = 'agenda-date-divider';
        divider.innerText = group.date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
        groupDiv.appendChild(divider);

        group.items.sort((a, b) => a.start_time.localeCompare(b.start_time));

        group.items.forEach(meeting => {
            const tStart = new Date(meeting.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const tEnd   = new Date(meeting.end_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            const item = document.createElement('div');
            item.className = 'agenda-item';

            // FIX: Build via DOM to avoid XSS from meeting titles / participant names
            const leftDiv = document.createElement('div');
            leftDiv.className = 'agenda-item-left';

            const titleEl = document.createElement('div');
            titleEl.className = 'agenda-item-title';
            titleEl.textContent = meeting.title; // XSS-safe

            const metaEl = document.createElement('div');
            metaEl.className = 'agenda-item-meta';
            const pSpan = document.createElement('span');
            pSpan.innerHTML = '<i class="fa-regular fa-user"></i> ';
            pSpan.appendChild(document.createTextNode(meeting.participants.join(', ')));
            metaEl.appendChild(pSpan);

            leftDiv.appendChild(titleEl);
            leftDiv.appendChild(metaEl);

            const rightDiv = document.createElement('div');
            rightDiv.className = 'agenda-item-right';
            const timeEl = document.createElement('div');
            timeEl.className = 'agenda-item-time';
            timeEl.textContent = `${tStart} — ${tEnd}`;
            rightDiv.appendChild(timeEl);

            item.appendChild(leftDiv);
            item.appendChild(rightDiv);
            item.addEventListener('click', () => openDetailsModal(meeting));
            groupDiv.appendChild(item);
        });

        DOM.agendaList.appendChild(groupDiv);
    });
}

// ============================================================
// Meeting Details Modal
// ============================================================
async function openDetailsModal(meeting) {
    state.selectedMeeting = meeting;

    // FIX: Use textContent for title to prevent XSS
    DOM.detailTitle.textContent = meeting.title;

    const startObj  = new Date(meeting.start_time);
    const endObj    = new Date(meeting.end_time);
    const dateLabel = startObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const tStart    = startObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const tEnd      = endObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    DOM.detailTime.innerHTML = `<i class="fa-regular fa-clock"></i> `;
    DOM.detailTime.appendChild(document.createTextNode(`${dateLabel}, ${tStart} — ${tEnd}`));

    DOM.detailDescription.textContent = meeting.description || "Описание отсутствует"; // XSS-safe

    DOM.detailParticipants.innerHTML = '';
    meeting.participants.forEach(p => {
        const chip = document.createElement('span');
        chip.className = 'chip-participant';
        chip.innerHTML = '<i class="fa-solid fa-user-tag"></i> ';
        chip.appendChild(document.createTextNode(p)); // XSS-safe
        DOM.detailParticipants.appendChild(chip);
    });

    DOM.commentsList.innerHTML = '<div class="no-comments">Загрузка комментариев...</div>';
    DOM.modalDetails.classList.remove('id-hidden');

    await loadComments(meeting.id);
}

// ============================================================
// Comments (fully XSS-safe via DOM manipulation)
// ============================================================
async function loadComments(meetingId) {
    try {
        const res = await apiFetch(`/api/meetings/${meetingId}/comments`);
        if (!res.ok) throw new Error();

        const comments = await res.json();
        DOM.commentsList.innerHTML = '';

        if (comments.length === 0) {
            DOM.commentsList.innerHTML = '<div class="no-comments">Комментариев пока нет. Напишите первый!</div>';
            return;
        }

        comments.forEach(c => {
            const commentDiv = document.createElement('div');
            commentDiv.className = 'comment-item';

            const timeStr = new Date(c.created_at).toLocaleString('ru-RU', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            });

            const metaDiv = document.createElement('div');
            metaDiv.className = 'comment-meta';

            const authorSpan = document.createElement('span');
            authorSpan.className = 'comment-author';
            authorSpan.textContent = c.author; // FIX: textContent — XSS-safe

            const timeSpan = document.createElement('span');
            timeSpan.className = 'comment-time';
            timeSpan.textContent = timeStr;

            metaDiv.appendChild(authorSpan);
            metaDiv.appendChild(timeSpan);

            const textDiv = document.createElement('div');
            textDiv.className = 'comment-text';
            textDiv.textContent = c.text; // FIX: textContent — XSS-safe

            commentDiv.appendChild(metaDiv);
            commentDiv.appendChild(textDiv);
            DOM.commentsList.appendChild(commentDiv);
        });

        DOM.commentsList.scrollTop = DOM.commentsList.scrollHeight;
    } catch {
        DOM.commentsList.innerHTML = '<div class="no-comments" style="color:var(--danger);">Не удалось загрузить комментарии.</div>';
    }
}

// ============================================================
// Toast Notifications
// ============================================================
function showToast(title, message, type = 'success', conflicts = []) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconClass = type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check';

    // Build conflict list safely
    let conflictsHtml = '';
    if (conflicts && conflicts.length > 0) {
        conflictsHtml = `<div style="margin-top:8px;">
            ${conflicts.map(c => `
                <div class="conflict-item">
                    <strong>${escapeHtml(c.participant)}</strong> занят(а) в "${escapeHtml(c.conflicting_meeting.title)}"
                    (${escapeHtml(new Date(c.conflicting_meeting.start_time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))}
                    - ${escapeHtml(new Date(c.conflicting_meeting.end_time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))})
                </div>`).join('')}
        </div>`;
    }

    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${iconClass}"></i></div>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(title)}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
            ${conflictsHtml}
        </div>
        <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 200);
    });

    DOM.toastContainer.appendChild(toast);

    const timeout = type === 'success' ? 4000 : 8000;
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 200);
        }
    }, timeout);
}

// ============================================================
// Utility Helpers
// ============================================================

/** Compare two Date objects by calendar day (ignores time). */
function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth()    === d2.getMonth()    &&
           d1.getDate()     === d2.getDate();
}

/** Returns array of 7 Date objects for the week containing `date` (Mon–Sun). */
function getWeekDays(date) {
    const temp = new Date(date);
    const day  = temp.getDay();
    const diff = temp.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(temp.setDate(diff));

    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        return d;
    });
}

/** Returns array of day objects {date, isCurrentMonth} for a month grid (35 or 42 cells). */
function getMonthDays(date) {
    const year = date.getFullYear(), month = date.getMonth();

    const firstDayIndex   = new Date(year, month, 1).getDay();
    const startOffset     = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const lastDate        = new Date(year, month + 1, 0).getDate();
    const prevMonthLast   = new Date(year, month, 0).getDate();

    const days = [];

    for (let i = startOffset - 1; i >= 0; i--) {
        days.push({ date: new Date(year, month - 1, prevMonthLast - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= lastDate; i++) {
        days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    const totalCells = days.length > 35 ? 42 : 35;
    for (let i = 1; i <= totalCells - days.length; i++) {
        days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return days;
}

/**
 * Escape HTML special characters to prevent XSS when inserting into innerHTML.
 * Always prefer textContent where possible; use this only for mixed HTML+data contexts.
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
