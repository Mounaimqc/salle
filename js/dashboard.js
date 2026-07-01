/**
 * SallePro - Dashboard Page Logic (Firebase Firestore Module)
 */

import { db, auth } from "./firebase.js";
import { showToast, currentCurrencySymbol } from "./app.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Helper to format date as DD/MM/YYYY
function formatDateFR(dateStr) {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

console.log('dashboard.js: Imports loaded successfully');

let cashflowChart = null;
let expensesPieChart = null;
let currentCalDate = new Date();
let allReservations = [];

document.addEventListener('DOMContentLoaded', () => {
  try {
    updateLiveDate();
  } catch (error) {
    console.error('dashboard.js: Failed to update live date:', error);
  }
});

// Wait for auth session before loading data
window.addEventListener('authSessionLoaded', async () => {
  console.log('dashboard.js: authSessionLoaded event received');
  try {
    const user = JSON.parse(sessionStorage.getItem('sp_current_user') || '{}');
    const welcomeEl = document.getElementById('welcome-text');
    if (welcomeEl && user.name) {
      welcomeEl.innerText = `Ravi de vous revoir, ${user.name}`;
    }
    
    await initDashboard();
  } catch (error) {
    console.error('dashboard.js: Dashboard page initialization failed:', error);
    const { showFatalError } = await import("./auth.js");
    showFatalError(error);
  }
});

function updateLiveDate() {
  const el = document.getElementById('current-live-date');
  if (!el) return;
  const today = new Date();
  el.innerText = today.toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

async function initDashboard() {
  console.log('dashboard.js: Initializing dashboard widgets');

  // Load and listen to each widget independently so one widget crashing won't block the page
  try {
    listenToReservations();
  } catch (err) {
    console.error("dashboard.js: Failed to start reservations listener:", err);
  }

  try {
    listenToClients();
  } catch (err) {
    console.error("dashboard.js: Failed to start clients listener:", err);
  }

  try {
    listenToStock();
  } catch (err) {
    console.error("dashboard.js: Failed to start stock listener:", err);
  }

  try {
    listenToExpenses();
  } catch (err) {
    console.error("dashboard.js: Failed to start expenses listener:", err);
  }
}

// --- Real-time Reservations listener ---
function listenToReservations() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  const q = query(collection(db, "users", userId, "reservations"), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    allReservations = [];
    snapshot.forEach(doc => {
      allReservations.push({ id: doc.id, ...doc.data() });
    });

    try {
      updateReservationKPIs();
    } catch (err) {
      console.error("dashboard.js: Failed to update reservations KPIs:", err);
    }

    try {
      updateRecentBookingsTable();
    } catch (err) {
      console.error("dashboard.js: Failed to update recent bookings table:", err);
    }

    try {
      renderCalendarWidget();
    } catch (err) {
      console.error("dashboard.js: Failed to render calendar widget:", err);
    }

    try {
      updateCashflowChart();
    } catch (err) {
      console.error("dashboard.js: Failed to update cashflow chart:", err);
    }
  }, (err) => {
    console.error("dashboard.js: Error listening to reservations:", err);
  });
}

// --- Real-time Clients listener ---
function listenToClients() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  onSnapshot(collection(db, "users", userId, "clients"), (snapshot) => {
    const el = document.getElementById('kpi-clients');
    if (el) el.innerText = snapshot.size;
  }, (err) => {
    console.error("dashboard.js: Error listening to clients:", err);
  });
}

// --- Real-time Stock listener for low-stock KPI ---
function listenToStock() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  onSnapshot(collection(db, "users", userId, "stock"), (snapshot) => {
    let lowCount = 0;
    snapshot.forEach(doc => {
      const item = doc.data();
      if (item.quantity <= item.minimumQuantity) lowCount++;
    });

    const el = document.getElementById('kpi-stock');
    const iconEl = document.getElementById('kpi-stock-icon');
    const trendEl = document.getElementById('kpi-stock-trend');

    if (el) el.innerText = lowCount;
    if (lowCount > 0 && iconEl) {
      iconEl.style.backgroundColor = 'var(--danger-light)';
      iconEl.style.color = 'var(--danger)';
    } else if (iconEl) {
      iconEl.style.backgroundColor = '';
      iconEl.style.color = '';
    }
    if (trendEl) {
      trendEl.innerHTML = lowCount > 0
        ? `<span style="color:var(--danger);font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> Approvisionnement requis</span>`
        : `<span>Tous les stocks sont OK</span>`;
    }
  }, (err) => {
    console.error("dashboard.js: Error listening to stock:", err);
  });
}

