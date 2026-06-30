/**
 * SallePro - Charges Page Logic
 */

let chargesChart = null;

document.addEventListener('DOMContentLoaded', () => {
  renderExpensesTable();

  // Modal event bindings
  const modal = document.getElementById('expense-modal');
  const addBtn = document.getElementById('open-add-expense-btn');
  const closeBtn = document.getElementById('close-expense-modal-btn');
  const cancelBtn = document.getElementById('cancel-expense-btn');
  const form = document.getElementById('expense-form');

  addBtn.onclick = () => openExpenseModal();
  closeBtn.onclick = () => closeModal();
  cancelBtn.onclick = () => closeModal();

  form.addEventListener('submit', handleFormSubmit);

  // Search & Filter event bindings
  document.getElementById('search-expenses').addEventListener('input', renderExpensesTable);
  document.getElementById('filter-expense-category').addEventListener('change', renderExpensesTable);
  document.getElementById('filter-expense-month').addEventListener('change', renderExpensesTable);

  // Watch theme changes to refresh chart colors
  window.addEventListener('themeChanged', () => {
    updateExpensesAnalytics();
  });
});

/**
 * Open Modal Form
 */
function openExpenseModal(expenseId = null) {
  const modal = document.getElementById('expense-modal');
  const title = document.getElementById('expense-modal-title');
  const form = document.getElementById('expense-form');

  form.reset();

  if (expenseId) {
    title.innerText = 'Modifier la Charge';
    const exp = db.getOne('expenses', expenseId);
    if (exp) {
      document.getElementById('expense-id').value = exp.id;
      document.getElementById('expense-date').value = exp.date;
      document.getElementById('expense-category').value = exp.category;
      document.getElementById('expense-amount').value = exp.amount;
      document.getElementById('expense-desc').value = exp.description;
    }
  } else {
    title.innerText = 'Enregistrer une Charge';
    document.getElementById('expense-id').value = '';
    // Set default date to today's date if current month matches June 2026, otherwise selected month
    const filterMonthVal = document.getElementById('filter-expense-month').value; // e.g. "2026-06"
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    if (todayStr.startsWith(filterMonthVal)) {
      document.getElementById('expense-date').value = todayStr;
    } else {
      document.getElementById('expense-date').value = `${filterMonthVal}-01`;
    }
  }

  modal.classList.add('open');
}

function closeModal() {
  document.getElementById('expense-modal').classList.remove('open');
}

/**
 * Handle Form Submission
 */
function handleFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('expense-id').value;
  const date = document.getElementById('expense-date').value;
  const category = document.getElementById('expense-category').value;
  const amount = parseFloat(document.getElementById('expense-amount').value) || 0;
  const description = document.getElementById('expense-desc').value.trim();

  const payload = { date, category, amount, description };

  if (id) {
    db.updateOne('expenses', id, payload);
    showToast('Charge modifiée', 'Les détails de la dépense ont été modifiés.', 'success');
  } else {
    payload.id = 'exp-' + Date.now();
    db.insertOne('expenses', payload);
    showToast('Charge enregistrée', 'La nouvelle dépense a été ajoutée aux registres.', 'success');
  }

  closeModal();
  renderExpensesTable();
}

/**
 * Render Expenses Table
 */
