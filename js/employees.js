/**
 * SallePro - Employee Page Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  renderEmployeesTable();
  initAttendanceRoster();

  // Modal event bindings
  const modal = document.getElementById('emp-modal');
  const addBtn = document.getElementById('open-add-emp-btn');
  const closeBtn = document.getElementById('close-emp-modal-btn');
  const cancelBtn = document.getElementById('cancel-emp-btn');
  const form = document.getElementById('emp-form');

  addBtn.onclick = () => openEmployeeModal();
  closeBtn.onclick = () => closeModal();
  cancelBtn.onclick = () => closeModal();

  form.addEventListener('submit', handleFormSubmit);

  // Position select trigger (toggle "other" input)
  const posSelect = document.getElementById('emp-position');
  const posOtherWrapper = document.getElementById('emp-position-other-wrapper');
  posSelect.addEventListener('change', () => {
    if (posSelect.value === 'Autre') {
      posOtherWrapper.style.display = 'block';
      document.getElementById('emp-position-other').setAttribute('required', 'true');
    } else {
      posOtherWrapper.style.display = 'none';
      document.getElementById('emp-position-other').removeAttribute('required');
    }
  });

  // Search input
  document.getElementById('search-employees').addEventListener('input', renderEmployeesTable);

  // Payroll summary load
  loadPayrollSummary();
});

/**
 * Handle Tab Switching
 */
function switchTab(tabName) {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  if (tabName === 'list') {
    document.getElementById('tab-list-btn').classList.add('active');
    document.getElementById('tab-list').classList.add('active');
    document.getElementById('open-add-emp-btn').style.display = 'inline-flex';
  } else {
    document.getElementById('tab-attendance-btn').classList.add('active');
    document.getElementById('tab-attendance').classList.add('active');
    document.getElementById('open-add-emp-btn').style.display = 'none';
    renderAttendanceTable(); // refresh attendance roster
  }
}

/**
 * Open Modal Form
 */
function openEmployeeModal(empId = null) {
  const modal = document.getElementById('emp-modal');
  const title = document.getElementById('emp-modal-title');
  const form = document.getElementById('emp-form');
  const posOtherWrapper = document.getElementById('emp-position-other-wrapper');

  form.reset();
  posOtherWrapper.style.display = 'none';
  document.getElementById('emp-position-other').removeAttribute('required');

  if (empId) {
    title.innerText = 'Modifier l\'Employé';
    const emp = db.getOne('employees', empId);
    if (emp) {
      document.getElementById('emp-id').value = emp.id;
      document.getElementById('emp-name').value = emp.name;
      document.getElementById('emp-phone').value = emp.phone;
      document.getElementById('emp-salary').value = emp.salary;
      document.getElementById('emp-hiring-date').value = emp.hiringDate;
      document.getElementById('emp-status').value = emp.status;

      const defaultPositions = ['Chef Serveur', 'Serveur', 'Décoratrice', 'Technicien Son & Lumière', 'Responsable Cuisine & Buffet', 'Agent de Sécurité', 'Agent de Nettoyage'];
      if (defaultPositions.includes(emp.position)) {
        document.getElementById('emp-position').value = emp.position;
      } else {
        document.getElementById('emp-position').value = 'Autre';
        posOtherWrapper.style.display = 'block';
        document.getElementById('emp-position-other').value = emp.position;
        document.getElementById('emp-position-other').setAttribute('required', 'true');
      }
    }
  } else {
    title.innerText = 'Nouvel Employé';
    document.getElementById('emp-id').value = '';
    document.getElementById('emp-status').value = 'Actif';
    document.getElementById('emp-hiring-date').value = new Date().toISOString().split('T')[0];
  }

  modal.classList.add('open');
}

function closeModal() {
  document.getElementById('emp-modal').classList.remove('open');
}

/**
 * Handle Form Submission
 */
function handleFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('emp-id').value;
  const name = document.getElementById('emp-name').value.trim();
  const selectPosition = document.getElementById('emp-position').value;
  const otherPosition = document.getElementById('emp-position-other').value.trim();
  const position = selectPosition === 'Autre' ? otherPosition : selectPosition;

  const phone = document.getElementById('emp-phone').value.trim();
  const salary = parseFloat(document.getElementById('emp-salary').value) || 0;
  const hiringDate = document.getElementById('emp-hiring-date').value;
  const status = document.getElementById('emp-status').value;

  const payload = { name, position, phone, salary, hiringDate, status };

  if (id) {
    db.updateOne('employees', id, payload);
    showToast('Fiche modifiée', `Les modifications pour ${name} ont été enregistrées.`, 'success');
  } else {
    payload.id = 'emp-' + Date.now();
    payload.attendance = {};
    db.insertOne('employees', payload);
    showToast('Employé enregistré', `${name} a rejoint le personnel.`, 'success');
  }

  closeModal();
  renderEmployeesTable();
  loadPayrollSummary();
}

/**
 * Render Employees List Table
 */