// --- Real-time Expenses listener ---
function listenToExpenses() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  onSnapshot(collection(db, "users", userId, "expenses"), (snapshot) => {
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let monthlyExpenses = 0;
    const categorySums = {};

    snapshot.forEach(doc => {
      const exp = doc.data();
      if (exp.date && exp.date.startsWith(monthPrefix)) {
        monthlyExpenses += exp.amount || 0;
        categorySums[exp.category] = (categorySums[exp.category] || 0) + (exp.amount || 0);
      }
    });

    const sym = currentCurrencySymbol || '€';
    const el = document.getElementById('kpi-expenses');
    if (el) el.innerText = `${monthlyExpenses.toLocaleString()} ${sym}`;

    try {
      updateExpensesPieChart(categorySums);
    } catch (err) {
      console.error("dashboard.js: Failed to update expenses pie chart:", err);
    }
  }, (err) => {
    console.error("dashboard.js: Error listening to expenses:", err);
  });
}

// --- KPI calculations from allReservations ---
function updateReservationKPIs() {
  const sym = currentCurrencySymbol || '€';
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayStr = now.toISOString().split('T')[0];

  const active = allReservations.filter(r => r.status !== 'Annulé');

  // KPI: total reservations
  const kpiRes = document.getElementById('kpi-reservations');
  if (kpiRes) kpiRes.innerText = active.length;

  // KPI: monthly revenue
  const monthRev = allReservations
    .filter(r => r.status === 'Confirmé' && r.startDate && r.startDate.startsWith(monthPrefix))
    .reduce((sum, r) => sum + ((r.totalAmount || 0) - (r.remainingAmount || 0)), 0);

  const kpiRev = document.getElementById('kpi-revenue');
  if (kpiRev) kpiRev.innerText = `${monthRev.toLocaleString()} ${sym}`;

  // KPI: next upcoming confirmed event
  const future = allReservations
    .filter(r => r.status === 'Confirmé' && r.endDate && r.endDate >= todayStr)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

  const kpiNext = document.getElementById('kpi-next-event');
  const kpiNextDate = document.getElementById('kpi-next-event-date');

  if (future.length > 0) {
    const next = future[0];
    if (kpiNext) kpiNext.innerText = `${next.eventType || 'Événement'} — ${next.clientName || 'Client'}`;
    if (kpiNextDate && next.startDate && next.endDate) {
      kpiNextDate.innerHTML = `<i class="fa-solid fa-calendar"></i> Du ${formatDateFR(next.startDate)} au ${formatDateFR(next.endDate)}`;
    }
  } else {
    if (kpiNext) kpiNext.innerText = 'Aucun';
    if (kpiNextDate) kpiNextDate.innerText = 'Pas d\'événement planifié';
  }
}

