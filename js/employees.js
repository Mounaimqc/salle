/**
 * SallePro - Employees Page (Firebase Firestore Module)
 */

import { db } from "./firebase.js";
import { showToast, currentCurrencySymbol } from "./app.js";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

console.log('employees.js: Imports loaded successfully');

let allEmployees = [];
let editingId = null;

window.addEventListener('authSessionLoaded', async () => {
  console.log('employees.js: authSessionLoaded event received');
  try {
    await initEmployeesPage();
  } catch (error) {
    console.error('employees.js: Page initialization failed:', error);
    const { showFatalError } = await import("./auth.js");
    showFatalError(error);
  }
});

async function initEmployeesPage() {
  console.log('employees.js: Initializing employees page');

  try {
    listenToEmployees();
  } catch (err) {
    console.error("employees.js: Failed to start employees listener:", err);
  }

  try {
    bindUIEvents();
  } catch (err) {
    console.error("employees.js: Failed to bind UI events:", err);
  }

  // Default attendance date input to today
  const dateInput = document.getElementById('attendance-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  console.log('employees.js: Page initialization completed');
}

// ─── Real-time Listener ────────────────────────────────────────────────────
function listenToEmployees() {
  const q = query(collection(db, "employees"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    allEmployees = [];
    snapshot.forEach(d => allEmployees.push({ id: d.id, ...d.data() }));
    
    try {
      renderEmployeesTable();
    } catch (err) {
      console.error("employees.js: Error rendering employees table:", err);
    }
    
    try {
      renderAttendanceTable();
    } catch (err) {
      console.error("employees.js: Error rendering attendance table:", err);
    }
    
    try {
      loadPayrollSummary();
    } catch (err) {
      console.error("employees.js: Error loading payroll summary:", err);
    }
  }, err => showToast('Erreur', err.message, 'danger'));
}

// ─── UI Events ─────────────────────────────────────────────────────────────
function bindUIEvents() {
  const addBtn = document.getElementById('open-add-emp-btn');
  if (addBtn) addBtn.onclick = () => openModal();

  const closeBtn = document.getElementById('close-emp-modal');
  if (closeBtn) closeBtn.onclick = () => closeModal();

  const cancelBtn = document.getElementById('cancel-emp-btn');
  if (cancelBtn) cancelBtn.onclick = () => closeModal();

  const form = document.getElementById('emp-form');
  if (form) form.addEventListener('submit', handleFormSubmit);

  const searchInput = document.getElementById('search-employees');
  if (searchInput) searchInput.addEventListener('input', () => renderEmployeesTable());

  const dateInput = document.getElementById('attendance-date');
  if (dateInput) dateInput.addEventListener('change', () => renderAttendanceTable());

  // Position select toggle
  const posSelect = document.getElementById('emp-position');
  const posOtherWrapper = document.getElementById('emp-position-other-wrapper');
  posSelect?.addEventListener('change', () => {
    if (posOtherWrapper) {
      posOtherWrapper.style.display = posSelect.value === 'Autre' ? 'block' : 'none';
    }
  });
}

// ─── Tab Switching ─────────────────────────────────────────────────────────
window.switchTab = function(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const addEmpBtn = document.getElementById('open-add-emp-btn');
  if (tabName === 'list') {
    document.getElementById('tab-list-btn')?.classList.add('active');
    document.getElementById('tab-list')?.classList.add('active');
    if (addEmpBtn) addEmpBtn.style.display = 'inline-flex';
  } else {
    document.getElementById('tab-attendance-btn')?.classList.add('active');
    document.getElementById('tab-attendance')?.classList.add('active');
    if (addEmpBtn) addEmpBtn.style.display = 'none';
    try {
      renderAttendanceTable();
    } catch (err) {
      console.error("employees.js: Failed to render attendance table on tab switch:", err);
    }
  }
};

// ─── Employees Table ───────────────────────────────────────────────────────
function renderEmployeesTable() {
  const tbody = document.getElementById('employees-table-body');
  const empty = document.getElementById('employees-empty-state');
  if (!tbody) return;

  const sym = currentCurrencySymbol || '€';
  const searchInput = document.getElementById('search-employees');
  const search = (searchInput?.value || '').toLowerCase();

  const filtered = allEmployees.filter(e =>
    (e.name || '').toLowerCase().includes(search) ||
    (e.position || '').toLowerCase().includes(search)
  );

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  filtered.forEach(emp => {
    const badge = emp.status === 'Actif' ? 'badge-success' : 'badge-danger';
    const hireDate = emp.hireDate
      ? new Date(emp.hireDate).toLocaleDateString('fr-FR')
      : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;">${emp.name || '—'}</td>
      <td style="color:var(--text-muted);">${emp.position || '—'}</td>
      <td>${emp.phone || '—'}</td>
      <td style="font-weight:700;">${(emp.salary || 0).toLocaleString()} ${sym}</td>
      <td>${hireDate}</td>
      <td><span class="badge ${badge}">${emp.status || 'Actif'}</span></td>
      <td>
        <div style="display:flex;gap:6px;justify-content:center;">
          <button class="btn btn-outline btn-icon btn-sm" data-action="edit" data-id="${emp.id}"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn btn-danger btn-icon btn-sm" data-action="delete" data-id="${emp.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>`;

    tr.querySelectorAll('button[data-action]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (btn.dataset.action === 'edit') openModal(btn.dataset.id);
        else deleteEmployee(btn.dataset.id);
      };
    });

    tbody.appendChild(tr);
  });
}

// ─── Attendance Table ──────────────────────────────────────────────────────
function renderAttendanceTable() {
  const tbody = document.getElementById('attendance-table-body');
  if (!tbody) return;

  const dateInput = document.getElementById('attendance-date');
  const dateStr = dateInput?.value;
  const active = allEmployees.filter(e => e.status === 'Actif');

  tbody.innerHTML = '';

  if (!dateStr || active.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">Sélectionnez une date et vérifiez qu'il y a des employés actifs.</td></tr>`;
    return;
  }

  active.forEach(emp => {
    const record = (emp.attendance || {})[dateStr];

    const getClass = (val) => record === val ? 'active' : '';

    let badgeHtml = `<span class="badge" style="background:var(--bg-surface-hover);color:var(--text-muted);">Non pointé</span>`;
    if (record === 'Présent') badgeHtml = `<span class="badge badge-success">Présent</span>`;
    else if (record === 'Absent') badgeHtml = `<span class="badge badge-danger">Absent</span>`;
    else if (record === 'Congé') badgeHtml = `<span class="badge badge-warning">Congé</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;">${emp.name}</td>
      <td style="color:var(--text-muted);font-size:0.85rem;">${emp.position}</td>
      <td>${badgeHtml}</td>
      <td>
        <div style="display:flex;gap:6px;justify-content:center;">
          <button class="btn btn-sm ${getClass('Présent')}" style="background-color:${record==='Présent'?'var(--success)':'var(--bg-surface-hover)'};color:${record==='Présent'?'#000':'var(--text-main)'};border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:5px 12px;font-size:0.8rem;font-weight:600;cursor:pointer;" data-status="Présent" data-id="${emp.id}">Présent</button>
          <button class="btn btn-sm ${getClass('Absent')}" style="background-color:${record==='Absent'?'var(--danger)':'var(--bg-surface-hover)'};color:${record==='Absent'?'#fff':'var(--text-main)'};border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:5px 12px;font-size:0.8rem;font-weight:600;cursor:pointer;" data-status="Absent" data-id="${emp.id}">Absent</button>
          <button class="btn btn-sm ${getClass('Congé')}" style="background-color:${record==='Congé'?'var(--warning)':'var(--bg-surface-hover)'};color:${record==='Congé'?'#000':'var(--text-main)'};border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:5px 12px;font-size:0.8rem;font-weight:600;cursor:pointer;" data-status="Congé" data-id="${emp.id}">Congé</button>
        </div>
      </td>`;

    tr.querySelectorAll('button[data-status]').forEach(btn => {
      btn.onclick = () => {
        try {
          toggleAttendance(btn.dataset.id, dateStr, btn.dataset.status);
        } catch (err) {
          console.error("employees.js: Failed to toggle attendance:", err);
        }
      };
    });

    tbody.appendChild(tr);
  });
}

async function toggleAttendance(empId, dateStr, status) {
  const emp = allEmployees.find(e => e.id === empId);
  if (!emp) return;

  const attendance = emp.attendance || {};
  // Toggle off if same status clicked
  if (attendance[dateStr] === status) {
    delete attendance[dateStr];
  } else {
    attendance[dateStr] = status;
  }

  try {
    await updateDoc(doc(db, "employees", empId), { attendance });
    // Optimistically update local copy
    emp.attendance = attendance;
    renderAttendanceTable();
  } catch (err) {
    showToast('Erreur', err.message, 'danger');
  }
}

// ─── Payroll Summary ───────────────────────────────────────────────────────
function loadPayrollSummary() {
  const sym = currentCurrencySymbol || '€';
  const active = allEmployees.filter(e => e.status === 'Actif');
  const total = active.reduce((s, e) => s + (e.salary || 0), 0);

  const el = document.getElementById('total-payroll-val');
  if (el) el.innerText = `${total.toLocaleString()} ${sym}`;

  const breakdown = document.getElementById('staff-roles-breakdown');
  if (!breakdown) return;

  const rolesMap = {};
  active.forEach(e => { 
    if (e.position) rolesMap[e.position] = (rolesMap[e.position] || 0) + 1; 
  });

  breakdown.innerHTML = '';
  if (Object.keys(rolesMap).length === 0) {
    breakdown.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);">Aucun personnel actif.</span>`;
    return;
  }

  for (const [role, count] of Object.entries(rolesMap)) {
    breakdown.innerHTML += `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.85rem;padding:4px 0;">
        <span style="color:var(--text-muted);">${role}</span>
        <span style="font-weight:700;background:var(--bg-surface-hover);padding:2px 8px;border-radius:12px;border:1px solid var(--border-color);">${count}</span>
      </div>`;
  }
}

// ─── Modal ─────────────────────────────────────────────────────────────────
function openModal(empId = null) {
  editingId = empId;
  const form = document.getElementById('emp-form');
  const title = document.getElementById('emp-modal-title');
  const posOtherWrapper = document.getElementById('emp-position-other-wrapper');
  if (form) form.reset();
  if (posOtherWrapper) posOtherWrapper.style.display = 'none';

  if (empId) {
    const emp = allEmployees.find(e => e.id === empId);
    if (emp) {
      if (title) title.innerText = "Modifier l'Employé";
      
      const idEl = document.getElementById('emp-id');
      const nameEl = document.getElementById('emp-name');
      const phoneEl = document.getElementById('emp-phone');
      const salaryEl = document.getElementById('emp-salary');
      const hireDateEl = document.getElementById('emp-hiring-date');
      const statusEl = document.getElementById('emp-status');
      const posEl = document.getElementById('emp-position');

      if (idEl) idEl.value = emp.id;
      if (nameEl) nameEl.value = emp.name || '';
      if (phoneEl) phoneEl.value = emp.phone || '';
      if (salaryEl) salaryEl.value = emp.salary || '';
      if (hireDateEl) hireDateEl.value = emp.hireDate || '';
      if (statusEl) statusEl.value = emp.status || 'Actif';

      const stdPositions = ['Chef Serveur','Serveur','Décoratrice','Technicien Son & Lumière','Responsable Cuisine','Agent Sécurité'];
      if (posEl) {
        if (stdPositions.includes(emp.position)) {
          posEl.value = emp.position;
        } else {
          posEl.value = 'Autre';
          if (posOtherWrapper) posOtherWrapper.style.display = 'block';
          const otherInput = document.getElementById('emp-position-other');
          if (otherInput) otherInput.value = emp.position || '';
        }
      }
    }
  } else {
    if (title) title.innerText = 'Nouvel Employé';
    const idEl = document.getElementById('emp-id');
    const statusEl = document.getElementById('emp-status');
    const hireDateEl = document.getElementById('emp-hiring-date');
    
    if (idEl) idEl.value = '';
    if (statusEl) statusEl.value = 'Actif';
    if (hireDateEl) hireDateEl.value = new Date().toISOString().split('T')[0];
  }

  const modal = document.getElementById('emp-modal');
  if (modal) modal.classList.add('open');
}

function closeModal() {
  const modal = document.getElementById('emp-modal');
  if (modal) modal.classList.remove('open');
  editingId = null;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  
  const nameEl = document.getElementById('emp-name');
  const posSelectEl = document.getElementById('emp-position');
  const posOtherEl = document.getElementById('emp-position-other');
  const phoneEl = document.getElementById('emp-phone');
  const salaryEl = document.getElementById('emp-salary');
  const hireDateEl = document.getElementById('emp-hiring-date');
  const statusEl = document.getElementById('emp-status');

  if (!nameEl || !posSelectEl || !phoneEl || !salaryEl || !hireDateEl || !statusEl) return;

  const name = nameEl.value.trim();
  const posSelect = posSelectEl.value;
  const posOther = posOtherEl ? posOtherEl.value.trim() : '';
  const position = posSelect === 'Autre' ? posOther : posSelect;
  const phone = phoneEl.value.trim();
  const salary = parseFloat(salaryEl.value) || 0;
  const hireDate = hireDateEl.value;
  const status = statusEl.value;

  const payload = { name, position, phone, salary, hireDate, status };

  try {
    if (editingId) {
      await updateDoc(doc(db, "employees", editingId), payload);
      showToast('Modifié', `${name} mis à jour.`, 'success');
    } else {
      payload.createdAt = serverTimestamp();
      payload.attendance = {};
      await addDoc(collection(db, "employees"), payload);
      showToast('Employé créé', `${name} ajouté au personnel.`, 'success');
    }
    closeModal();
  } catch (err) {
    showToast('Erreur', err.message, 'danger');
  }
}

async function deleteEmployee(id) {
  if (!confirm('Supprimer cet employé définitivement ?')) return;
  try {
    const emp = allEmployees.find(e => e.id === id);
    await deleteDoc(doc(db, "employees", id));
    showToast('Supprimé', `${emp?.name || 'Employé'} supprimé.`, 'success');
  } catch (err) {
    showToast('Erreur', err.message, 'danger');
  }
}
