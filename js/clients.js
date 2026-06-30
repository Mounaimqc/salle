/**
 * SallePro - Clients CRM Page (Firebase Firestore Module)
 */

import { db } from "./firebase.js";
import { showToast, currentCurrencySymbol } from "./app.js";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
  where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

console.log('clients.js: Imports loaded successfully');

let allClients = [];
let allReservations = [];
let selectedClientId = null;
let editingId = null;

window.addEventListener('authSessionLoaded', async () => {
  console.log('clients.js: authSessionLoaded event received');
  try {
    await initClientsPage();
  } catch (error) {
    console.error('clients.js: Page initialization failed:', error);
    const { showFatalError } = await import("./auth.js");
    showFatalError(error);
  }
});

async function initClientsPage() {
  console.log('clients.js: Initializing clients CRM page');

  try {
    listenToClients();
  } catch (err) {
    console.error("clients.js: Failed to start clients listener:", err);
  }

  try {
    listenToReservations();
  } catch (err) {
    console.error("clients.js: Failed to start reservations listener:", err);
  }

  try {
    bindUIEvents();
  } catch (err) {
    console.error("clients.js: Failed to bind UI events:", err);
  }

  // Check if redirected to add a new client
  try {
    if (new URLSearchParams(window.location.search).get('addNew') === 'true') {
      openModal();
    }
  } catch (err) {
    console.error("clients.js: Failed to check search params:", err);
  }

  console.log('clients.js: CRM page initialization completed');
}

// ─── Firestore Listeners ───────────────────────────────────────────────────
function listenToClients() {
  const q = query(collection(db, "clients"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    allClients = [];
    snapshot.forEach(d => allClients.push({ id: d.id, ...d.data() }));
    try {
      renderTable();
    } catch (err) {
      console.error("clients.js: Error rendering table:", err);
    }
  }, err => showToast('Erreur', err.message, 'danger'));
}

function listenToReservations() {
  onSnapshot(collection(db, "reservations"), (snapshot) => {
    allReservations = [];
    snapshot.forEach(d => allReservations.push({ id: d.id, ...d.data() }));
    // Refresh profile if one is selected
    if (selectedClientId) {
      try {
        showClientProfile(selectedClientId);
      } catch (err) {
        console.error("clients.js: Error showing client profile on reservation change:", err);
      }
    }
  }, err => console.error("clients.js: Error listening to reservations:", err));
}

// ─── UI Events ─────────────────────────────────────────────────────────────
function bindUIEvents() {
  const addBtn = document.getElementById('open-add-client-btn');
  if (addBtn) addBtn.onclick = () => openModal();

  const closeBtn = document.getElementById('close-client-modal');
  if (closeBtn) closeBtn.onclick = () => closeModal();

  const cancelBtn = document.getElementById('cancel-client-btn');
  if (cancelBtn) cancelBtn.onclick = () => closeModal();

  const form = document.getElementById('client-form');
  if (form) form.addEventListener('submit', handleFormSubmit);

  const searchInput = document.getElementById('search-clients');
  if (searchInput) searchInput.addEventListener('input', () => renderTable());
}

// ─── Render Table ──────────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('clients-table-body');
  const empty = document.getElementById('clients-empty-state');
  if (!tbody) return;

  const searchInput = document.getElementById('search-clients');
  const search = (searchInput?.value || '').toLowerCase();

  const filtered = allClients.filter(c =>
    (c.name || '').toLowerCase().includes(search) ||
    (c.phone || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search)
  );

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  filtered.forEach(client => {
    const bookingCount = allReservations.filter(r =>
      r.clientName === client.name && r.status !== 'Annulé'
    ).length;

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    if (selectedClientId === client.id) {
      tr.style.backgroundColor = 'var(--bg-surface-hover)';
    }

    tr.innerHTML = `
      <td>
        <div style="font-weight:600;">${client.name || '—'}</div>
        <div style="font-size:0.75rem;color:var(--text-light);">${client.address || '—'}</div>
      </td>
      <td>${client.phone || '—'}</td>
      <td>${client.email || '—'}</td>
      <td style="text-align:center;"><span class="badge badge-info">${bookingCount}</span></td>
      <td>
        <div style="display:flex;gap:6px;justify-content:center;">
          <button class="btn btn-outline btn-icon btn-sm" data-action="edit" data-id="${client.id}" title="Modifier"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn btn-danger btn-icon btn-sm" data-action="delete" data-id="${client.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>`;

    tr.querySelectorAll('button[data-action]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (btn.dataset.action === 'edit') openModal(btn.dataset.id);
        else deleteClient(btn.dataset.id);
      };
    });

    tr.onclick = () => {
      selectedClientId = client.id;
      renderTable();
      showClientProfile(client.id);
    };

    tbody.appendChild(tr);
  });

  // Auto-select first on load
  if (!selectedClientId && filtered.length > 0) {
    selectedClientId = filtered[0].id;
    renderTable();
    showClientProfile(selectedClientId);
  }
}

