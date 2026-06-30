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

let allEmployees = [];
let editingId = null;

window.addEventListener('authSessionLoaded', () => {
  listenToEmployees();
  bindUIEvents();
  // Default attendance date input to today
  const dateInput = document.getElementById('attendance-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
});

// ─── Real-time Listener ────────────────────────────────────────────────────
function listenToEmployees() {
  const q = query(collection(db, "employees"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    allEmployees = [];
    snapshot.forEach(d => allEmployees.push({ id: d.id, ...d.data() }));
    renderEmployeesTable();
    renderAttendanceTable();
    loadPayrollSummary();
  }, err => showToast('Erreur', err.message, 'danger'));
}

// ─── UI Events ─────────────────────────────────────────────────────────────
function bindUIEvents() {
  document.getElementById('open-add-emp-btn')?.addEventListener('click', () => openModal());
  document.getElementById('close-emp-modal-btn')?.addEventListener('click', closeModal);
  document.getElementById('cancel-emp-btn')?.addEventListener('click', closeModal);
  document.getElementById('emp-form')?.addEventListener('submit', handleFormSubmit);
  document.getElementById('search-employees')?.addEventListener('input', renderEmployeesTable);
  document.getElementById('attendance-date')?.addEventListener('change', renderAttendanceTable);

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
    renderAttendanceTable();
  }
};

// ─── Employees Table ───────────────────────────────────────────────────────
function renderEmployeesTable() {
  const tbody = document.getElementById('employees-table-body');
  const empty = document.getElementById('employees-empty-state');
  if (!tbody) return;

  const sym = currentCurrencySymbol || '€';
  const search = (document.getElementById('search-employees')?.value || '').toLowerCase();

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
      <td style="font-weight:600;">${emp.name}</td>
      <td style="color:var(--text-muted);">${emp.position}</td>
      <td>${emp.phone || '—'}</td>
      <td style="font-weight:700;">${(emp.salary || 0).toLocaleString()} ${sym}</td>
      <td>${hireDate}</td>
      <td><span class="badge ${badge}">${emp.status}</span></td>
      <td>
        <div style="display:flex;gap:6px;justify-content:center;">
          <button class="btn btn-outline btn-icon btn-sm" data-action="edit" data-id="${emp.id}"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn btn-danger btn-icon btn-sm" data-action="delete" data-id="${emp.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>`;

    tr.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (btn.dataset.action === 'edit') openModal(btn.dataset.id);
        else deleteEmployee(btn.dataset.id);
      });
    });

    tbody.appendChild(tr);
  });
}

// ─── Attendance Table ──────────────────────────────────────────────────────
function renderAttendanceTable() {
  const tbody = document.getElementById('attendance-table-body');
  if (!tbody) return;

  const dateStr = document.getElementById('attendance-date')?.value;
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
      btn.addEventListener('click', () => toggleAttendance(btn.dataset.id, dateStr, btn.dataset.status));
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
  active.forEach(e => { rolesMap[e.position] = (rolesMap[e.position] || 0) + 1; });

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
  form.reset();
  if (posOtherWrapper) posOtherWrapper.style.display = 'none';

  if (empId) {
    const emp = allEmployees.find(e => e.id === empId);
    if (emp) {
      title && (title.innerText = "Modifier l'Employé");
      document.getElementById('emp-id').value = emp.id;
      document.getElementById('emp-name').value = emp.name || '';
      document.getElementById('emp-phone').value = emp.phone || '';
      document.getElementById('emp-salary').value = emp.salary || '';
      document.getElementById('emp-hiring-date').value = emp.hireDate || '';
      document.getElementById('emp-status').value = emp.status || 'Actif';

      const stdPositions = ['Chef Serveur','Serveur','Décoratrice','Technicien Son & Lumière','Responsable Cuisine','Agent Sécurité'];
      if (stdPositions.includes(emp.position)) {
        document.getElementById('emp-position').value = emp.position;
      } else {
        document.getElementById('emp-position').value = 'Autre';
        if (posOtherWrapper) posOtherWrapper.style.display = 'block';
        const otherInput = document.getElementById('emp-position-other');
        if (otherInput) otherInput.value = emp.position;
      }
    }
  } else {
    title && (title.innerText = 'Nouvel Employé');
    document.getElementById('emp-id').value = '';
    document.getElementById('emp-status').value = 'Actif';
    document.getElementById('emp-hiring-date').value = new Date().toISOString().split('T')[0];
  }

  document.getElementById('emp-modal')?.classList.add('open');
}

function closeModal() {
  document.getElementById('emp-modal')?.classList.remove('open');
  editingId = null;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('emp-name').value.trim();
  const posSelect = document.getElementById('emp-position').value;
  const posOther = document.getElementById('emp-position-other')?.value.trim();
  const position = posSelect === 'Autre' ? posOther : posSelect;
  const phone = document.getElementById('emp-phone').value.trim();
  const salary = parseFloat(document.getElementById('emp-salary').value) || 0;
  const hireDate = document.getElementById('emp-hiring-date').value;
  const status = document.getElementById('emp-status').value;

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
