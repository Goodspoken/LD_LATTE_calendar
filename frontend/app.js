// ============================================================
// State
// ============================================================
const state = {
    currentDate: new Date(),
    viewMode: 'month', // 'month' | 'week' | 'agenda'
    meetings: [],
    users: [],
    selectedParticipants: [], // Tags
    theme: localStorage.getItem('calendar_theme') || 'default',
    apiUrl: localStorage.getItem('calendar_api_url') || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:8000' : 'http://192.168.1.2:8507'),
    editingMeetingId: null,
    filterParticipant: '',
    offlineBannerShown: false
};

const MONTHS_RU = [
    "Январь","Февраль","Март","Апрель","Май","Июнь",
    "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"
];

// ============================================================
// DOM Cache
// ============================================================
const DOM = {
    btnNewMeeting:      document.getElementById('btn-new-meeting'),
    btnPrev:            document.getElementById('btn-prev'),
    btnNext:            document.getElementById('btn-next'),
    btnToday:           document.getElementById('btn-today'),
    currentDateLabel:   document.getElementById('current-date-label'),
    apiStatus:          document.getElementById('api-status'),

    // Views
    monthView:          document.getElementById('month-view'),
    compactView:        document.getElementById('compact-view'),
    weekView:           document.getElementById('week-view'),
    agendaView:         document.getElementById('agenda-view'),
    navItems:           document.querySelectorAll('.nav-item'),

    // Grids
    monthDaysGrid:          document.getElementById('month-days-grid'),
    compactWrapper:         document.getElementById('compact-months-wrapper'),
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
    inputGoal:              document.getElementById('input-goal'),
    inputResult:            document.getElementById('input-result'),

    // Details Modal
    modalDetails:           document.getElementById('modal-details'),
    btnCloseDetails:        document.getElementById('btn-close-details'),
    detailTitle:            document.getElementById('detail-title'),
    detailTime:             document.getElementById('detail-time'),
    detailPriority:         document.getElementById('detail-priority'),
    detailParticipants:     document.getElementById('detail-participants'),
    detailGoal:             document.getElementById('detail-goal'),
    detailDescription:      document.getElementById('detail-description'),
    detailResult:           document.getElementById('detail-result'),
    btnDeleteMeeting:       document.getElementById('btn-delete-meeting'),
    btnEditMeeting:         document.getElementById('btn-edit-meeting'),
    commentsList:           document.getElementById('comments-list'),
    formAddComment:         document.getElementById('form-add-comment'),
    commentAuthor:          document.getElementById('comment-author'),
    commentText:            document.getElementById('comment-text'),
    
    // Attachments
    detailAttachmentsList:  document.getElementById('detail-attachments-list'),
    inputAttachment:        document.getElementById('input-attachment'),
    btnAddAttachment:       document.getElementById('btn-add-attachment'),
    attachmentUploadStatus: document.getElementById('attachment-upload-status'),

    // Sidebar
    toggleSettings:         document.getElementById('toggle-settings'),
    settingsContent:        document.getElementById('settings-content'),
    apiUrlInput:            document.getElementById('api-url-input'),
    btnSaveSettings:        document.getElementById('btn-save-settings'),
    toastContainer:         document.getElementById('toast-container'),
    statMeetingsToday:      document.getElementById('stat-meetings-today'),
    statTotalPeople:        document.getElementById('stat-total-people'),
    themeBtns:              document.querySelectorAll('.theme-btn'),
    participantFilter:      document.getElementById('participant-filter'),
    btnClearFilter:         document.getElementById('btn-clear-filter'),
    offlineBannerContainer: document.getElementById('offline-banner-container'),
    sidebarUpcomingList:    document.getElementById('sidebar-upcoming-list'),

    // Users and tags
    registeredUsersCount:   document.getElementById('registered-users-count'),
    btnAddUser:             document.getElementById('btn-add-user'),
    modalAddUser:           document.getElementById('modal-add-user'),
    btnCloseAddUser:        document.getElementById('btn-close-add-user'),
    formAddUser:            document.getElementById('form-add-user'),
    btnCancelAddUser:       document.getElementById('btn-cancel-add-user'),
    
    participantsContainer:  document.getElementById('participants-container'),
    inputParticipantSearch: document.getElementById('input-participant-search'),
    participantsSuggestions:document.getElementById('participants-suggestions'),
    inputRecurrence:        document.getElementById('input-recurrence'),
    groupRecurrenceEnd:     document.getElementById('group-recurrence-end'),
    inputRecurrenceEnd:     document.getElementById('input-recurrence-end'),
};

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(state.theme);
    DOM.apiUrlInput.value = state.apiUrl;
    initEventListeners();
    initTagsInput();
    checkApiStatus();
    fetchUsers();
    render();
    fetchTodayStats();
});