// ─── Profile Panel ─────────────────────────────────────────────────────────
function showClientProfile(clientId) {
  const content = document.getElementById('profile-card-content');
  if (!content) return;

  const client = allClients.find(c => c.id === clientId);
  if (!client) {
    content.innerHTML = `<div class="no-event-placeholder"><i class="fa-solid fa-id-card"></i><span>Sélectionnez un client.</span></div>`;
    return;
  }

  const sym = currentCurrencySymbol || '€';
  const clientBookings = allReservations.filter(r => r.clientName === client.name);
  const activeBookings = clientBookings.filter(r => r.status !== 'Annulé');
  const lifetimeValue = activeBookings.reduce((s, r) => s + ((r.totalAmount || 0) - (r.remainingAmount || 0)), 0);
  const totalDebt = activeBookings.reduce((s, r) => s + (r.remainingAmount || 0), 0);

  const initials = (client.name || 'XX').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const historyHtml = clientBookings.length === 0
    ? `<div style="font-size:0.85rem;color:var(--text-muted);text-align:center;padding:10px;">Aucun événement.</div>`
    : [...clientBookings].sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || '')).map(res => {
        const badge = res.status === 'Confirmé' ? 'badge-success' : res.status === 'Annulé' ? 'badge-danger' : 'badge-warning';
        const d = res.eventDate ? new Date(res.eventDate).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' }) : '—';
        return `
          <div style="background:var(--bg-app);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:10px;font-size:0.82rem;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <strong>${res.eventType || 'Événement'}</strong>
              <span class="badge ${badge}" style="font-size:0.7rem;padding:2px 8px;">${res.status || 'En attente'}</span>
            </div>
            <div style="color:var(--text-muted);">Date: ${d} — ${(res.totalAmount||0).toLocaleString()} ${sym}</div>
            ${res.remainingAmount > 0 ? `<div style="color:var(--danger);font-weight:600;">Reste: ${res.remainingAmount.toLocaleString()} ${sym}</div>` : ''}
          </div>`;
      }).join('');

  content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div style="text-align:center;border-bottom:1px solid var(--border-color);padding-bottom:14px;">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--color-secondary-light);color:var(--color-secondary);font-size:1.6rem;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-weight:700;">${initials}</div>
        <h4 style="font-size:1.1rem;font-weight:700;">${client.name}</h4>
        <p style="font-size:0.82rem;color:var(--text-muted);"><i class="fa-solid fa-phone"></i> ${client.phone || '—'}</p>
        ${client.email ? `<p style="font-size:0.82rem;color:var(--text-muted);"><i class="fa-solid fa-envelope"></i> ${client.email}</p>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="background:var(--success-light);border:1px solid rgba(16,185,129,.15);border-radius:var(--radius-sm);padding:10px;text-align:center;">
          <div style="font-size:0.68rem;color:var(--success);font-weight:700;text-transform:uppercase;">Payé</div>
          <div style="font-size:1rem;font-weight:800;color:var(--success);">${lifetimeValue.toLocaleString()} ${sym}</div>
        </div>
        <div style="background:${totalDebt>0?'var(--danger-light)':'var(--bg-surface-hover)'};border:1px solid ${totalDebt>0?'rgba(239,68,68,.15)':'var(--border-color)'};border-radius:var(--radius-sm);padding:10px;text-align:center;">
          <div style="font-size:0.68rem;color:${totalDebt>0?'var(--danger)':'var(--text-muted)'};font-weight:700;text-transform:uppercase;">Dette</div>
          <div style="font-size:1rem;font-weight:800;color:${totalDebt>0?'var(--danger)':'var(--text-main)'};">${totalDebt.toLocaleString()} ${sym}</div>
        </div>
      </div>
      <div style="font-size:0.82rem;">
        <strong>Adresse:</strong> <span style="color:var(--text-muted);">${client.address || '—'}</span>
      </div>
      ${client.notes ? `<div style="font-size:0.82rem;background:var(--bg-app);padding:8px;border-radius:var(--radius-sm);border-left:3px solid var(--color-secondary);color:var(--text-muted);font-style:italic;">${client.notes}</div>` : ''}
      <div>
        <h4 style="font-size:0.85rem;font-weight:700;margin-bottom:8px;">Historique (${clientBookings.length})</h4>
        ${historyHtml}
      </div>
    </div>`;
}

