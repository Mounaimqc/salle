/**
 * SallePro - Dashboard Page Logic
 */

let cashflowChart = null;
let expensesPieChart = null;
let currentCalDate = new Date(2026, 5, 1); // Focused on June 2026 (Month is 0-indexed, so 5 = June)

document.addEventListener('DOMContentLoaded', () => {
  // Set User Greeting
  const user = JSON.parse(localStorage.getItem('sp_logged_user'));
  if (user) {
    document.getElementById('welcome-text').innerText = `Ravi de vous revoir, ${user.name}`;
  }

  // Update Live Time Display
  updateLiveDate();

  // Load KPI metrics
  loadKPIs();

  // Load Charts
  initDashboardCharts();

  // Load Calendar
  renderCalendarWidget();

  // Load Recent Table
  loadRecentReservations();

  // Listen to Theme Changes to refresh charts colors
  window.addEventListener('themeChanged', () => {
    if (cashflowChart) cashflowChart.destroy();
    if (expensesPieChart) expensesPieChart.destroy();
    initDashboardCharts();
  });
});

function updateLiveDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const today = new Date(2026, 5, 30); // Using user's current date: June 30, 2026
  document.getElementById('current-live-date').innerText = today.toLocaleDateString('fr-FR', options);
}

/**
 * Calculate and display KPI numbers
 */
function loadKPIs() {
  const reservations = db.getTable('reservations');
  const clients = db.getTable('clients');
  const employees = db.getTable('employees');
  const stock = db.getTable('stock');
  const expenses = db.getTable('expenses');
  const settings = db.getTable('settings');
  const currency = settings.currency || '€';

  // 1. Total active bookings count (Confirmé or En attente)
  const activeReservations = reservations.filter(r => r.status !== 'Annulé');
  document.getElementById('kpi-reservations').innerText = activeReservations.length;
  
  // Trend: Bookings in June 2026
  const juneBookings = activeReservations.filter(r => r.eventDate.startsWith('2026-06'));
  document.getElementById('kpi-reservations-trend').innerHTML = `<i class="fa-solid fa-calendar-day"></i> <span>${juneBookings.length} événement(s) ce mois-ci</span>`;

  // 2. Revenue = Sum of (totalAmount - remainingAmount) representing money actually paid in.
  const totalRevenue = reservations
    .filter(r => r.status === 'Confirmé')
    .reduce((sum, r) => sum + (r.totalAmount - r.remainingAmount), 0);
  document.getElementById('kpi-revenue').innerText = `${totalRevenue.toLocaleString()} ${currency}`;

  // 3. Expenses = Sum of all expenses in June 2026
  const juneExpenses = expenses
    .filter(e => e.date.startsWith('2026-06'))
    .reduce((sum, e) => sum + e.amount, 0);
  
  const mayExpenses = expenses
    .filter(e => e.date.startsWith('2026-05'))
    .reduce((sum, e) => sum + e.amount, 0);

  document.getElementById('kpi-expenses').innerText = `${juneExpenses.toLocaleString()} ${currency}`;
  const expDiff = juneExpenses - mayExpenses;
  const expTrendSpan = document.getElementById('kpi-expenses-trend');
  if (expDiff <= 0) {
    expTrendSpan.className = 'metric-card-trend up';
    expTrendSpan.innerHTML = `<i class="fa-solid fa-arrow-down"></i> <span>Baisse de charges ce mois</span>`;
  } else {
    expTrendSpan.className = 'metric-card-trend down';
    expTrendSpan.innerHTML = `<i class="fa-solid fa-arrow-up"></i> <span>Hausse de charges ce mois</span>`;
  }

  // 4. Employees count
  const activeStaff = employees.filter(e => e.status === 'Actif');
  document.getElementById('kpi-employees').innerText = activeStaff.length;

  // 5. Stock alerts count
  const lowStock = stock.filter(item => item.quantity <= item.minStockAlert);
  const stockAlertVal = document.getElementById('kpi-stock-alerts');
  stockAlertVal.innerText = lowStock.length;
  if (lowStock.length > 0) {
    stockAlertVal.style.color = 'var(--danger)';
    document.getElementById('kpi-stock-icon').style.backgroundColor = 'var(--danger-light)';
    document.getElementById('kpi-stock-icon').style.color = 'var(--danger)';
    document.getElementById('kpi-stock-trend').innerHTML = `<span style="color: var(--danger); font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> Approvisionnement requis</span>`;
  } else {
    stockAlertVal.style.color = 'var(--text-main)';
    document.getElementById('kpi-stock-icon').style.backgroundColor = 'var(--bg-surface-hover)';
    document.getElementById('kpi-stock-icon').style.color = 'var(--text-main)';
    document.getElementById('kpi-stock-trend').innerHTML = `<span>Tous les stocks sont OK</span>`;
  }

  // 6. Next Upcoming Event from 2026-06-30 onwards
  const todayStr = '2026-06-30';
  const futureEvents = reservations
    .filter(r => r.status === 'Confirmé' && r.eventDate >= todayStr)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  if (futureEvents.length > 0) {
    const nextEvent = futureEvents[0];
    const client = clients.find(c => c.id === nextEvent.clientId);
    document.getElementById('kpi-next-event-title').innerText = `${nextEvent.eventType} - ${client ? client.name : 'Client'}`;
    
    // Formatting date
    const dateObj = new Date(nextEvent.eventDate);
    const dateFormatted = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    document.getElementById('kpi-next-event-date').innerHTML = `<i class="fa-solid fa-calendar"></i> <span>Prévu pour le ${dateFormatted}</span>`;
  } else {
    document.getElementById('kpi-next-event-title').innerText = 'Aucun';
    document.getElementById('kpi-next-event-date').innerText = 'Pas d\'événement planifié';
  }
}