// --- Update recent reservations table ---
function updateRecentBookingsTable() {
  const tbody = document.getElementById('recent-bookings-tbody');
  if (!tbody) return;

  const sym = currentCurrencySymbol || '€';
  const recent = [...allReservations].slice(0, 5);

  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Aucune réservation.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  recent.forEach(res => {
    let badge = 'badge-warning';
    if (res.status === 'Confirmé') badge = 'badge-success';
    if (res.status === 'Annulé') badge = 'badge-danger';

    const d = res.startDate && res.endDate ? `Du ${formatDateFR(res.startDate)} au ${formatDateFR(res.endDate)}` : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;">${res.clientName || '—'}</td>
      <td style="font-size: 0.85rem;">${d}</td>
      <td style="color:var(--success);font-weight:600;">${(res.deposit || 0).toLocaleString()} ${sym}</td>
      <td style="color:var(--danger);font-weight:700;">${(res.remainingAmount || 0).toLocaleString()} ${sym}</td>
      <td><span class="badge ${badge}">${res.status || 'En attente'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Calendar Widget ---
function renderCalendarWidget() {
  const grid = document.getElementById('calendar-days-grid');
  const monthYearLabel = document.getElementById('cal-month-year');
  if (!grid) return;

  const year = currentCalDate.getFullYear();
  const month = currentCalDate.getMonth();

  const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  if (monthYearLabel) monthYearLabel.innerText = `${monthNames[month]} ${year}`;

  grid.innerHTML = '';
  const weekdays = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  weekdays.forEach(d => {
    const el = document.createElement('div');
    el.className = 'calendar-day-label';
    el.innerText = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const adjustedFirst = firstDay === 0 ? 6 : firstDay - 1;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  const monthBookings = allReservations.filter(r =>
    r.eventDate && r.eventDate.startsWith(monthPrefix) && r.status !== 'Annulé'
  );

  for (let i = 0; i < adjustedFirst; i++) {
    const el = document.createElement('div');
    el.className = 'calendar-day-cell empty';
    grid.appendChild(el);
  }

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell';
    cell.innerHTML = `<span>${day}</span>`;

    if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === day) {
      cell.classList.add('today');
    }

    const booking = allReservations.find(r =>
      r.status !== 'Annulé' &&
      r.startDate && r.endDate &&
      r.startDate <= dateStr &&
      r.endDate >= dateStr
    );

    if (booking) {
      const dot = document.createElement('div');
      dot.className = 'day-event-dot ' + (booking.status === 'Confirmé' ? 'reserved' : 'pending');
      cell.appendChild(dot);
    }

    cell.onclick = () => {
      document.querySelectorAll('.calendar-day-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      try {
        showDayDetails(dateStr, booking);
      } catch (err) {
        console.error("dashboard.js: Failed to show day details:", err);
      }
    };

    grid.appendChild(cell);
  }

  // Calendar nav buttons
  const prevBtn = document.getElementById('cal-prev-btn');
  const nextBtn = document.getElementById('cal-next-btn');
  if (prevBtn) prevBtn.onclick = () => { currentCalDate.setMonth(month - 1); renderCalendarWidget(); };
  if (nextBtn) nextBtn.onclick = () => { currentCalDate.setMonth(month + 1); renderCalendarWidget(); };
}

function showDayDetails(dateStr, booking) {
  const label = document.getElementById('cal-selected-day-label');
  const content = document.getElementById('cal-details-content');
  const sym = currentCurrencySymbol || '€';

  if (!content) return;

  const dateFormatted = new Date(dateStr).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  if (label) label.innerText = dateFormatted;

  if (!booking) {
    content.innerHTML = `
      <div class="no-event-placeholder">
        <i class="fa-solid fa-calendar-check" style="color:var(--success);"></i>
        <span style="color:var(--success);font-weight:600;">Salle Disponible</span>
        <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="window.location.href='reservations.html?newDate=${dateStr}'">Réserver</button>
      </div>`;
    return;
  }

  const statusBadge = booking.status === 'Confirmé'
    ? `<span class="badge badge-success">Confirmé</span>`
    : `<span class="badge badge-warning">En attente</span>`;

  content.innerHTML = `
    <div class="event-details-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-weight:700;color:var(--color-secondary);">${booking.eventType || 'Événement'}</span>
        ${statusBadge}
      </div>
      <div class="event-details-row"><span>Client:</span><span>${booking.clientName || '—'}</span></div>
      <div class="event-details-row"><span>Téléphone:</span><span>${booking.phone || '—'}</span></div>
      <div class="event-details-row"><span>Période:</span><span>Du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}</span></div>
      <div class="event-details-row"><span>Horaires:</span><span>${booking.entryTime || '—'} à ${booking.exitTime || '—'} (${booking.duration || '—'})</span></div>
      <div class="event-details-row"><span>Invités:</span><span>${booking.guests || 0} pers.</span></div>
      <div class="event-details-row"><span>Total:</span><span>${(booking.totalAmount || 0).toLocaleString()} ${sym}</span></div>
      <div class="event-details-row"><span>Reste dû:</span>
        <span style="color:${booking.remainingAmount > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:700;">
          ${(booking.remainingAmount || 0).toLocaleString()} ${sym}
        </span>
      </div>
      ${booking.notes ? `<div style="margin-top:8px;font-size:0.78rem;color:var(--text-muted);border-top:1px solid var(--border-color);padding-top:8px;">${booking.notes}</div>` : ''}
    </div>`;
}

// --- Charts ---
function updateCashflowChart() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#1e293b' : '#e2e8f0';
  const sym = currentCurrencySymbol || '€';

  const ctx = document.getElementById('cashflowChart');
  if (!ctx) return;

  const monthNames = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const year = new Date().getFullYear();
  const revenues = Array(12).fill(0);

  allReservations.forEach(r => {
    if (r.status === 'Confirmé' && r.startDate) {
      const d = new Date(r.startDate);
      if (d.getFullYear() === year) {
        revenues[d.getMonth()] += (r.totalAmount || 0) - (r.remainingAmount || 0);
      }
    }
  });

  if (cashflowChart) cashflowChart.destroy();

  cashflowChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: monthNames,
      datasets: [{
        label: `Revenus (${sym})`,
        data: revenues,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 3,
        pointBackgroundColor: '#f59e0b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor, font: { family: 'Outfit', size: 12 } } } },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Outfit' } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Outfit' } } }
      }
    }
  });
}

function updateExpensesPieChart(categorySums) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  const ctx = document.getElementById('expensesPieChart');
  if (!ctx) return;

  const categories = Object.keys(categorySums);
  const values = Object.values(categorySums);
  const colors = ['#fb7185','#60a5fa','#34d399','#fbbf24','#a78bfa','#22d3ee','#94a3b8'];

  if (expensesPieChart) expensesPieChart.destroy();

  expensesPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, categories.length),
        borderWidth: isDark ? 2 : 1,
        borderColor: isDark ? '#0f172a' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: textColor, font: { family: 'Outfit', size: 11 } }
        }
      },
      cutout: '65%'
    }
  });
}

// Re-render charts when theme changes
window.addEventListener('spSettingsUpdated', () => {
  if (allReservations.length > 0) {
    try {
      updateCashflowChart();
    } catch (err) {
      console.error("dashboard.js: Failed to update cashflow chart on theme change:", err);
    }
  }
});
