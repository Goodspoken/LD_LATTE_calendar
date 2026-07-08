// State Management
const state = {
    apiUrl: localStorage.getItem('calendar_api_url') || 'http://localhost:8000',
    currentDate: new Date(2026, 6, 8), // Start at July 8, 2026 (as per system date current context)
    currentView: 'month', // 'month' | 'week' | 'agenda'
    theme: localStorage.getItem('calendar_theme') || 'dark',
    meetings: [],
    selectedMeeting: null
};

// Russian month names
const MONTHS_RU = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

// DOM elements
const DOM = {
    btnNewMeeting: document.getElementById('btn-new-meeting'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    btnToday: document.getElementById('btn-today'),
    currentDateLabel: document.getElementById('current-date-label'),
    apiStatus: document.getElementById('api-status'),
    
    // Views
    monthView: document.getElementById('month-view'),
    weekView: document.getElementById('week-view'),
    agendaView: document.getElementById('agenda-view'),
    
    // View Switchers
    navItems: document.querySelectorAll('.nav-item'),
    
    // Grids & Containers
    monthDaysGrid: document.getElementById('month-days-grid'),
    weekColumnsContainer: document.getElementById('week-columns-container'),
    agendaList: document.getElementById('agenda-list'),
    
    // Create Modal
    modalCreate: document.getElementById('modal-create'),
    formCreateMeeting: document.getElementById('form-create-meeting'),
    btnCloseCreate: document.getElementById('btn-close-create'),
    btnCancelCreate: document.getElementById('btn-cancel-create'),
    inputDate: document.getElementById('input-date'),
    inputStartTime: document.getElementById('input-start-time'),
    inputEndTime: document.getElementById('input-end-time'),
    
    // Details Modal
    modalDetails: document.getElementById('modal-details'),
    btnCloseDetails: document.getElementById('btn-close-details'),
    detailTitle: document.getElementById('detail-title'),
    detailTime: document.getElementById('detail-time'),
    detailParticipants: document.getElementById('detail-participants'),
    detailDescription: document.getElementById('detail-description'),
    btnDeleteMeeting: document.getElementById('btn-delete-meeting'),
    commentsList: document.getElementById('comments-list'),
    formAddComment: document.getElementById('form-add-comment'),
    commentAuthor: document.getElementById('comment-author'),
    commentText: document.getElementById('comment-text'),
    
    // Settings
    toggleSettings: document.getElementById('toggle-settings'),
    settingsContent: document.getElementById('settings-content'),
    apiUrlInput: document.getElementById('api-url-input'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    
    // Toasts
    toastContainer: document.getElementById('toast-container'),
    
    // Stats
    statMeetingsToday: document.getElementById('stat-meetings-today'),
    statTotalPeople: document.getElementById('stat-total-people'),
    
    // Theme Selector
    themeBtns: document.querySelectorAll('.theme-btn')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(state.theme);
    initEventListeners();
    DOM.apiUrlInput.value = state.apiUrl;
    checkApiStatus();
    render();
});

// Event Listeners setup
function initEventListeners() {
    // Navigation
    DOM.btnPrev.addEventListener('click', () => navigateDate(-1));
    DOM.btnNext.addEventListener('click', () => navigateDate(1));
    DOM.btnToday.addEventListener('click', () => {
        state.currentDate = new Date(2026, 6, 8); // System today (July 8, 2026)
        render();
    });

    // View Switching
    DOM.navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            DOM.navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            state.currentView = item.dataset.view;
            render();
        });
    });

    // Modal Control: Create
    DOM.btnNewMeeting.addEventListener('click', () => {
        // Set default date in form to currently active calendar date
        const yyyy = state.currentDate.getFullYear();
        const mm = String(state.currentDate.getMonth() + 1).padStart(2, '0');
        const dd = String(state.currentDate.getDate()).padStart(2, '0');
        DOM.inputDate.value = `${yyyy}-${mm}-${dd}`;
        
        // Set default time slots
        DOM.inputStartTime.value = "10:00";
        DOM.inputEndTime.value = "11:00";
        
        DOM.modalCreate.classList.remove('id-hidden');
    });

    const closeCreateModal = () => {
        DOM.modalCreate.classList.add('id-hidden');
        DOM.formCreateMeeting.reset();
    };
    DOM.btnCloseCreate.addEventListener('click', closeCreateModal);
    DOM.btnCancelCreate.addEventListener('click', closeCreateModal);

    // Form Submission: Create Meeting
    DOM.formCreateMeeting.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = document.getElementById('input-title').value.trim();
        const dateStr = DOM.inputDate.value;
        const startTimeStr = DOM.inputStartTime.value;
        const endTimeStr = DOM.inputEndTime.value;
        const participantsRaw = document.getElementById('input-participants').value;
        const description = document.getElementById('input-description').value.trim();
        
        // Parse participants
        const participants = participantsRaw.split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0);
            
        // Build ISO strings local (represented without offset for simplicity in DB matching)
        const start_time = `${dateStr}T${startTimeStr}:00`;
        const end_time = `${dateStr}T${endTimeStr}:00`;

        const submitBtn = DOM.formCreateMeeting.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.querySelector('span').innerText = "Бронирование...";

        try {
            const res = await apiFetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    description: description || null,
                    start_time,
                    end_time,
                    participants
                })
            });

            if (res.status === 201) {
                showToast("Успех!", "Встреча успешно запланирована", "success");
                closeCreateModal();
                await fetchAndRenderMeetings();
            } else if (res.status === 409) {
                const errorData = await res.json();
                const conflicts = errorData.detail.conflicts || [];
                showToast("Конфликт бронирования!", errorData.detail.message || "Один из участников уже занят в это время.", "error", conflicts);
            } else {
                const errorData = await res.json();
                const msg = errorData.detail || "Произошла неизвестная ошибка";
                showToast("Ошибка создания", typeof msg === 'string' ? msg : JSON.stringify(msg), "error");
            }
        } catch (err) {
            console.error(err);
            showToast("Ошибка соединения", "Не удалось связаться с сервером бэкенда", "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.querySelector('span').innerText = "Забронировать";
        }
    });

    // Modal Control: Details
    const closeDetailsModal = () => {
        DOM.modalDetails.classList.add('id-hidden');
        state.selectedMeeting = null;
        DOM.formAddComment.reset();
    };
    DOM.btnCloseDetails.addEventListener('click', closeDetailsModal);

    // Cancel/Delete Meeting
    DOM.btnDeleteMeeting.addEventListener('click', async () => {
        if (!state.selectedMeeting) return;
        
        if (confirm(`Вы уверены, что хотите отменить встречу "${state.selectedMeeting.title}"?`)) {
            try {
                const res = await apiFetch(`/api/meetings/${state.selectedMeeting.id}`, {
                    method: 'DELETE'
                });
                
                if (res.status === 204) {
                    showToast("Отменено", "Встреча успешно удалена", "success");
                    closeDetailsModal();
                    await fetchAndRenderMeetings();
                } else {
                    showToast("Ошибка удаления", "Не удалось отменить встречу", "error");
                }
            } catch (err) {
                showToast("Ошибка соединения", "Нет связи с сервером", "error");
            }
        }
    });

    // Form Submission: Add Comment
    DOM.formAddComment.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.selectedMeeting) return;
        
        const author = DOM.commentAuthor.value.trim();
        const text = DOM.commentText.value.trim();
        
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

    // Settings panel toggling
    DOM.toggleSettings.addEventListener('click', () => {
        DOM.toggleSettings.classList.toggle('open');
        DOM.settingsContent.classList.toggle('id-hidden');
    });

    DOM.btnSaveSettings.addEventListener('click', () => {
        let val = DOM.apiUrlInput.value.trim();
        if (val.endsWith('/')) {
            val = val.slice(0, -1);
        }
        state.apiUrl = val;
        localStorage.setItem('calendar_api_url', val);
        showToast("Настройки сохранены", `Адрес API изменен на: ${val}`, "success");
        checkApiStatus();
        fetchAndRenderMeetings();
    });

    // Theme Selector Buttons
    DOM.themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedTheme = btn.dataset.theme;
            state.theme = selectedTheme;
            localStorage.setItem('calendar_theme', selectedTheme);
            applyTheme(selectedTheme);
        });
    });
}

