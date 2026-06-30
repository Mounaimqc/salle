/**
 * SallePro - Reports Page Logic (Firebase Firestore Module)
 */

import { db } from "./firebase.js";
import { showToast, currentCurrencySymbol } from "./app.js";
import {
  collection, onSnapshot, doc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

console.log('reports.js: Imports loaded successfully');

let profitChart = null;
let allReservations = [];
let allExpenses = [];
let currentSettings = {};

window.addEventListener('authSessionLoaded', async () => {
  console.log('reports.js: authSessionLoaded event received');
  try {
    await initReportsPage();
  } catch (error) {
    console.error('reports.js: Page initialization failed:', error);
    const { showFatalError } = await import("./auth.js");
    showFatalError(error);
  }
});

async function initReportsPage() {
  console.log('reports.js: Initializing reports page');

  try {
    listenToSettings();
  } catch (err) {
    console.error("reports.js: Failed to start settings listener:", err);
  }

  try {
    listenToReservations();
  } catch (err) {
    console.error("reports.js: Failed to start reservations listener:", err);
  }

  try {
    listenToExpenses();
  } catch (err) {
    console.error("reports.js: Failed to start expenses listener:", err);
  }

  try {
    bindUIEvents();
  } catch (err) {
    console.error("reports.js: Failed to bind UI events:", err);
  }

  console.log('reports.js: Page initialization completed');
}

function listenToSettings() {
  onSnapshot(doc(db, "settings", "hall_settings"), (docSnap) => {
    if (docSnap.exists()) {
      currentSettings = docSnap.data();
      try {
        renderReports();
      } catch (err) {
        console.error("reports.js: Error rendering reports on settings snapshot:", err);
      }
    }
  }, err => console.error("reports.js: Settings listener failed:", err));
}

function listenToReservations() {
  onSnapshot(collection(db, "reservations"), (snapshot) => {
    allReservations = [];
    snapshot.forEach(d => allReservations.push({ id: d.id, ...d.data() }));
    try {
      renderReports();
    } catch (err) {
      console.error("reports.js: Error rendering reports on reservations snapshot:", err);
    }
  }, err => console.error("reports.js: Reservations listener failed:", err));
}

function listenToExpenses() {
  onSnapshot(collection(db, "charges"), (snapshot) => {
    allExpenses = [];
    snapshot.forEach(d => allExpenses.push({ id: d.id, ...d.data() }));
    try {
      renderReports();
    } catch (err) {
      console.error("reports.js: Error rendering reports on expenses snapshot:", err);
    }
  }, err => console.error("reports.js: Expenses listener failed:", err));
}

function bindUIEvents() {
  const yearSelect = document.getElementById('report-year');
  yearSelect?.addEventListener('change', () => {
    try {
      renderReports();
      showToast('Bilan actualisé', 'Affichage des données comptables de l\'exercice choisi.', 'info');
    } catch (err) {
      console.error("reports.js: Failed to render reports on year change:", err);
    }
  });

  const exportBtn = document.getElementById('export-csv-btn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      try {
        exportToCSV();
      } catch (err) {
        console.error("reports.js: Failed to export CSV:", err);
      }
    };
  }

  window.addEventListener('spSettingsUpdated', () => {
    try {
      renderReports();
    } catch (err) {
      console.error("reports.js: Failed to refresh on settings change:", err);
    }
  });
}

/**
 * Main Reports Compiler
 */