// ============================================================
// Event Listeners
// ============================================================
function initEventListeners() {
    // Navigation
    DOM.btnPrev.addEventListener('click', () => navigateDate(-1));
    DOM.btnNext.addEventListener('click', () => navigateDate(1));
    DOM.btnToday.addEventListener('click', () => { state.currentDate = new Date(); render(); });

    // View switching
    DOM.navItems.forEach(item => {
        item.addEventListener('click', () => {
            DOM.navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            state.currentView = item.dataset.view;
            render();
        });
    });

    // Open create modal
    DOM.btnNewMeeting.addEventListener('click', () => openCreateModal());

    const closeCreateModal = () => {
        DOM.modalCreate.classList.add('id-hidden');
        DOM.formCreateMeeting.reset();
        document.getElementById('input-priority-normal').checked = true;
        state.editingMeeting = null;
        if (DOM.modalCreateTitle) DOM.modalCreateTitle.innerHTML = '<i class="fa-solid fa-circle-plus"></i> Запланировать встречу';
        const span = DOM.formCreateMeeting.querySelector('button[type="submit"] span');
        if (span) span.innerText = 'Забронировать';
    };
    DOM.btnCloseCreate.addEventListener('click', closeCreateModal);
    DOM.btnCancelCreate.addEventListener('click', closeCreateModal);

    // Form: Create or Edit
    DOM.formCreateMeeting.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title        = document.getElementById('input-title').value.trim();
        const dateStr      = DOM.inputDate.value;
        const startTimeStr = DOM.inputStartTime.value;
        const endTimeStr   = DOM.inputEndTime.value;
        const description  = document.getElementById('input-description').value.trim();
        const goal         = DOM.inputGoal.value.trim();
        const result       = DOM.inputResult.value.trim();
        const priority     = document.querySelector('input[name="input-priority"]:checked')?.value || 'normal';
        
        const recurrence = DOM.inputRecurrence ? DOM.inputRecurrence.value : 'none';
        const recurrence_end_date = DOM.inputRecurrenceEnd ? DOM.inputRecurrenceEnd.value : null;

        if (endTimeStr <= startTimeStr) {
            showToast("Ошибка ввода", "Время окончания должно быть позже начала", "error");
            return;
        }

        const participants = [...state.selectedParticipants];
        if (participants.length === 0) {
            showToast("Ошибка ввода", "Укажите хотя бы одного участника", "error");
            return;
        }

        const start_time = `${dateStr}T${startTimeStr}:00`;
        const end_time   = `${dateStr}T${endTimeStr}:00`;

        const submitBtn  = DOM.formCreateMeeting.querySelector('button[type="submit"]');
        const submitSpan = submitBtn.querySelector('span');
        submitBtn.disabled = true;
        submitSpan.innerText = state.editingMeeting ? "Сохранение..." : "Бронирование...";

        try {
            const isEdit = !!state.editingMeeting;
            const url    = isEdit ? `/api/meetings/${state.editingMeeting.id}` : '/api/meetings';
            const method = isEdit ? 'PUT' : 'POST';

            const payload = {
                title,
                description: description || null,
                goal: goal || null,
                result: result || null,
                priority,
                start_time,
                end_time,
                participants
            };
            
            if (!isEdit && recurrence && recurrence !== 'none') {
                payload.recurrence = recurrence;
                payload.recurrence_end_date = recurrence_end_date || null;
            }

            const res = await apiFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.status === 201 || res.status === 200) {
                showToast("Успех!", isEdit ? "Встреча обновлена" : "Встреча запланирована", "success");
                closeCreateModal();
                await fetchAndRenderMeetings();
                await fetchTodayStats();
            } else if (res.status === 409) {
                const err = await res.json();
                showToast("Конфликт!", err.detail.message || "Участник уже занят", "error", err.detail.conflicts || []);
            } else {
                const err = await res.json();
                const msg = err.detail || "Неизвестная ошибка";
                showToast("Ошибка", typeof msg === 'string' ? msg : JSON.stringify(msg), "error");
            }
        } catch (err) {
            console.error(err);
            showToast("Ошибка соединения", "Не удалось связаться с сервером", "error");
        } finally {
            submitBtn.disabled = false;
            submitSpan.innerText = state.editingMeeting ? "Сохранить" : "Забронировать";
        }
    });

    // Details modal: close
    const closeDetailsModal = () => {
        DOM.modalDetails.classList.add('id-hidden');
        state.selectedMeeting = null;
        DOM.formAddComment.reset();
    };
    DOM.btnCloseDetails.addEventListener('click', closeDetailsModal);

    // Details modal: edit
    DOM.btnEditMeeting.addEventListener('click', () => {
        if (!state.selectedMeeting) return;
        const m = state.selectedMeeting;
        closeDetailsModal();
        openCreateModal(m);
    });

    // Attachments
    DOM.btnAddAttachment.addEventListener('click', () => {
        DOM.inputAttachment.click();
    });

    DOM.inputAttachment.addEventListener('change', async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        if (!state.selectedMeeting) return;
        
        DOM.attachmentUploadStatus.textContent = 'Загрузка...';
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const base = state.apiUrl || (window.location.hostname.includes('github.io') || window.location.protocol.startsWith('file') ? 'http://192.168.1.2:8507' : window.location.origin);
            const res = await fetch(`${base}/api/meetings/${state.selectedMeeting.id}/attachments`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                const newAtt = await res.json();
                state.selectedMeeting.attachments = state.selectedMeeting.attachments || [];
                state.selectedMeeting.attachments.push(newAtt);
                renderAttachmentsList(state.selectedMeeting.attachments);
                DOM.attachmentUploadStatus.textContent = '';
                showToast("Загружено", "Файл прикреплен", "success");
            } else {
                DOM.attachmentUploadStatus.textContent = 'Ошибка загрузки';
            }
        } catch(err) {
            DOM.attachmentUploadStatus.textContent = 'Ошибка сети';
        }
        e.target.value = '';
    });

    // Details modal: delete
    DOM.btnDeleteMeeting.addEventListener('click', async () => {
        if (!state.selectedMeeting) return;
        if (!confirm(`Отменить встречу "${state.selectedMeeting.title}"?`)) return;

        try {
            const res = await apiFetch(`/api/meetings/${state.selectedMeeting.id}`, { method: 'DELETE' });
            if (res.status === 204) {
                showToast("Удалено", "Встреча отменена", "success");
                closeDetailsModal();
                await fetchAndRenderMeetings();
                await fetchTodayStats();
            } else {
                showToast("Ошибка", "Не удалось удалить", "error");
            }
        } catch { showToast("Ошибка соединения", "Нет связи с сервером", "error"); }
    });

    // Comments
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
        } catch { showToast("Ошибка соединения", "Нет связи с сервером", "error"); }
    });

    // Settings
    DOM.toggleSettings.addEventListener('click', () => {
        DOM.toggleSettings.classList.toggle('open');
        DOM.settingsContent.classList.toggle('id-hidden');
    });
    DOM.btnSaveSettings.addEventListener('click', () => {
        let val = DOM.apiUrlInput.value.trim().replace(/\/$/, '');
        state.apiUrl = val;
        localStorage.setItem('calendar_api_url', val);
        state.offlineBannerShown = false;
        hideOfflineBanner();
        showToast("Настройки сохранены", `API: ${val || '(не задан)'}`, "success");
        checkApiStatus();
        fetchAndRenderMeetings();
    });

    // Theme
    DOM.themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            state.theme = btn.dataset.theme;
            localStorage.setItem('calendar_theme', btn.dataset.theme);
            applyTheme(btn.dataset.theme);
        });
    });

    // Participant filter
    if (DOM.participantFilter) {
        DOM.participantFilter.addEventListener('input', () => {
            state.filterParticipant = DOM.participantFilter.value.trim().toLowerCase();
            renderCurrentView();
            renderSidebarUpcomingList();
        });
    }
    if (DOM.btnClearFilter) {
        DOM.btnClearFilter.addEventListener('click', () => {
            state.filterParticipant = '';
            if (DOM.participantFilter) DOM.participantFilter.value = '';
            renderCurrentView();
            renderSidebarUpcomingList();
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
// Open Create / Edit Modal
// ============================================================
function openCreateModal(meetingToEdit = null, prefilledDate = null) {
    state.editingMeeting = meetingToEdit;

    if (meetingToEdit) {
        // ── Edit mode ──
        if (DOM.modalCreateTitle) DOM.modalCreateTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Изменить встречу';

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
        DOM.inputGoal.value   = meetingToEdit.goal || '';
        DOM.inputResult.value = meetingToEdit.result || '';

        const priority = meetingToEdit.priority || 'normal';
        const radio = document.getElementById(`input-priority-${priority}`);
        if (radio) radio.checked = true;

        const span = DOM.formCreateMeeting.querySelector('button[type="submit"] span');
        if (span) span.innerText = 'Сохранить';

    } else {
        // ── Create mode ──
        if (DOM.modalCreateTitle) DOM.modalCreateTitle.innerHTML = '<i class="fa-solid fa-circle-plus"></i> Запланировать встречу';

        const targetDate = prefilledDate || state.currentDate;
        DOM.inputDate.value      = `${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2,'0')}-${String(targetDate.getDate()).padStart(2,'0')}`;
        DOM.inputStartTime.value = "10:00";
        DOM.inputEndTime.value   = "11:00";
        document.getElementById('input-priority-normal').checked = true;

        const span = DOM.formCreateMeeting.querySelector('button[type="submit"] span');
        if (span) span.innerText = 'Забронировать';
    }

    DOM.modalCreate.classList.remove('id-hidden');
}

// ============================================================
// API Helper
// ============================================================
async function apiFetch(path, options = {}) {
    let base = state.apiUrl;
    if (!base) {
        if (window.location.hostname.includes('github.io')) {
            base = 'http://192.168.1.2:8507';
        } else if (window.location.protocol.startsWith('file')) {
            base = 'http://192.168.1.2:8507';
        } else {
            base = window.location.origin;
        }
    }
    return fetch(`${base}${path}`, options);
}

// ============================================================
// API Status + Offline Banner
// ============================================================
async function checkApiStatus() {
    DOM.apiStatus.className = "api-status-badge offline";
    DOM.apiStatus.querySelector('.status-text').innerText = "Проверка...";
    try {
        const res = await apiFetch('/api/meetings?limit=1');
        if (res.ok) {
            DOM.apiStatus.className = "api-status-badge online";
            DOM.apiStatus.querySelector('.status-text').innerText = "Онлайн";
            hideOfflineBanner();
        } else {
            throw new Error();
        }
    } catch {
        DOM.apiStatus.className = "api-status-badge offline";
        DOM.apiStatus.querySelector('.status-text').innerText = "Офлайн";
        showOfflineBanner();
    }
}

function showOfflineBanner() {
    if (state.offlineBannerShown) return;
    state.offlineBannerShown = true;

    let extraWarning = "";
    if (window.location.protocol === "https:" && (!state.apiUrl || state.apiUrl.startsWith("http:"))) {
        extraWarning = `<div style="font-size: 11px; margin-top: 4px; color: rgba(255, 145, 0, 0.85);">
            ⚠️ Вы открыли сайт через безопасный HTTPS (GitHub Pages). Браузеры блокируют HTTP-запросы к localhost или незащищенным IP-серверам (Mixed Content). 
            Рекомендуется запустить проект локально (открыв файл <code>frontend/index.html</code> напрямую) или настроить HTTPS/SSL для вашего бэкенд-сервера.
        </div>`;
    }

    const banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.className = 'offline-banner';
    banner.innerHTML = `
        <div class="offline-banner-content">
            <i class="fa-solid fa-plug-circle-xmark"></i>
            <div>
                <strong>Бэкенд недоступен.</strong>
                <span>Введите URL бэкенда в разделе <strong>Настройки API</strong> внизу боковой панели.</span>
                ${extraWarning}
            </div>
        </div>
        <button class="offline-banner-close" onclick="hideOfflineBanner()"><i class="fa-solid fa-xmark"></i></button>
    `;
    DOM.offlineBannerContainer.appendChild(banner);
}

function hideOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.remove();
    state.offlineBannerShown = false;
}

// ============================================================
// Date Navigation
// ============================================================
function navigateDate(dir) {
    if (state.currentView === 'month' || state.currentView === 'compact') {
        state.currentDate.setMonth(state.currentDate.getMonth() + dir);
    } else if (state.currentView === 'week') {
        state.currentDate.setDate(state.currentDate.getDate() + dir * 7);
    } else {
        state.currentDate.setDate(state.currentDate.getDate() + dir);
    }
    render();
}

// ============================================================
// Render Router
// ============================================================
async function render() {
    updateHeaderLabel();

    [DOM.monthView, DOM.compactView, DOM.weekView, DOM.agendaView].forEach(v => v.classList.add('id-hidden'));

    if      (state.currentView === 'month')   DOM.monthView.classList.remove('id-hidden');
    else if (state.currentView === 'compact') DOM.compactView.classList.remove('id-hidden');
    else if (state.currentView === 'week')    DOM.weekView.classList.remove('id-hidden');
    else if (state.currentView === 'agenda')  DOM.agendaView.classList.remove('id-hidden');

    await fetchAndRenderMeetings();
}

function renderCurrentView() {
    if      (state.currentView === 'month')   renderMonthView();
    else if (state.currentView === 'compact') renderCompactView();
    else if (state.currentView === 'week')    renderWeekView();
    else if (state.currentView === 'agenda')  renderAgendaView();
}

// ============================================================
// Header Label
// ============================================================
function updateHeaderLabel() {
    const year = state.currentDate.getFullYear();
    if (state.currentView === 'month' || state.currentView === 'compact') {
        DOM.currentDateLabel.innerText = `${MONTHS_RU[state.currentDate.getMonth()]} ${year}`;
    } else if (state.currentView === 'week') {
        const wd = getWeekDays(state.currentDate);
        const s = wd[0], e = wd[6];
        let sStr = `${s.getDate()} ${MONTHS_RU[s.getMonth()].substring(0,3).toLowerCase()}`;
        let eStr = `${e.getDate()} ${MONTHS_RU[e.getMonth()].substring(0,3).toLowerCase()}`;
        if (s.getMonth() === e.getMonth()) sStr = String(s.getDate());
        DOM.currentDateLabel.innerText = `${sStr} — ${eStr} ${year}`;
    } else {
        DOM.currentDateLabel.innerText = state.currentDate.toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }
}

// ============================================================
// Fetch Meetings
// ============================================================
async function fetchAndRenderMeetings() {
    let startStr = '', endStr = '';

    if (state.currentView === 'month') {
        const y = state.currentDate.getFullYear(), m = state.currentDate.getMonth();
        startStr = new Date(y, m, -7).toISOString().split('T')[0] + "T00:00:00";
        endStr   = new Date(y, m + 1, 14).toISOString().split('T')[0] + "T23:59:59";
    } else if (state.currentView === 'compact') {
        // Fetch prev + current + next month for compact 3-month view
        const y = state.currentDate.getFullYear(), m = state.currentDate.getMonth();
        startStr = new Date(y, m - 1, 1).toISOString().split('T')[0] + "T00:00:00";
        endStr   = new Date(y, m + 2, 0).toISOString().split('T')[0] + "T23:59:59";
    } else if (state.currentView === 'week') {
        const wd = getWeekDays(state.currentDate);
        startStr = wd[0].toISOString().split('T')[0] + "T00:00:00";
        endStr   = wd[6].toISOString().split('T')[0] + "T23:59:59";
    } else {
        const end = new Date(state.currentDate);
        end.setDate(end.getDate() + 30);
        startStr = state.currentDate.toISOString().split('T')[0] + "T00:00:00";
        endStr   = end.toISOString().split('T')[0] + "T23:59:59";
    }

    try {
        const res = await apiFetch(`/api/meetings?start=${startStr}&end=${endStr}`);
        if (res.ok) state.meetings = await res.json();
    } catch { state.meetings = []; }

    renderCurrentView();
    renderSidebarUpcomingList();
}

// ============================================================
// Today Stats (always real today, independent of view)
// ============================================================
async function fetchTodayStats() {
    const todayStr = new Date().toISOString().split('T')[0];
    try {
        const res = await apiFetch(`/api/meetings?start=${todayStr}T00:00:00&end=${todayStr}T23:59:59`);
        if (res.ok) {
            const list = await res.json();
            DOM.statMeetingsToday.innerText = list.length;
            const ppl = new Set();
            list.forEach(m => m.participants.forEach(p => ppl.add(p.toLowerCase())));
            DOM.statTotalPeople.innerText = ppl.size;
        }
    } catch { /* silent */ }
}

// ============================================================
// Filter
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
    const days     = getMonthDays(state.currentDate);
    const filtered = getFilteredMeetings();
    const today    = new Date();

    days.forEach(dayInfo => {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        if (!dayInfo.isCurrentMonth) cell.classList.add(dayInfo.date.getMonth() < state.currentDate.getMonth() ? 'prev-month' : 'next-month');
        if (isSameDay(dayInfo.date, today)) cell.classList.add('today');

        const header = document.createElement('div');
        header.className = 'day-header';
        const numSpan = document.createElement('span');
        numSpan.className = 'day-number';
        numSpan.innerText = dayInfo.date.getDate();
        header.appendChild(numSpan);
        cell.appendChild(header);

        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'day-events';

        filtered
            .filter(m => isSameDay(new Date(m.start_time), dayInfo.date))
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .forEach(meeting => {
                const pill = document.createElement('div');
                pill.className = `event-pill priority-${meeting.priority || 'normal'}`;
                const timeStr = new Date(meeting.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                const priorityPrefix = meeting.priority === 'important' ? '⚠️ ' : '';
                pill.textContent = `${priorityPrefix}${timeStr} ${meeting.title}`;
                pill.title = `${meeting.title}\nУчастники: ${meeting.participants.join(', ')}`;
                pill.addEventListener('click', e => { e.stopPropagation(); openDetailsModal(meeting); });
                eventsContainer.appendChild(pill);
            });

        cell.appendChild(eventsContainer);

        // Click on day → open create modal with that date
        cell.addEventListener('click', () => {
            openCreateModal(null, dayInfo.date);
        });

        DOM.monthDaysGrid.appendChild(cell);
    });
}

// ============================================================
// Compact 3-Month View
// ============================================================
function renderCompactView() {
    DOM.compactWrapper.innerHTML = '';
    const today    = new Date();
    const filtered = getFilteredMeetings();

    [-1, 0, 1].forEach(offset => {
        const monthDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + offset, 1);

        const miniMonth = document.createElement('div');
        miniMonth.className = 'mini-month';

        // Header
        const header = document.createElement('div');
        header.className = 'mini-month-header';
        header.textContent = `${MONTHS_RU[monthDate.getMonth()]} ${monthDate.getFullYear()}`;
        miniMonth.appendChild(header);

        // Weekday labels
        const wdRow = document.createElement('div');
        wdRow.className = 'mini-weekdays';
        ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(d => {
            const span = document.createElement('div');
            span.textContent = d;
            wdRow.appendChild(span);
        });
        miniMonth.appendChild(wdRow);

        // Days grid
        const grid = document.createElement('div');
        grid.className = 'mini-days-grid';

        getMonthDays(monthDate).forEach(dayInfo => {
            const cell = document.createElement('div');
            cell.className = 'mini-day';
            if (!dayInfo.isCurrentMonth) cell.classList.add('mini-day-outside');
            if (isSameDay(dayInfo.date, today)) cell.classList.add('mini-day-today');

            const numSpan = document.createElement('span');
            numSpan.textContent = dayInfo.date.getDate();
            cell.appendChild(numSpan);

            const dayMeetings = filtered.filter(m => isSameDay(new Date(m.start_time), dayInfo.date));
            if (dayMeetings.length > 0) {
                const dotsDiv = document.createElement('div');
                dotsDiv.className = 'mini-day-dots';
                dayMeetings.slice(0, 3).forEach(m => {
                    const dot = document.createElement('span');
                    dot.className = `mini-dot ${m.priority === 'important' ? 'important' : 'normal'}`;
                    dotsDiv.appendChild(dot);
                });
                cell.appendChild(dotsDiv);
            }

            // Click: go to that month in full view
            if (dayInfo.isCurrentMonth) {
                cell.addEventListener('click', () => {
                    state.currentDate = new Date(dayInfo.date);
                    state.currentView = 'month';
                    DOM.navItems.forEach(n => n.classList.remove('active'));
                    document.querySelector('[data-view="month"]').classList.add('active');
                    render();
                });
            }

            grid.appendChild(cell);
        });

        miniMonth.appendChild(grid);
        DOM.compactWrapper.appendChild(miniMonth);
    });
}

// ============================================================
// Week View
// ============================================================
function renderWeekView() {
    DOM.weekColumnsContainer.innerHTML = '';
    const weekdays = getWeekDays(state.currentDate);
    const today    = new Date();
    const filtered = getFilteredMeetings();

    const headers = DOM.weekView.querySelectorAll('.weekday-header');
    weekdays.forEach((day, i) => {
        headers[i].querySelector('.date-num').innerText = day.getDate();
        headers[i].style.color = isSameDay(day, today) ? 'var(--primary)' : '';
    });

    weekdays.forEach(day => {
        const col = document.createElement('div');
        col.className = 'week-column';
        if (isSameDay(day, today)) col.classList.add('today');

        const dayMeetings = filtered
            .filter(m => isSameDay(new Date(m.start_time), day))
            .sort((a, b) => a.start_time.localeCompare(b.start_time));

        if (dayMeetings.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'margin:auto;color:var(--text-muted);font-size:11px;text-align:center;padding:12px 0';
            empty.textContent = 'Нет встреч';
            col.appendChild(empty);
        } else {
            dayMeetings.forEach(meeting => {
                const card = document.createElement('div');
                card.className = `event-card priority-${meeting.priority || 'normal'}`;

                const tS = new Date(meeting.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                const tE = new Date(meeting.end_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

                const titleEl = document.createElement('div');
                titleEl.className = 'event-card-title';
                const priorityPrefix = meeting.priority === 'important' ? '⚠️ ' : '';
                titleEl.textContent = `${priorityPrefix}${meeting.title}`;

                const timeEl = document.createElement('div');
                timeEl.className = 'event-card-time';
                timeEl.innerHTML = '<i class="fa-regular fa-clock"></i> ';
                timeEl.appendChild(document.createTextNode(`${tS} - ${tE}`));

                const pEl = document.createElement('div');
                pEl.className = 'event-card-participants';
                meeting.participants.slice(0, 3).forEach(p => {
                    const tag = document.createElement('span');
                    tag.className = 'p-tag';
                    tag.textContent = p;
                    pEl.appendChild(tag);
                });
                if (meeting.participants.length > 3) {
                    const tag = document.createElement('span');
                    tag.className = 'p-tag';
                    tag.textContent = `+${meeting.participants.length - 3}`;
                    pEl.appendChild(tag);
                }

                card.appendChild(titleEl);
                card.appendChild(timeEl);
                card.appendChild(pEl);
                card.addEventListener('click', () => openDetailsModal(meeting));
                col.appendChild(card);
            });
        }

        // Click on empty column area → open create modal with that day's date
        col.addEventListener('click', (e) => {
            if (e.target === col) openCreateModal(null, day);
        });

        DOM.weekColumnsContainer.appendChild(col);
    });
}

// ============================================================
// Agenda View
// ============================================================
function renderAgendaView() {
    DOM.agendaList.innerHTML = '';
    const filtered = getFilteredMeetings();

    if (filtered.length === 0) {
        const ph = document.createElement('div');
        ph.className = 'no-meetings-placeholder';
        ph.innerHTML = '<i class="fa-regular fa-calendar-xmark"></i>';
        const p = document.createElement('p');
        p.textContent = state.filterParticipant
            ? `Нет встреч с участием «${state.filterParticipant}»`
            : 'Нет запланированных встреч на ближайшие 30 дней.';
        ph.appendChild(p);
        DOM.agendaList.appendChild(ph);
        return;
    }

    const groups = {};
    filtered.forEach(m => {
        const key = new Date(m.start_time).toDateString();
        if (!groups[key]) groups[key] = { date: new Date(m.start_time), items: [] };
        groups[key].items.push(m);
    });

    Object.keys(groups).sort((a, b) => new Date(a) - new Date(b)).forEach(key => {
        const g = groups[key];
        const gDiv = document.createElement('div');
        gDiv.className = 'agenda-day-group';

        const divider = document.createElement('div');
        divider.className = 'agenda-date-divider';
        divider.innerText = g.date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
        gDiv.appendChild(divider);

        g.items.sort((a, b) => a.start_time.localeCompare(b.start_time)).forEach(meeting => {
            const tS = new Date(meeting.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const tE = new Date(meeting.end_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            const item = document.createElement('div');
            item.className = `agenda-item priority-${meeting.priority || 'normal'}`;

            const left = document.createElement('div');
            left.className = 'agenda-item-left';

            const titleEl = document.createElement('div');
            titleEl.className = 'agenda-item-title';
            const priorityPrefix = meeting.priority === 'important' ? '⚠️ ' : '';
            titleEl.textContent = `${priorityPrefix}${meeting.title}`;

            const metaEl = document.createElement('div');
            metaEl.className = 'agenda-item-meta';
            const pSpan = document.createElement('span');
            pSpan.innerHTML = '<i class="fa-regular fa-user"></i> ';
            pSpan.appendChild(document.createTextNode(meeting.participants.join(', ')));
            metaEl.appendChild(pSpan);

            left.appendChild(titleEl);
            left.appendChild(metaEl);

            const right = document.createElement('div');
            right.className = 'agenda-item-right';
            const timeEl = document.createElement('div');
            timeEl.className = 'agenda-item-time';
            timeEl.textContent = `${tS} — ${tE}`;
            right.appendChild(timeEl);

            // Priority badge
            const badge = document.createElement('span');
            badge.className = `priority-badge ${meeting.priority || 'normal'}`;
            badge.innerHTML = `<span class="priority-dot ${meeting.priority || 'normal'}"></span> ${meeting.priority === 'important' ? 'Очень важно' : 'Плановая'}`;
            right.appendChild(badge);

            item.appendChild(left);
            item.appendChild(right);
            item.addEventListener('click', () => openDetailsModal(meeting));
            gDiv.appendChild(item);
        });

        DOM.agendaList.appendChild(gDiv);
    });
}

// ============================================================
// Meeting Details Modal
// ============================================================
async function openDetailsModal(meeting) {
    state.selectedMeeting = meeting;

    DOM.detailTitle.textContent = meeting.title;

    const startObj  = new Date(meeting.start_time);
    const endObj    = new Date(meeting.end_time);
    const dateLabel = startObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const tS = startObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const tE = endObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    DOM.detailTime.innerHTML = '<i class="fa-regular fa-clock"></i> ';
    DOM.detailTime.appendChild(document.createTextNode(`${dateLabel}, ${tS} — ${tE}`));

    // Priority badge
    const p = meeting.priority || 'normal';
    DOM.detailPriority.innerHTML = '';
    const badge = document.createElement('span');
    badge.className = `priority-badge ${p}`;
    badge.innerHTML = `<span class="priority-dot ${p}"></span> ${p === 'important' ? '🔴 Очень важно' : '🔵 Плановая'}`;
    DOM.detailPriority.appendChild(badge);

    // Participants
    DOM.detailParticipants.innerHTML = '';
    meeting.participants.forEach(part => {
        const chip = document.createElement('span');
        chip.className = 'chip-participant';
        chip.innerHTML = '<i class="fa-solid fa-user-tag"></i> ';
        chip.appendChild(document.createTextNode(part));
        DOM.detailParticipants.appendChild(chip);
    });

    // Goal
    DOM.detailGoal.textContent = meeting.goal || '';
    DOM.detailGoal.className = `goal-result-text ${meeting.goal ? '' : 'empty'}`;
    if (!meeting.goal) DOM.detailGoal.textContent = 'Цель не указана';

    // Description
    DOM.detailDescription.textContent = meeting.description || 'Описание отсутствует';

    // Result
    DOM.detailResult.textContent = meeting.result || '';
    DOM.detailResult.className = `goal-result-text ${meeting.result ? '' : 'empty'}`;
    if (!meeting.result) DOM.detailResult.textContent = 'Результат ещё не заполнен';

    // Attachments
    renderAttachmentsList(meeting.attachments || []);
    DOM.attachmentUploadStatus.textContent = '';

    DOM.commentsList.innerHTML = '<div class="no-comments">Загрузка...</div>';
    DOM.modalDetails.classList.remove('id-hidden');

    await loadComments(meeting.id);
}

function renderAttachmentsList(attachments) {
    DOM.detailAttachmentsList.innerHTML = '';
    if (!attachments || attachments.length === 0) {
        DOM.detailAttachmentsList.innerHTML = '<li style="color:var(--text-muted);"><i class="fa-solid fa-ban" style="font-size:10px;"></i> Нет вложений</li>';
        return;
    }
    const base = state.apiUrl || (window.location.hostname.includes('github.io') || window.location.protocol.startsWith('file') ? 'http://192.168.1.2:8507' : window.location.origin);
    
    attachments.forEach(att => {
        const li = document.createElement('li');
        let icon = 'fa-file';
        if(att.filename.endsWith('.pdf')) icon = 'fa-file-pdf';
        if(att.filename.endsWith('.doc') || att.filename.endsWith('.docx')) icon = 'fa-file-word';
        if(att.filename.endsWith('.txt') || att.filename.endsWith('.md')) icon = 'fa-file-lines';
        
        li.innerHTML = `<i class="fa-regular ${icon}"></i> <a href="${base}${att.file_path}" target="_blank" rel="noopener noreferrer">${escapeHtml(att.filename)}</a>`;
        DOM.detailAttachmentsList.appendChild(li);
    });
}

// ============================================================
// Comments — XSS-safe via DOM API
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
            const div = document.createElement('div');
            div.className = 'comment-item';

            // Author avatar color based on name hash
            const hue = Math.abs(c.author.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)) % 360;

            const metaDiv = document.createElement('div');
            metaDiv.className = 'comment-meta';

            const authorSpan = document.createElement('span');
            authorSpan.className = 'comment-author';
            authorSpan.style.color = `hsl(${hue}, 65%, 65%)`;
            authorSpan.textContent = c.author;

            const timeSpan = document.createElement('span');
            timeSpan.className = 'comment-time';
            timeSpan.textContent = new Date(c.created_at).toLocaleString('ru-RU', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            });

            metaDiv.appendChild(authorSpan);
            metaDiv.appendChild(timeSpan);

            const textDiv = document.createElement('div');
            textDiv.className = 'comment-text';
            textDiv.textContent = c.text;

            div.appendChild(metaDiv);
            div.appendChild(textDiv);
            DOM.commentsList.appendChild(div);
        });

        DOM.commentsList.scrollTop = DOM.commentsList.scrollHeight;
    } catch {
        DOM.commentsList.innerHTML = '<div class="no-comments" style="color:var(--danger);">Ошибка загрузки.</div>';
    }
}