function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    DOM.themeBtns.forEach(btn => {
        if (btn.dataset.theme === theme) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// API Communication Helper
async function apiFetch(path, options = {}) {
    const url = `${state.apiUrl}${path}`;
    return fetch(url, options);
}

// Verify connection with FastAPI Backend
async function checkApiStatus() {
    DOM.apiStatus.className = "api-status-badge offline";
    DOM.apiStatus.querySelector('.status-text').innerText = "Проверка...";
    
    try {
        const res = await apiFetch('/api/meetings');
        if (res.ok) {
            DOM.apiStatus.className = "api-status-badge online";
            DOM.apiStatus.querySelector('.status-text').innerText = "Онлайн";
        } else {
            throw new Error();
        }
    } catch (e) {
        DOM.apiStatus.className = "api-status-badge offline";
        DOM.apiStatus.querySelector('.status-text').innerText = "Офлайн";
    }
}

// Date Navigation logic
function navigateDate(direction) {
    if (state.currentView === 'month') {
        state.currentDate.setMonth(state.currentDate.getMonth() + direction);
    } else if (state.currentView === 'week') {
        state.currentDate.setDate(state.currentDate.getDate() + (direction * 7));
    } else if (state.currentView === 'agenda') {
        state.currentDate.setDate(state.currentDate.getDate() + direction);
    }
    render();
}

// Primary Render Router
async function render() {
    updateHeaderLabel();
    
    // Switch views in UI
    DOM.monthView.classList.add('id-hidden');
    DOM.weekView.classList.add('id-hidden');
    DOM.agendaView.classList.add('id-hidden');
    
    if (state.currentView === 'month') {
        DOM.monthView.classList.remove('id-hidden');
    } else if (state.currentView === 'week') {
        DOM.weekView.classList.remove('id-hidden');
    } else if (state.currentView === 'agenda') {
        DOM.agendaView.classList.remove('id-hidden');
    }
    
    await fetchAndRenderMeetings();
}

// Format the date label in header
function updateHeaderLabel() {
    const year = state.currentDate.getFullYear();
    if (state.currentView === 'month') {
        DOM.currentDateLabel.innerText = `${MONTHS_RU[state.currentDate.getMonth()]} ${year}`;
    } else if (state.currentView === 'week') {
        const weekdays = getWeekDays(state.currentDate);
        const start = weekdays[0];
        const end = weekdays[6];
        
        let startStr = start.getDate() + ' ' + MONTHS_RU[start.getMonth()].substring(0, 3).toLowerCase();
        let endStr = end.getDate() + ' ' + MONTHS_RU[end.getMonth()].substring(0, 3).toLowerCase();
        
        if (start.getFullYear() !== end.getFullYear()) {
            startStr += ` ${start.getFullYear()}`;
            endStr += ` ${end.getFullYear()}`;
        } else if (start.getMonth() === end.getMonth()) {
            startStr = start.getDate();
        }
        
        DOM.currentDateLabel.innerText = `${startStr} - ${endStr} ${year}`;
    } else {
        DOM.currentDateLabel.innerText = state.currentDate.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }
}

// Fetch meeting data and render view
async function fetchAndRenderMeetings() {
    // Generate dates filter boundaries depending on current view to optimize fetch
    let startStr = "";
    let endStr = "";
    
    if (state.currentView === 'month') {
        const year = state.currentDate.getFullYear();
        const month = state.currentDate.getMonth();
        // Overfetch by 7 days to cover padding rows in month calendar
        const firstDay = new Date(year, month, -7);
        const lastDay = new Date(year, month + 1, 14);
        startStr = firstDay.toISOString().split('T')[0] + "T00:00:00";
        endStr = lastDay.toISOString().split('T')[0] + "T23:59:59";
    } else if (state.currentView === 'week') {
        const weekdays = getWeekDays(state.currentDate);
        startStr = weekdays[0].toISOString().split('T')[0] + "T00:00:00";
        endStr = weekdays[6].toISOString().split('T')[0] + "T23:59:59";
    } else {
        // Agenda loads next 30 days
        const start = new Date(state.currentDate);
        const end = new Date(state.currentDate);
        end.setDate(end.getDate() + 30);
        startStr = start.toISOString().split('T')[0] + "T00:00:00";
        endStr = end.toISOString().split('T')[0] + "T23:59:59";
    }

    try {
        const res = await apiFetch(`/api/meetings?start=${startStr}&end=${endStr}`);
        if (res.ok) {
            state.meetings = await res.json();
            updateStats();
        }
    } catch (e) {
        console.error("Failed to load meetings from API", e);
        // Fallback to empty if api fails to not crash UI
        state.meetings = [];
    }

    // Call view-specific renderers
    if (state.currentView === 'month') {
        renderMonthView();
    } else if (state.currentView === 'week') {
        renderWeekView();
    } else if (state.currentView === 'agenda') {
        renderAgendaView();
    }
}

// Render Month View Grid
function renderMonthView() {
    DOM.monthDaysGrid.innerHTML = '';
    const days = getMonthDays(state.currentDate);
    
    days.forEach(dayInfo => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        if (!dayInfo.isCurrentMonth) {
            dayDiv.classList.add(dayInfo.date.getMonth() < state.currentDate.getMonth() ? 'prev-month' : 'next-month');
        }
        
        // Match today
        const systemToday = new Date(2026, 6, 8); // July 8, 2026
        if (isSameDay(dayInfo.date, systemToday)) {
            dayDiv.classList.add('today');
        }
        
        // Day header (date number)
        const header = document.createElement('div');
        header.className = 'day-header';
        
        const numSpan = document.createElement('span');
        numSpan.className = 'day-number';
        numSpan.innerText = dayInfo.date.getDate();
        header.appendChild(numSpan);
        dayDiv.appendChild(header);
        
        // Meetings container
        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'day-events';
        
        // Filter meetings for this day
        const dayMeetings = state.meetings.filter(m => {
            const mDate = new Date(m.start_time);
            return isSameDay(mDate, dayInfo.date);
        });
        
        // Sort chronologically
        dayMeetings.sort((a, b) => a.start_time.localeCompare(b.start_time));
        
        dayMeetings.forEach(meeting => {
            const pill = document.createElement('div');
            pill.className = 'event-pill';
            
            const startObj = new Date(meeting.start_time);
            const timeStr = startObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            
            pill.innerText = `${timeStr} ${meeting.title}`;
            pill.title = `${meeting.title} (${timeStr})\nУчастники: ${meeting.participants.join(', ')}`;
            
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                openDetailsModal(meeting);
            });
            
            eventsContainer.appendChild(pill);
        });
        
        dayDiv.appendChild(eventsContainer);
        
        // Add click on cell to schedule event on this day directly
        dayDiv.addEventListener('click', () => {
            const yyyy = dayInfo.date.getFullYear();
            const mm = String(dayInfo.date.getMonth() + 1).padStart(2, '0');
            const dd = String(dayInfo.date.getDate()).padStart(2, '0');
            DOM.inputDate.value = `${yyyy}-${mm}-${dd}`;
            DOM.modalCreate.classList.remove('id-hidden');
        });
        
        DOM.monthDaysGrid.appendChild(dayDiv);
    });
}