function renderReports() {
  const yearSelect = document.getElementById('report-year');
  if (!yearSelect) return;
  const year = yearSelect.value;

  const currency = currentCurrencySymbol || currentSettings.currency || '€';

  // Update print header
  const printYearLabel = document.getElementById('print-year-label');
  if (printYearLabel) printYearLabel.innerText = year;

  const printHallName = document.getElementById('print-hall-name');
  if (printHallName) printHallName.innerText = currentSettings.hallName || 'SallePro';

  const printHallMeta = document.getElementById('print-hall-meta');
  if (printHallMeta) printHallMeta.innerText = `Bilan Financier Annuel - Exercice ${year} | ${currentSettings.address || ''}`;

  // Monthly values arrays
  const monthsNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  const revenues = Array(12).fill(0);
  const generalCharges = Array(12).fill(0);
  const salaries = Array(12).fill(0);
  const netProfits = Array(12).fill(0);

  // Compute monthly figures
  for (let m = 0; m < 12; m++) {
    const monthPrefix = `${year}-${String(m + 1).padStart(2, '0')}`;

    // 1. Revenues (confirmed booking collections)
    revenues[m] = allReservations
      .filter(r => r.status === 'Confirmé' && r.eventDate && r.eventDate.startsWith(monthPrefix))
      .reduce((sum, r) => sum + ((r.totalAmount || 0) - (r.remainingAmount || 0)), 0);

    // 2. Expenses (separate General Charges from Salaries)
    generalCharges[m] = allExpenses
      .filter(e => e.date && e.date.startsWith(monthPrefix) && e.category !== 'Salaires')
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    salaries[m] = allExpenses
      .filter(e => e.date && e.date.startsWith(monthPrefix) && e.category === 'Salaires')
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    // Net Profit
    netProfits[m] = revenues[m] - (generalCharges[m] + salaries[m]);
  }

  // Populate Table
  const tbody = document.getElementById('reports-table-body');
  if (tbody) {
    tbody.innerHTML = '';
    
    for (let m = 0; m < 12; m++) {
      const rev = revenues[m];
      const charges = generalCharges[m];
      const sal = salaries[m];
      const totalOutlays = charges + sal;
      const profit = netProfits[m];

      let marginPct = '-';
      if (rev > 0) {
        marginPct = `${Math.round((profit / rev) * 100)} %`;
      }

      // Profit style classes
      let profitStyle = 'color: var(--text-main); font-weight: 700;';
      if (profit > 0) profitStyle = 'color: var(--success); font-weight: 700;';
      else if (profit < 0) profitStyle = 'color: var(--danger); font-weight: 700;';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600;">${monthsNames[m]}</td>
        <td style="font-weight: 500;">${rev.toLocaleString()} ${currency}</td>
        <td>${charges.toLocaleString()} ${currency}</td>
        <td>${sal.toLocaleString()} ${currency}</td>
        <td style="color: var(--danger);">${totalOutlays.toLocaleString()} ${currency}</td>
        <td style="${profitStyle}">${profit.toLocaleString()} ${currency}</td>
        <td style="font-weight: 600;">${marginPct}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // Compute Year Totals for KPIs
  const totalYearRevenue = revenues.reduce((sum, v) => sum + v, 0);
  const totalYearGeneralCharges = generalCharges.reduce((sum, v) => sum + v, 0);
  const totalYearSalaries = salaries.reduce((sum, v) => sum + v, 0);
  const totalYearExpenses = totalYearGeneralCharges + totalYearSalaries;
  const totalYearProfit = totalYearRevenue - totalYearExpenses;

  // Render top cards
  const revenueEl = document.getElementById('report-kpi-revenue');
  const expensesEl = document.getElementById('report-kpi-expenses');
  const profitKpi = document.getElementById('report-kpi-profit');
  const profitCard = document.getElementById('report-profit-card');
  const profitDesc = document.getElementById('report-kpi-profit-desc');

  if (revenueEl) revenueEl.innerText = `${totalYearRevenue.toLocaleString()} ${currency}`;
  if (expensesEl) expensesEl.innerText = `${totalYearExpenses.toLocaleString()} ${currency}`;
  
  if (profitKpi) {
    profitKpi.innerText = `${totalYearProfit.toLocaleString()} ${currency}`;
    if (totalYearProfit >= 0) {
      profitKpi.style.color = 'var(--success)';
      if (profitCard) profitCard.style.borderLeftColor = 'var(--success)';
      if (profitDesc) profitDesc.innerText = 'Bilan annuel positif (Excédent financier)';
    } else {
      profitKpi.style.color = 'var(--danger)';
      if (profitCard) profitCard.style.borderLeftColor = 'var(--danger)';
      if (profitDesc) profitDesc.innerText = 'Bilan annuel négatif (Déficit financier)';
    }
  }

  // Load chart
  try {
    renderProfitReportChart(monthsNames, netProfits, currency);
  } catch (err) {
    console.error("reports.js: Error rendering profit report chart:", err);
  }
}

/**
 * Render rentability curve chart
 */
function renderProfitReportChart(labels, data, currency) {
  const ctx = document.getElementById('profitReportChart');
  if (!ctx) return;

  if (profitChart) {
    profitChart.destroy();
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#1e293b' : '#e2e8f0';

  profitChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: `Bénéfice Net (${currency})`,
        data: data,
        backgroundColor: data.map(val => val >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
        borderColor: data.map(val => val >= 0 ? '#10b981' : '#ef4444'),
        borderWidth: 1.5,
        borderRadius: 6
      }]
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

/**
 * Export report structure as CSV file
 */
function exportToCSV() {
  const yearSelect = document.getElementById('report-year');
  if (!yearSelect) return;
  const year = yearSelect.value;
  const tbody = document.getElementById('reports-table-body');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr');
  let csvContent = 'Mois;Revenus;Charges Generales;Salaires Verses;Total Depenses;Benefice Net;Marge Net %\r\n';

  rows.forEach(tr => {
    const cols = tr.querySelectorAll('td');
    const rowContent = Array.from(cols).map(td => td.innerText.replace(/[\s€$]/g, '')).join(';');
    csvContent += rowContent + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `sallepro_bilan_${year}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Export réussi', 'Le bilan a été téléchargé sous format CSV.', 'success');
}