// ============================================================
// Toasts
// ============================================================
function showToast(title, message, type = 'success', conflicts = []) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check';

    let conflictsHtml = '';
    if (conflicts?.length > 0) {
        conflictsHtml = `<div style="margin-top:8px;">${conflicts.map(c => `
            <div class="conflict-item">
                <strong>${escapeHtml(c.participant)}</strong> занят(а) в "${escapeHtml(c.conflicting_meeting.title)}"
                (${escapeHtml(new Date(c.conflicting_meeting.start_time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))}
                – ${escapeHtml(new Date(c.conflicting_meeting.end_time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))})
            </div>`).join('')}</div>`;
    }

    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(title)}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
            ${conflictsHtml}
        </div>
        <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>`;

    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 200);
    });

    DOM.toastContainer.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 200);
        }
    }, type === 'success' ? 4000 : 8000);
}

// ============================================================
// Helpers
// ============================================================
function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth()    === d2.getMonth()    &&
           d1.getDate()     === d2.getDate();
}

function getWeekDays(date) {
    const t = new Date(date);
    const day = t.getDay();
    const diff = t.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(t.setDate(diff));
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start); d.setDate(start.getDate() + i); return d;
    });
}

function getMonthDays(date) {
    const y = date.getFullYear(), m = date.getMonth();
    const firstDay   = new Date(y, m, 1).getDay();
    const offset     = firstDay === 0 ? 6 : firstDay - 1;
    const lastDate   = new Date(y, m + 1, 0).getDate();
    const prevLast   = new Date(y, m, 0).getDate();
    const days = [];

    for (let i = offset - 1; i >= 0; i--) days.push({ date: new Date(y, m - 1, prevLast - i), isCurrentMonth: false });
    for (let i = 1; i <= lastDate; i++)   days.push({ date: new Date(y, m, i), isCurrentMonth: true });

    const total = days.length > 35 ? 42 : 35;
    for (let i = 1; i <= total - days.length; i++) days.push({ date: new Date(y, m + 1, i), isCurrentMonth: false });

    return days;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ============================================================
// Render Sidebar Upcoming Meetings
// ============================================================
function renderSidebarUpcomingList() {
    if (!DOM.sidebarUpcomingList) return;
    DOM.sidebarUpcomingList.innerHTML = '';

    const filtered = getFilteredMeetings();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Filter upcoming meetings (today onwards)
    const upcoming = filtered
        .filter(m => new Date(m.start_time) >= startOfToday)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));

    if (upcoming.length === 0) {
        DOM.sidebarUpcomingList.innerHTML = '<div style="color:var(--text-muted); font-size:11px; text-align:center; padding:12px 0;">Нет предстоящих встреч</div>';
        return;
    }

    upcoming.slice(0, 10).forEach(meeting => {
        const item = document.createElement('div');
        item.className = `event-pill priority-${meeting.priority || 'normal'}`;
        item.style.cssText = 'white-space: normal; padding: 6px 10px; cursor: pointer; display: flex; flex-direction: column; gap: 2px;';

        const titleDiv = document.createElement('div');
        titleDiv.style.cssText = 'font-weight: 600; font-size: 11px; word-break: break-word;';
        titleDiv.textContent = (meeting.priority === 'important' ? '⚠️ ' : '') + meeting.title;

        const startDt = new Date(meeting.start_time);
        const endDt   = new Date(meeting.end_time);
        const dayLabel = startDt.getDate() + ' ' + MONTHS_RU[startDt.getMonth()].substring(0,3).toLowerCase();
        const tS = startDt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const tE = endDt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        const timeDiv = document.createElement('div');
        timeDiv.style.cssText = 'font-size: 9px; opacity: 0.8;';
        timeDiv.textContent = `${dayLabel}, ${tS} - ${tE}`;

        item.appendChild(titleDiv);
        item.appendChild(timeDiv);

        item.addEventListener('click', () => openDetailsModal(meeting));
        DOM.sidebarUpcomingList.appendChild(item);
    });
}

// ============================================================
// Users and Tags Input Logic
// ============================================================

let usersListExpanded = false;

async function fetchUsers() {
    try {
        const res = await apiFetch('/api/users');
        if (res.ok) {
            state.users = await res.json();
            DOM.registeredUsersCount.textContent = `Зарегистрировано: ${state.users.length}`;
            renderUsersList();
        }
    } catch (e) {
        console.error('Failed to fetch users', e);
    }
}

function renderUsersList() {
    const container = document.getElementById('users-list-widget');
    const toggleBtn = document.getElementById('btn-toggle-users');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (state.users.length === 0) {
        toggleBtn.classList.add('id-hidden');
        return;
    }

    const limit = 3;
    const toShow = usersListExpanded ? state.users : state.users.slice(0, limit);
    
    toShow.forEach(u => {
        const div = document.createElement('div');
        div.className = 'event-pill priority-normal';
        div.style.cssText = 'padding: 4px 8px; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: space-between;';
        div.innerHTML = `<span><i class="fa-regular fa-user" style="margin-right:4px;"></i> ${escapeHtml(u.name)}</span>
                         <button class="btn-delete-user" title="Удалить пользователя"><i class="fa-solid fa-xmark"></i></button>`;
        
        const delBtn = div.querySelector('.btn-delete-user');
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Удалить пользователя ${u.name}?`)) {
                try {
                    const res = await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' });
                    if (res.ok) {
                        fetchAndRenderUsers();
                    } else {
                        alert('Ошибка при удалении пользователя');
                    }
                } catch(err) {
                    console.error(err);
                }
            }
        });

        div.addEventListener('click', () => {
            DOM.participantFilter.value = u.name;
            state.filterParticipant = u.name.toLowerCase();
            renderCurrentView();
            renderSidebarUpcomingList();
        });
        container.appendChild(div);
    });

    if (state.users.length > limit) {
        toggleBtn.classList.remove('id-hidden');
        toggleBtn.textContent = usersListExpanded ? 'Скрыть' : `Показать всех (${state.users.length})`;
        toggleBtn.onclick = () => {
            usersListExpanded = !usersListExpanded;
            renderUsersList();
        };
    } else {
        toggleBtn.classList.add('id-hidden');
    }
}