// Render Week View Columns
function renderWeekView() {
    DOM.weekColumnsContainer.innerHTML = '';
    const weekdays = getWeekDays(state.currentDate);
    const systemToday = new Date(2026, 6, 8); // July 8, 2026
    
    // Update headers date numbers
    const headers = DOM.weekView.querySelectorAll('.weekday-header');
    weekdays.forEach((day, index) => {
        headers[index].querySelector('.date-num').innerText = day.getDate();
        if (isSameDay(day, systemToday)) {
            headers[index].style.color = 'var(--primary)';
        } else {
            headers[index].style.color = '';
        }
    });
    
    // Create columns
    weekdays.forEach((day) => {
        const column = document.createElement('div');
        column.className = 'week-column';
        if (isSameDay(day, systemToday)) {
            column.classList.add('today');
        }
        
        // Filter meetings for this day
        const dayMeetings = state.meetings.filter(m => {
            const mDate = new Date(m.start_time);
            return isSameDay(mDate, day);
        });
        
        // Sort chronologically
        dayMeetings.sort((a, b) => a.start_time.localeCompare(b.start_time));
        
        if (dayMeetings.length === 0) {
            column.innerHTML = '<div style="margin: auto; color: var(--text-muted); font-size: 11px; text-align: center;">Нет встреч</div>';
        } else {
            dayMeetings.forEach(meeting => {
                const card = document.createElement('div');
                card.className = 'event-card';
                
                const startObj = new Date(meeting.start_time);
                const endObj = new Date(meeting.end_time);
                const tStart = startObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                const tEnd = endObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                
                card.innerHTML = `
                    <div class="event-card-title">${meeting.title}</div>
                    <div class="event-card-time"><i class="fa-regular fa-clock"></i> ${tStart} - ${tEnd}</div>
                    <div class="event-card-participants">
                        ${meeting.participants.slice(0, 3).map(p => `<span class="p-tag">${p}</span>`).join('')}
                        ${meeting.participants.length > 3 ? `<span class="p-tag">+${meeting.participants.length - 3}</span>` : ''}
                    </div>
                `;
                
                card.addEventListener('click', () => openDetailsModal(meeting));
                column.appendChild(card);
            });
        }
        
        DOM.weekColumnsContainer.appendChild(column);
    });
}