function renderEmployeesTable() {
  const tbody = document.getElementById('employees-table-body');
  const emptyState = document.getElementById('employees-empty-state');
  if (!tbody) return;

  const employees = db.getTable('employees');
  const searchQuery = document.getElementById('search-employees').value.toLowerCase().trim();
  const settings = db.getTable('settings');
  const currency = settings.currency || '€';

  const filtered = employees.filter(emp => {
    return emp.name.toLowerCase().includes(searchQuery) ||
           emp.position.toLowerCase().includes(searchQuery);
  });

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  filtered.forEach(emp => {
    let badgeClass = 'badge-success';
    if (emp.status === 'Inactif') badgeClass = 'badge-danger';

    // Format hiring date
    const d = new Date(emp.hiringDate);
    const formattedHiringDate = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600;">${emp.name}</td>
      <td style="font-weight: 500; color: var(--color-primary);">${emp.position}</td>
      <td>${emp.phone}</td>
      <td style="font-weight: 700;">${emp.salary.toLocaleString()} ${currency}</td>
      <td>${formattedHiringDate}</td>
      <td><span class="badge ${badgeClass}">${emp.status}</span></td>
      <td>
        <div style="display: flex; gap: 6px; justify-content: center;">
          <button class="btn btn-outline btn-icon btn-sm" onclick="openEmployeeModal('${emp.id}')" title="Modifier">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="deleteEmployee('${emp.id}')" title="Supprimer">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Delete Employee
 */
function deleteEmployee(id) {
  if (confirm('Voulez-vous vraiment supprimer cet employé de la base de données ?')) {
    const emp = db.getOne('employees', id);
    db.deleteOne('employees', id);
    showToast('Employé supprimé', `L'employé ${emp ? emp.name : ''} a été supprimé.`, 'success');
    renderEmployeesTable();
    loadPayrollSummary();
  }
}

/**
 * Initialize Attendance view parameters
 */
function initAttendanceRoster() {
  const dateInput = document.getElementById('attendance-date');
  if (!dateInput) return;

  // Set default date to 2026-06-30
  dateInput.value = '2026-06-30';

  dateInput.addEventListener('change', () => {
    renderAttendanceTable();
  });
}

/**
 * Render attendance matrix table
 */
function renderAttendanceTable() {
  const tbody = document.getElementById('attendance-table-body');
  if (!tbody) return;

  const dateInput = document.getElementById('attendance-date');
  const dateStr = dateInput.value;

  if (!dateStr) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">Veuillez sélectionner une date valide.</td></tr>`;
    return;
  }

  const employees = db.getTable('employees');
  const activeEmployees = employees.filter(e => e.status === 'Actif');

  tbody.innerHTML = '';

  if (activeEmployees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">Aucun employé actif enregistré.</td></tr>`;
    return;
  }

  activeEmployees.forEach(emp => {
    // Get current record for this date
    const dateRecord = emp.attendance ? emp.attendance[dateStr] : undefined;
    
    // Status display badge
    let statusBadge = '<span class="badge" style="background-color: var(--bg-surface-hover); color: var(--text-muted)">Non pointé</span>';
    if (dateRecord === 'Present') statusBadge = '<span class="badge badge-success">Présent</span>';
    if (dateRecord === 'Absent') statusBadge = '<span class="badge badge-danger">Absent</span>';
    if (dateRecord === 'Leave') statusBadge = '<span class="badge badge-warning">Congé</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600;">${emp.name}</td>
      <td style="color: var(--text-muted); font-size:0.85rem;">${emp.position}</td>
      <td id="status-badge-${emp.id}">${statusBadge}</td>
      <td>
        <div style="display:flex; justify-content:center;">
          <div class="attendance-toggle">
            <button class="attendance-btn present ${dateRecord === 'Present' ? 'active' : ''}" onclick="toggleAttendance('${emp.id}', '${dateStr}', 'Present')">Présent</button>
            <button class="attendance-btn absent ${dateRecord === 'Absent' ? 'active' : ''}" onclick="toggleAttendance('${emp.id}', '${dateStr}', 'Absent')">Absent</button>
            <button class="attendance-btn leave ${dateRecord === 'Leave' ? 'active' : ''}" onclick="toggleAttendance('${emp.id}', '${dateStr}', 'Leave')">Congé</button>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Toggle Pointage
 */
function toggleAttendance(empId, dateStr, status) {
  const employees = db.getTable('employees');
  const idx = employees.findIndex(e => e.id === empId);

  if (idx !== -1) {
    if (!employees[idx].attendance) {
      employees[idx].attendance = {};
    }

    // Toggle logic: if already active status, remove it. Otherwise set it.
    if (employees[idx].attendance[dateStr] === status) {
      delete employees[idx].attendance[dateStr];
    } else {
      employees[idx].attendance[dateStr] = status;
    }

    db.saveTable('employees', employees);
    
    // Re-render attendance list to update buttons and badges
    renderAttendanceTable();
  }
}

/**
 * Load salary sums and roles info
 */
function loadPayrollSummary() {
  const payrollVal = document.getElementById('total-payroll-val');
  const breakdownDiv = document.getElementById('staff-roles-breakdown');
  if (!payrollVal) return;

  const employees = db.getTable('employees');
  const settings = db.getTable('settings');
  const currency = settings.currency || '€';

  const activeStaff = employees.filter(e => e.status === 'Actif');

  // Total payroll budget
  const totalPayroll = activeStaff.reduce((sum, e) => sum + e.salary, 0);
  payrollVal.innerText = `${totalPayroll.toLocaleString()} ${currency}`;

  // Breakdown by roles
  const rolesMap = {};
  activeStaff.forEach(e => {
    rolesMap[e.position] = (rolesMap[e.position] || 0) + 1;
  });

  breakdownDiv.innerHTML = '';
  
  if (Object.keys(rolesMap).length === 0) {
    breakdownDiv.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">Aucun personnel actif.</span>';
    return;
  }

  for (const [role, count] of Object.entries(rolesMap)) {
    breakdownDiv.innerHTML += `
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;">
        <span style="color:var(--text-muted);">${role}</span>
        <span style="font-weight:700; background-color:var(--bg-surface-hover); padding:2px 8px; border-radius:12px; border:1px solid var(--border-color);">${count}</span>
      </div>
    `;
  }
}