function initTagsInput() {
    DOM.inputRecurrence.addEventListener('change', (e) => {
        if (e.target.value === 'none') {
            DOM.groupRecurrenceEnd.classList.add('id-hidden');
            if (DOM.inputRecurrenceEnd) DOM.inputRecurrenceEnd.removeAttribute('required');
        } else {
            DOM.groupRecurrenceEnd.classList.remove('id-hidden');
            if (DOM.inputRecurrenceEnd) DOM.inputRecurrenceEnd.setAttribute('required', 'true');
        }
    });

    const renderTags = () => {
        DOM.participantsContainer.querySelectorAll('.participant-tag').forEach(el => el.remove());
        state.selectedParticipants.forEach((p, idx) => {
            const tag = document.createElement('div');
            tag.className = 'participant-tag';
            tag.innerHTML = `<span>${escapeHtml(p)}</span><span class="remove-tag" data-idx="${idx}"><i class="fa-solid fa-xmark"></i></span>`;
            DOM.participantsContainer.insertBefore(tag, DOM.inputParticipantSearch);
        });
        document.getElementById('input-participants').value = state.selectedParticipants.join(',');
    };

    DOM.participantsContainer.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.remove-tag');
        if (removeBtn) {
            const idx = parseInt(removeBtn.dataset.idx, 10);
            state.selectedParticipants.splice(idx, 1);
            renderTags();
            DOM.inputParticipantSearch.focus();
        } else {
            DOM.inputParticipantSearch.focus();
        }
    });

    const hideSuggestions = () => {
        DOM.participantsSuggestions.classList.add('id-hidden');
    };

    const showSuggestions = (query) => {
        const q = query.toLowerCase().trim();
        const matches = state.users.filter(u => u.name.toLowerCase().includes(q) && !state.selectedParticipants.includes(u.name));
        
        DOM.participantsSuggestions.innerHTML = '';
        if (matches.length === 0) {
            if (q.length > 0) {
                const addDiv = document.createElement('div');
                addDiv.className = 'suggestion-item';
                addDiv.textContent = `Добавить "${q}"`;
                addDiv.addEventListener('mousedown', () => {
                    addTag(q);
                });
                DOM.participantsSuggestions.appendChild(addDiv);
                DOM.participantsSuggestions.classList.remove('id-hidden');
            } else {
                hideSuggestions();
            }
            return;
        }

        matches.forEach(u => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.textContent = u.name;
            div.addEventListener('mousedown', (e) => {
                e.preventDefault();
                addTag(u.name);
            });
            DOM.participantsSuggestions.appendChild(div);
        });
        DOM.participantsSuggestions.classList.remove('id-hidden');
    };

    const addTag = (name) => {
        const trimmed = name.trim();
        if (trimmed && !state.selectedParticipants.includes(trimmed)) {
            state.selectedParticipants.push(trimmed);
            renderTags();
        }
        DOM.inputParticipantSearch.value = '';
        hideSuggestions();
    };

    DOM.inputParticipantSearch.addEventListener('input', (e) => showSuggestions(e.target.value));
    DOM.inputParticipantSearch.addEventListener('focus', (e) => showSuggestions(e.target.value));
    DOM.inputParticipantSearch.addEventListener('blur', () => setTimeout(hideSuggestions, 100));

    DOM.inputParticipantSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag(e.target.value);
        } else if (e.key === 'Backspace' && e.target.value === '' && state.selectedParticipants.length > 0) {
            state.selectedParticipants.pop();
            renderTags();
        }
    });

    // Modal Add User
    DOM.btnAddUser.addEventListener('click', () => {
        DOM.modalAddUser.classList.remove('id-hidden');
        document.getElementById('input-new-user-name').focus();
    });

    DOM.btnCloseAddUser.addEventListener('click', () => DOM.modalAddUser.classList.add('id-hidden'));
    DOM.btnCancelAddUser.addEventListener('click', () => DOM.modalAddUser.classList.add('id-hidden'));

    DOM.formAddUser.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('input-new-user-name');
        const name = nameInput.value.trim();
        if (!name) return;

        try {
            const btn = DOM.formAddUser.querySelector('button[type="submit"]');
            btn.disabled = true;
            const res = await apiFetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (res.ok) {
                showToast("Успех", "Пользователь добавлен", "success");
                await fetchUsers();
                DOM.modalAddUser.classList.add('id-hidden');
                nameInput.value = '';
            } else {
                const err = await res.json();
                showToast("Ошибка", err.detail || "Не удалось добавить", "error");
            }
        } catch (err) {
            showToast("Ошибка", "Сетевая ошибка", "error");
        } finally {
            DOM.formAddUser.querySelector('button[type="submit"]').disabled = false;
        }
    });

    // Override openCreateModal to properly initialize tags
    const _oldOpenCreateModal = window.openCreateModal;
    window.openCreateModal = (meeting = null, forcedDateStr = null) => {
        if (typeof _oldOpenCreateModal === 'function') _oldOpenCreateModal(meeting, forcedDateStr);
        state.selectedParticipants = meeting && meeting.participants ? [...meeting.participants] : [];
        if (meeting) {
            DOM.inputRecurrence.value = 'none';
            DOM.inputRecurrence.disabled = true;
            DOM.groupRecurrenceEnd.classList.add('id-hidden');
        } else {
            DOM.inputRecurrence.value = 'none';
            DOM.inputRecurrence.disabled = false;
            DOM.groupRecurrenceEnd.classList.add('id-hidden');
            if (DOM.inputRecurrenceEnd) DOM.inputRecurrenceEnd.value = '';
        }
        renderTags();
    };
}