// Render Agenda/List View
function renderAgendaView() {
    DOM.agendaList.innerHTML = '';
    
    if (state.meetings.length === 0) {
        DOM.agendaList.innerHTML = `
            <div class="no-meetings-placeholder">
                <i class="fa-regular fa-calendar-xmark"></i>
                <p>Нет запланированных встреч на ближайшие 30 дней.</p>
            </div>
        `;
        return;
    }
    
    // Group meetings by date string
    const groups = {};
    state.meetings.forEach(meeting => {
        const mDate = new Date(meeting.start_time);
        const key = mDate.toDateString(); // Unified date key
        if (!groups[key]) groups[key] = { date: mDate, items: [] };
        groups[key].items.push(meeting);
    });
    
    // Sort day groups
    const sortedKeys = Object.keys(groups).sort((a, b) => new Date(a) - new Date(b));
    
    sortedKeys.forEach(key => {
        const group = groups[key];
        
        const groupDiv = document.createElement('div');
        groupDiv.className = 'agenda-day-group';
        
        // Divider header
        const divider = document.createElement('div');
        divider.className = 'agenda-date-divider';
        divider.innerText = group.date.toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
        groupDiv.appendChild(divider);
        
        // Sort chronologically inside group
        group.items.sort((a, b) => a.start_time.localeCompare(b.start_time));
        
        group.items.forEach(meeting => {
            const startObj = new Date(meeting.start_time);
            const endObj = new Date(meeting.end_time);
            const tStart = startObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const tEnd = endObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            
            const item = document.createElement('div');
            item.className = 'agenda-item';
            item.innerHTML = `
                <div class="agenda-item-left">
                    <div class="agenda-item-title">${meeting.title}</div>
                    <div class="agenda-item-meta">
                        <span><i class="fa-regular fa-user"></i> ${meeting.participants.join(', ')}</span>
                    </div>
                </div>
                <div class="agenda-item-right">
                    <div class="agenda-item-time">${tStart} - ${tEnd}</div>
                </div>
            `;
            
            item.addEventListener('click', () => openDetailsModal(meeting));
            groupDiv.appendChild(item);
        });
        
        DOM.agendaList.appendChild(groupDiv);
    });
}