function renderExpensesTable() {
  const tbody = document.getElementById('expenses-table-body');
  const emptyState = document.getElementById('expenses-empty-state');
  if (!tbody) return;

  const expenses = db.getTable('expenses');
  const searchQuery = document.getElementById('search-expenses').value.toLowerCase().trim();
  const selectedCat = document.getElementById('filter-expense-category').value;
  const selectedMonth = document.getElementById('filter-expense-month').value; // YYYY-MM
  const settings = db.getTable('settings');
  const currency = settings.currency || '€';

  // Apply filters
  const filtered = expenses.filter(exp => {
    const matchesSearch = exp.description.toLowerCase().includes(searchQuery);
    const matchesCategory = !selectedCat || exp.category === selectedCat;
    const matchesMonth = !selectedMonth || exp.date.startsWith(selectedMonth);

    return matchesSearch && matchesCategory && matchesMonth;
  });

  // Sort by date descending
  filtered.sort((a, b) => b.date.localeCompare(a.date));

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
    // Clear analytics as well or show zeros
    updateExpensesAnalytics([], currency);
    return;
  }

  emptyState.style.display = 'none';

  filtered.forEach(exp => {
    // Formatting date
    const d = new Date(exp.date);
    const formattedDate = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 500;">${formattedDate}</td>
      <td>
        <span class="badge badge-info" style="font-weight:600;"><i class="fa-solid fa-tag"></i> ${exp.category}</span>
      </td>
      <td style="font-weight: 700; color: var(--danger);">${exp.amount.toLocaleString()} ${currency}</td>
      <td style="color: var(--text-muted); max-width: 250px; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${exp.description}">${exp.description}</td>
      <td>
        <div style="display: flex; gap: 6px; justify-content: center;">
          <button class="btn btn-outline btn-icon btn-sm" onclick="openExpenseModal('${exp.id}')" title="Modifier">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="deleteExpense('${exp.id}')" title="Supprimer">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Update Summary panel
  const allMonthExpenses = expenses.filter(exp => !selectedMonth || exp.date.startsWith(selectedMonth));
  updateExpensesAnalytics(allMonthExpenses, currency);
}

/**
 * Delete Expense Record
 */
function deleteExpense(id) {
  if (confirm('Voulez-vous vraiment supprimer cet enregistrement de charge ?')) {
    db.deleteOne('expenses', id);
    showToast('Charge supprimée', 'L\'enregistrement de dépense a été retiré.', 'success');
    renderExpensesTable();
  }
}

/**
 * Update Monthly Analytics summary & Doughnut chart
 */
function updateExpensesAnalytics(monthExpenses, currency) {
  const selectedMonth = document.getElementById('filter-expense-month').value;
  const headerLabel = document.getElementById('analytics-month-label');
  const outlayVal = document.getElementById('analytics-total-outlay');
  const catListDiv = document.getElementById('analytics-category-list');
  const ctx = document.getElementById('chargesMiniDoughnut');

  if (!outlayVal || !catListDiv) return;

  // Format header month name
  if (selectedMonth) {
    const parts = selectedMonth.split('-');
    const date = new Date(parts[0], parts[1] - 1, 1);
    headerLabel.innerText = `Dépenses de ${date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
  } else {
    headerLabel.innerText = 'Dépenses Globales';
  }

  // Calculate sum total
  const total = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  outlayVal.innerText = `${total.toLocaleString()} ${currency}`;

  // Summarize categories
  const categories = ['Électricité', 'Eau', 'Internet', 'Salaires', 'Maintenance', 'Achats', 'Divers'];
  const colors = ['#fb7185', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#22d3ee', '#94a3b8'];
  
  const categorySums = categories.map(cat => {
    return monthExpenses
      .filter(e => e.category === cat)
      .reduce((sum, e) => sum + e.amount, 0);
  });

  // Render list breakdown
  catListDiv.innerHTML = '';
  
  if (total === 0) {
    catListDiv.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted); text-align:center; display:block; padding:10px 0;">Aucune charge enregistrée ce mois.</span>';
    if (chargesChart) chargesChart.destroy();
    return;
  }

  categories.forEach((cat, idx) => {
    const amt = categorySums[idx];
    if (amt > 0) {
      const pct = Math.round((amt / total) * 100);
      catListDiv.innerHTML += `
        <div style="display:flex; flex-direction:column; gap:4px; font-size:0.8rem;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:600; color:var(--text-main); display:flex; align-items:center; gap:6px;">
              <span style="width:8px; height:8px; border-radius:50%; background-color:${colors[idx]}; display:inline-block;"></span>
              ${cat}
            </span>
            <span style="font-weight:700;">${amt.toLocaleString()} ${currency} (${pct}%)</span>
          </div>
          <div style="width:100%; height:6px; background-color:var(--bg-app); border-radius:10px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background-color:${colors[idx]}; border-radius:10px;"></div>
          </div>
        </div>
      `;
    }
  });

  // Draw or update Chart.js
  if (chargesChart) {
    chargesChart.destroy();
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  if (ctx) {
    chargesChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: categories,
        datasets: [{
          data: categorySums,
          backgroundColor: colors,
          borderWidth: isDark ? 2 : 1,
          borderColor: isDark ? '#0f172a' : '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false // Hide legend on sidebar panel to save space
          }
        },
        cutout: '75%'
      }
    });
  }
}