// ─── Modal ─────────────────────────────────────────────────────────────────
function openModal(clientId = null) {
  editingId = clientId;
  const form = document.getElementById('client-form');
  const title = document.getElementById('client-modal-title');
  if (form) form.reset();

  if (clientId) {
    const c = allClients.find(cl => cl.id === clientId);
    if (c) {
      if (title) title.innerText = 'Modifier le Client';
      const idEl = document.getElementById('client-id');
      const nameEl = document.getElementById('client-name');
      const phoneEl = document.getElementById('client-phone');
      const emailEl = document.getElementById('client-email');
      const addressEl = document.getElementById('client-address');
      const notesEl = document.getElementById('client-notes');

      if (idEl) idEl.value = c.id;
      if (nameEl) nameEl.value = c.name || '';
      if (phoneEl) phoneEl.value = c.phone || '';
      if (emailEl) emailEl.value = c.email || '';
      if (addressEl) addressEl.value = c.address || '';
      if (notesEl) notesEl.value = c.notes || '';
    }
  } else {
    if (title) title.innerText = 'Nouveau Client';
    const idEl = document.getElementById('client-id');
    if (idEl) idEl.value = '';
  }
  
  const modal = document.getElementById('client-modal');
  if (modal) modal.classList.add('open');
}

function closeModal() {
  const modal = document.getElementById('client-modal');
  if (modal) modal.classList.remove('open');
  editingId = null;
}

// ─── Form Submit ───────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
  e.preventDefault();
  const nameEl = document.getElementById('client-name');
  const phoneEl = document.getElementById('client-phone');
  const emailEl = document.getElementById('client-email');
  const addressEl = document.getElementById('client-address');
  const notesEl = document.getElementById('client-notes');

  if (!nameEl || !phoneEl) return;

  const name = nameEl.value.trim();
  const phone = phoneEl.value.trim();
  const email = emailEl ? emailEl.value.trim() : '';
  const address = addressEl ? addressEl.value.trim() : '';
  const notes = notesEl ? notesEl.value.trim() : '';
  const payload = { name, phone, email, address, notes };

  try {
    if (editingId) {
      await updateDoc(doc(db, "clients", editingId), payload);
      showToast('Client modifié', `${name} mis à jour.`, 'success');
    } else {
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "clients"), payload);
      showToast('Client créé', `${name} ajouté au CRM.`, 'success');
    }
    closeModal();
  } catch (err) {
    showToast('Erreur', err.message, 'danger');
  }
}

// ─── Delete ────────────────────────────────────────────────────────────────
async function deleteClient(id) {
  const c = allClients.find(cl => cl.id === id);
  const hasActive = allReservations.some(r => r.clientName === (c?.name || '') && r.status !== 'Annulé');

  if (hasActive) {
    showToast('Suppression impossible', 'Ce client a des réservations actives. Annulez-les d\'abord.', 'warning');
    return;
  }

  if (!confirm('Supprimer ce client définitivement ?')) return;
  try {
    await deleteDoc(doc(db, "clients", id));
    if (selectedClientId === id) selectedClientId = null;
    showToast('Supprimé', `${c?.name || 'Client'} supprimé.`, 'success');
  } catch (err) {
    showToast('Erreur', err.message, 'danger');
  }
}