// Open Meeting Details and Comments Dialog
async function openDetailsModal(meeting) {
    state.selectedMeeting = meeting;
    
    // Map basic text
    DOM.detailTitle.innerText = meeting.title;
    
    const startObj = new Date(meeting.start_time);
    const endObj = new Date(meeting.end_time);
    const dateLabel = startObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const tStart = startObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const tEnd = endObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    DOM.detailTime.innerHTML = `<i class="fa-regular fa-clock"></i> ${dateLabel}, ${tStart} - ${tEnd}`;
    
    DOM.detailDescription.innerText = meeting.description || "Описание отсутствует";
    
    // Load participant chips
    DOM.detailParticipants.innerHTML = '';
    meeting.participants.forEach(p => {
        const chip = document.createElement('span');
        chip.className = 'chip-participant';
        chip.innerHTML = `<i class="fa-solid fa-user-tag"></i> ${p}`;
        DOM.detailParticipants.appendChild(chip);
    });
    
    // Clear list and load comments
    DOM.commentsList.innerHTML = '<div class="no-comments">Загрузка комментариев...</div>';
    DOM.modalDetails.classList.remove('id-hidden');
    
    await loadComments(meeting.id);
}

// Load comments from API
async function loadComments(meetingId) {
    try {
        const res = await apiFetch(`/api/meetings/${meetingId}/comments`);
        if (res.ok) {
            const comments = await res.json();
            DOM.commentsList.innerHTML = '';
            
            if (comments.length === 0) {
                DOM.commentsList.innerHTML = '<div class="no-comments">Комментариев пока нет. Напишите первый!</div>';
                return;
            }
            
            comments.forEach(c => {
                const commentDiv = document.createElement('div');
                commentDiv.className = 'comment-item';
                
                const timeObj = new Date(c.created_at);
                const timeStr = timeObj.toLocaleString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                commentDiv.innerHTML = `
                    <div class="comment-meta">
                        <span class="comment-author">${c.author}</span>
                        <span class="comment-time">${timeStr}</span>
                    </div>
                    <div class="comment-text">${c.text}</div>
                `;
                DOM.commentsList.appendChild(commentDiv);
            });
            // Auto scroll comments to bottom
            DOM.commentsList.scrollTop = DOM.commentsList.scrollHeight;
        } else {
            DOM.commentsList.innerHTML = '<div class="no-comments" style="color: var(--danger);">Не удалось загрузить комментарии.</div>';
        }
    } catch (e) {
        DOM.commentsList.innerHTML = '<div class="no-comments" style="color: var(--danger);">Ошибка сети.</div>';
    }
}