/**
 * Initialize charts using Chart.js
 */
function initDashboardCharts() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  
  // Theme Variables
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#1e293b' : '#e2e8f0';

  // Get data
  const reservations = db.getTable('reservations');
  const expenses = db.getTable('expenses');

  // Let's summarize Revenue & Expenses for Jan - June 2026
  const monthsLabels = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin'];
  const monthsPrefixes = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
  
  const revenuesData = [0, 0, 0, 0, 0, 0];
  const expensesData = [0, 0, 0, 0, 0, 0];

  monthsPrefixes.forEach((prefix, i) => {
    // Revenues paid in this month
    revenuesData[i] = reservations
      .filter(r => r.status === 'Confirmé' && r.eventDate.startsWith(prefix))
      .reduce((sum, r) => sum + (r.totalAmount - r.remainingAmount), 0);

    // Expenses made in this month
    expensesData[i] = expenses
      .filter(e => e.date.startsWith(prefix))
      .reduce((sum, e) => sum + e.amount, 0);
  });

  // 1. Cashflow Chart (Line Chart)
  const ctx1 = document.getElementById('cashflowChart');
  if (ctx1) {
    cashflowChart = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: monthsLabels,
        datasets: [
          {
            label: 'Revenus (€)',
            data: revenuesData,
            borderColor: '#f59e0b', // Gold
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 3,
            pointBackgroundColor: '#f59e0b'
          },
          {
            label: 'Charges (€)',
            data: expensesData,
            borderColor: isDark ? '#38bdf8' : '#0f172a', // Light Blue or Dark Navy
            backgroundColor: 'rgba(15, 23, 42, 0.02)',
            fill: false,
            tension: 0.4,
            borderWidth: 3,
            pointBackgroundColor: isDark ? '#38bdf8' : '#0f172a'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: textColor, font: { family: 'Outfit', size: 12 } }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Outfit' } }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Outfit' } }
          }
        }
      }
    });
  }

  // 2. Expenses breakdown (Doughnut Chart)
  // Summarize charges by categories for June 2026
  const categories = ['Électricité', 'Eau', 'Internet', 'Salaires', 'Maintenance', 'Achats', 'Divers'];
  const categorySums = categories.map(cat => {
    return expenses
      .filter(e => e.category === cat && e.date.startsWith('2026-06'))
      .reduce((sum, e) => sum + e.amount, 0);
  });

  const ctx2 = document.getElementById('expensesPieChart');
  if (ctx2) {
    expensesPieChart = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: categories,
        datasets: [{
          data: categorySums,
          backgroundColor: [
            '#fb7185', // Electric
            '#60a5fa', // Water
            '#34d399', // Internet
            '#fbbf24', // Salaries
            '#a78bfa', // Maintenance
            '#22d3ee', // Purchases
            '#94a3b8'  // Miscellaneous
          ],
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
}

/**
 * Calendar Widget Rendering
 */
function renderCalendarWidget() {
  const daysGrid = document.getElementById('calendar-days-grid');
  const monthYearLabel = document.getElementById('cal-month-year');
  if (!daysGrid) return;

  const year = currentCalDate.getFullYear();
  const month = currentCalDate.getMonth(); // 0-indexed

  // Labels
  const monthsNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  monthYearLabel.innerText = `${monthsNames[month]} ${year}`;

  daysGrid.innerHTML = '';

  // Weekdays header
  const weekdays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  weekdays.forEach(day => {
    const el = document.createElement('div');
    el.className = 'calendar-day-label';
    el.innerText = day;
    daysGrid.appendChild(el);
  });

  // Calculate grid offsets
  const firstDayIndex = new Date(year, month, 1).getDay(); // Sunday is 0
  const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Adjust Monday as 0
  const totalDays = new Date(year, month + 1, 0).getDate();

  // Empty cells at start
  for (let i = 0; i < adjustedFirstDay; i++) {
    const el = document.createElement('div');
    el.className = 'calendar-day-cell empty';
    daysGrid.appendChild(el);
  }

  // Get reservations of this month
  const reservations = db.getTable('reservations');
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthBookings = reservations.filter(r => r.eventDate.startsWith(monthPrefix) && r.status !== 'Annulé');

  // Today marker
  const today = new Date(2026, 5, 30);
  const isCurrentMonthYear = today.getFullYear() === year && today.getMonth() === month;

  // Render days
  for (let day = 1; day <= totalDays; day++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day-cell';
    dayCell.innerHTML = `<span>${day}</span>`;
    
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Check if day is today
    if (isCurrentMonthYear && today.getDate() === day) {
      dayCell.classList.add('today');
    }

    // Check for reservations on this day
    const booking = monthBookings.find(r => r.eventDate === dateString);
    if (booking) {
      const dot = document.createElement('div');
      dot.className = 'day-event-dot';
      if (booking.status === 'Confirmé') {
        dot.classList.add('reserved'); // Red dot
      } else if (booking.status === 'En attente') {
        dot.classList.add('pending'); // Orange dot
      }
      dayCell.appendChild(dot);
      
      // Store event data
      dayCell.dataset.bookingId = booking.id;
    }

    // Click Day event
    dayCell.addEventListener('click', () => {
      // Highlight selected cell
      document.querySelectorAll('.calendar-day-cell').forEach(c => c.classList.remove('selected'));
      dayCell.classList.add('selected');
      showDayDetails(dateString, booking);
    });

    daysGrid.appendChild(dayCell);
  }

  // Hook calendar navigation buttons
  document.getElementById('cal-prev-btn').onclick = () => {
    currentCalDate.setMonth(currentCalDate.getMonth() - 1);
    renderCalendarWidget();
  };
  document.getElementById('cal-next-btn').onclick = () => {
    currentCalDate.setMonth(currentCalDate.getMonth() + 1);
    renderCalendarWidget();
  };
}

/**
 * Display details of booking on calendar click
 */
function showDayDetails(dateString, booking) {
  const label = document.getElementById('cal-selected-day-label');
  const content = document.getElementById('cal-details-content');

  // Format date
  const dateObj = new Date(dateString);
  const formattedDate = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  label.innerText = formattedDate;

  if (!booking) {
    content.innerHTML = `
      <div class="no-event-placeholder">
        <i class="fa-solid fa-calendar-check" style="color: var(--success);"></i>
        <span style="color: var(--success); font-weight:600;">Salle Disponible</span>
        <span style="font-size:0.8rem;">Aucune réservation enregistrée pour cette date.</span>
        <button class="btn btn-secondary btn-sm" style="margin-top: 10px;" onclick="goToNewReservation('${dateString}')">Réserver ce jour</button>
      </div>
    `;
    return;
  }

  const client = db.getOne('clients', booking.clientId) || { name: 'Client inconnu', phone: '-' };
  const settings = db.getTable('settings');
  const currency = settings.currency || '€';

  let statusBadge = `<span class="badge badge-warning">En attente</span>`;
  if (booking.status === 'Confirmé') {
    statusBadge = `<span class="badge badge-success">Confirmé</span>`;
  }

  content.innerHTML = `
    <div class="event-details-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:700; font-size:1rem; color:var(--color-secondary);">${booking.eventType}</span>
        ${statusBadge}
      </div>
      
      <div class="event-details-row">
        <span>Client:</span>
        <span>${client.name}</span>
      </div>
      <div class="event-details-row">
        <span>Téléphone:</span>
        <span>${client.phone}</span>
      </div>
      <div class="event-details-row">
        <span>Invités:</span>
        <span>${booking.guests} personnes</span>
      </div>
      <div class="event-details-row">
        <span>Montant Total:</span>
        <span>${booking.totalAmount} ${currency}</span>
      </div>
      <div class="event-details-row">
        <span>Acompte Versé:</span>
        <span>${booking.deposit} ${currency}</span>
      </div>
      <div class="event-details-row">
        <span>Reste à payer:</span>
        <span style="color: ${booking.remainingAmount > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight:700;">
          ${booking.remainingAmount} ${currency}
        </span>
      </div>
      
      ${booking.notes ? `
      <div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border-color); font-size:0.8rem; color:var(--text-muted);">
        <strong>Notes:</strong><br>${booking.notes}
      </div>` : ''}

      <div style="margin-top:12px; display:flex; gap:10px;">
        <button class="btn btn-outline btn-sm" style="flex:1;" onclick="window.location.href='reservations.html?search=${encodeURIComponent(client.name)}'">
          <i class="fa-solid fa-eye"></i> Ouvrir
        </button>
      </div>
    </div>
  `;
}

function goToNewReservation(dateString) {
  window.location.href = `reservations.html?newDate=${dateString}`;
}

/**
 * Load list of 5 recent bookings
 */
function loadRecentReservations() {
  const tbody = document.getElementById('recent-bookings-tbody');
  if (!tbody) return;

  const reservations = db.getTable('reservations');
  const clients = db.getTable('clients');
  const settings = db.getTable('settings');
  const currency = settings.currency || '€';

  // Sort reservations by bookingDate or eventDate descending, take top 5
  const sorted = [...reservations]
    .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate))
    .slice(0, 5);

  tbody.innerHTML = '';

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">Aucune réservation enregistrée.</td></tr>`;
    return;
  }

  sorted.forEach(res => {
    const client = clients.find(c => c.id === res.clientId) || { name: 'Inconnu' };
    
    // Status Badge
    let statusClass = 'badge-warning';
    if (res.status === 'Confirmé') statusClass = 'badge-success';
    if (res.status === 'Annulé') statusClass = 'badge-danger';

    // Format date
    const d = new Date(res.eventDate);
    const formattedEventDate = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600;">${client.name}</td>
      <td>${res.eventType}</td>
      <td>${formattedEventDate}</td>
      <td style="font-weight: 700; color: var(--color-secondary);">${res.totalAmount} ${currency}</td>
      <td><span class="badge ${statusClass}">${res.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}