// Calculate general quick statistics
function updateStats() {
    const systemToday = new Date(2026, 6, 8); // July 8, 2026
    
    // Today's meetings
    const todayMeetings = state.meetings.filter(m => {
        const mDate = new Date(m.start_time);
        return isSameDay(mDate, systemToday);
    });
    DOM.statMeetingsToday.innerText = todayMeetings.length;
    
    // Unique participants list
    const participantsSet = new Set();
    state.meetings.forEach(m => {
        m.participants.forEach(p => participantsSet.add(p.toLowerCase()));
    });
    DOM.statTotalPeople.innerText = participantsSet.size;
}

// Toast System
function showToast(title, message, type = 'success', conflicts = []) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-triangle-exclamation';
    
    let conflictsHtml = '';
    if (conflicts && conflicts.length > 0) {
        conflictsHtml = `
            <div style="margin-top: 8px;">
                ${conflicts.map(c => `
                    <div class="conflict-item">
                        <strong>${c.participant}</strong> занят(а) в "${c.conflicting_meeting.title}" 
                        (${new Date(c.conflicting_meeting.start_time).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})} - 
                        ${new Date(c.conflicting_meeting.end_time).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})})
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${iconClass}"></i></div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
            ${conflictsHtml}
        </div>
        <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
    `;
    
    // Close button click handler
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 200);
    });
    
    DOM.toastContainer.appendChild(toast);
    
    // Auto-remove success toasts after 4 seconds, keep errors longer if they contain conflict details
    const timeout = type === 'success' ? 4000 : 8000;
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 200);
        }
    }, timeout);
}

// Helpers
function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function getWeekDays(date) {
    const tempDate = new Date(date);
    const day = tempDate.getDay();
    const diff = tempDate.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    const startOfWeek = new Date(tempDate.setDate(diff));
    
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        days.push(d);
    }
    return days;
}

function getMonthDays(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
    // Convert Sunday-indexed to Monday-indexed: 0->6, 1->0, 2->1, 3->2, etc.
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevMonthLastDate = new Date(year, month, 0).getDate();
    
    const days = [];
    
    // Previous month padding
    for (let i = startOffset - 1; i >= 0; i--) {
        const d = new Date(year, month - 1, prevMonthLastDate - i);
        days.push({ date: d, isCurrentMonth: false });
    }
    
    // Current month days
    for (let i = 1; i <= lastDate; i++) {
        const d = new Date(year, month, i);
        days.push({ date: d, isCurrentMonth: true });
    }
    
    // Next month padding
    const totalCells = days.length > 35 ? 42 : 35; // Standard 5 or 6 row calendar grid
    const nextMonthPadding = totalCells - days.length;
    for (let i = 1; i <= nextMonthPadding; i++) {
        const d = new Date(year, month + 1, i);
        days.push({ date: d, isCurrentMonth: false });
    }
    
    return days;
}
