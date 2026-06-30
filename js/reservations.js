/**
 * SallePro - Reservations Page (Firebase Firestore Module)
 */

import { db } from "./firebase.js";
import { showToast, currentCurrencySymbol } from "./app.js";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
  getDocs, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

let allReservations = [];
let allClients = [];
let editingId = null;
let currentSettings = {};

window.addEventListener('authSessionLoaded', () => {
  initReservationsPage();
});

window.addEventListener('spSettingsUpdated', (e) => {
  currentSettings = e.detail || {};
});

function initReservationsPage() {
  listenToReservations();
  listenToClients();
  bindUIEvents();
  checkQueryParams();
}

// ─── Real-time Firestore Listener ──────────────────────────────────────────
function listenToReservations() {
  const q = query(collection(db, "reservations"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    allReservations = [];
    snapshot.forEach(d => allReservations.push({ id: d.id, ...d.data() }));
    renderTable();
  }, err => showToast('Erreur', err.message, 'danger'));
}

function listenToClients() {
  onSnapshot(collection(db, "clients"), (snapshot) => {
    allClients = [];
    snapshot.forEach(d => allClients.push({ id: d.id, ...d.data() }));
    populateClientsDropdown();
  }, err => console.error("Error listening to clients:", err));
}

function populateClientsDropdown() {
  const select = document.getElementById('booking-client-name');
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = '<option value="">-- Sélectionner un client --</option>';
  const sortedClients = [...allClients].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  sortedClients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.dataset.phone = c.phone || '';
    opt.innerText = `${c.name} (${c.phone || 'Pas de tél.'})`;
    select.appendChild(opt);
  });
  select.value = currentValue;
}

// ─── UI Event Bindings ─────────────────────────────────────────────────────
function bindUIEvents() {
  document.getElementById('open-add-modal-btn').addEventListener('click', () => openModal());

  document.getElementById('close-booking-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-booking-btn')?.addEventListener('click', closeModal);

  document.getElementById('booking-form').addEventListener('submit', handleFormSubmit);

  // Auto-fill phone on client selection
  const clientSelect = document.getElementById('booking-client-name');
  const phoneInput = document.getElementById('booking-client-phone');
  clientSelect?.addEventListener('change', () => {
    const selectedOption = clientSelect.options[clientSelect.selectedIndex];
    phoneInput.value = selectedOption?.dataset.phone || '';
  });

  // Auto-calculate remaining
  const total = document.getElementById('booking-total');
  const deposit = document.getElementById('booking-deposit');
  const remaining = document.getElementById('booking-remaining');
  const updateRemaining = () => {
    const t = parseFloat(total.value) || 0;
    const d = parseFloat(deposit.value) || 0;
    remaining.value = Math.max(0, t - d);
  };
  total?.addEventListener('input', updateRemaining);
  deposit?.addEventListener('input', updateRemaining);

  // Filters
  ['search-bookings','filter-type','filter-status','filter-date-start','filter-date-end'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderTable);
    document.getElementById(id)?.addEventListener('change', renderTable);
  });

  document.getElementById('reset-filters-btn')?.addEventListener('click', () => {
    ['search-bookings','filter-type','filter-status'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['filter-date-start','filter-date-end'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderTable();
  });

  // Receipt modal close
  const closeReceipt = () => document.getElementById('receipt-modal')?.classList.remove('open');
  document.getElementById('close-receipt-modal')?.addEventListener('click', closeReceipt);
  document.getElementById('close-receipt-btn')?.addEventListener('click', closeReceipt);
}

function checkQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const newDate = params.get('newDate');
  if (newDate) {
    openModal();
    const dateEl = document.getElementById('booking-event-date');
    if (dateEl) dateEl.value = newDate;
  }
  const search = params.get('search');
  if (search) {
    const el = document.getElementById('search-bookings');
    if (el) { el.value = search; renderTable(); }
  }
}

// ─── Render Table ──────────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('bookings-table-body');
  const empty = document.getElementById('bookings-empty-state');
  if (!tbody) return;

  const sym = currentCurrencySymbol || currentSettings?.currency || '€';
  const search = (document.getElementById('search-bookings')?.value || '').toLowerCase();
  const typeFilter = document.getElementById('filter-type')?.value || '';
  const statusFilter = document.getElementById('filter-status')?.value || '';
  const dateStart = document.getElementById('filter-date-start')?.value || '';
  const dateEnd = document.getElementById('filter-date-end')?.value || '';

  const filtered = allReservations.filter(r => {
    const matchSearch = (r.clientName || '').toLowerCase().includes(search) ||
                        (r.notes || '').toLowerCase().includes(search);
    const matchType = !typeFilter || r.eventType === typeFilter;
    const matchStatus = !statusFilter || r.status === statusFilter;
    const matchDate = (!dateStart || r.eventDate >= dateStart) &&
                      (!dateEnd || r.eventDate <= dateEnd);
    return matchSearch && matchType && matchStatus && matchDate;
  });

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  filtered.forEach(res => {
    let badge = res.status === 'Confirmé' ? 'badge-success'
              : res.status === 'Annulé' ? 'badge-danger' : 'badge-warning';

    const eventDate = res.eventDate
      ? new Date(res.eventDate).toLocaleDateString('fr-FR')
      : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="font-weight:600;">${res.clientName || '—'}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);">${res.phone || ''}</div>
      </td>
      <td>
        <div style="font-weight:500;">${res.eventType || '—'}</div>
        <div style="font-size:0.75rem;color:var(--text-light);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${res.notes||''}">${res.notes || 'Aucune note'}</div>
      </td>
      <td style="font-weight:500;">${eventDate}</td>
      <td>${res.guests || 0}</td>
      <td style="font-weight:700;">${(res.totalAmount||0).toLocaleString()} ${sym}</td>
      <td style="color:var(--success);font-weight:500;">${(res.deposit||0).toLocaleString()} ${sym}</td>
      <td style="color:${(res.remainingAmount||0)>0?'var(--danger)':'var(--success)'};font-weight:700;">${(res.remainingAmount||0).toLocaleString()} ${sym}</td>
      <td><span class="badge ${badge}">${res.status}</span></td>
      <td>
        <div style="display:flex;gap:6px;justify-content:center;">
          <button class="btn btn-outline btn-icon btn-sm" title="Reçu" style="color:var(--info);" data-action="receipt" data-id="${res.id}"><i class="fa-solid fa-receipt"></i></button>
          <button class="btn btn-outline btn-icon btn-sm" title="Modifier" data-action="edit" data-id="${res.id}"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn btn-danger btn-icon btn-sm" title="Supprimer" data-action="delete" data-id="${res.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>`;

    // Bind action buttons
    tr.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'edit') openModal(id);
        else if (action === 'delete') deleteReservation(id);
        else if (action === 'receipt') showReceipt(id);
      });
    });

    tbody.appendChild(tr);
  });
}

// ─── Modal Open / Close ────────────────────────────────────────────────────
function openModal(reservationId = null) {
  editingId = reservationId;
  const modal = document.getElementById('booking-modal');
  const title = document.getElementById('booking-modal-title');
  const form = document.getElementById('booking-form');
  form.reset();
  document.getElementById('booking-remaining').value = 0;

  if (reservationId) {
    const res = allReservations.find(r => r.id === reservationId);
    if (res) {
      title && (title.innerText = 'Modifier la Réservation');
      document.getElementById('booking-id').value = res.id;
      document.getElementById('booking-client-name').value = res.clientName || '';
      document.getElementById('booking-client-phone').value = res.phone || '';
      document.getElementById('booking-event-type').value = res.eventType || '';
      document.getElementById('booking-event-date').value = res.eventDate || '';
      document.getElementById('booking-guests').value = res.guests || '';
      document.getElementById('booking-status').value = res.status || 'En attente';
      document.getElementById('booking-total').value = res.totalAmount || '';
      document.getElementById('booking-deposit').value = res.deposit || '';
      document.getElementById('booking-remaining').value = res.remainingAmount || '';
      document.getElementById('booking-notes').value = res.notes || '';
    }
  } else {
    title && (title.innerText = 'Nouvelle Réservation');
    document.getElementById('booking-id').value = '';
    document.getElementById('booking-status').value = 'En attente';
  }

  modal?.classList.add('open');
}

function closeModal() {
  document.getElementById('booking-modal')?.classList.remove('open');
  editingId = null;
}

// ─── Form Submit ───────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
  e.preventDefault();

  const clientName = document.getElementById('booking-client-name').value.trim();
  const phone = document.getElementById('booking-client-phone').value.trim();
  const eventType = document.getElementById('booking-event-type').value;
  const eventDate = document.getElementById('booking-event-date').value;
  const guests = parseInt(document.getElementById('booking-guests').value) || 0;
  const status = document.getElementById('booking-status').value;
  const totalAmount = parseFloat(document.getElementById('booking-total').value) || 0;
  const deposit = parseFloat(document.getElementById('booking-deposit').value) || 0;
  const remainingAmount = Math.max(0, totalAmount - deposit);
  const notes = document.getElementById('booking-notes').value.trim();

  if (deposit > totalAmount) {
    showToast('Validation', "L'acompte ne peut pas dépasser le montant total.", 'warning');
    return;
  }

  // Double-booking check (only for non-cancelled bookings)
  if (status !== 'Annulé') {
    const conflict = allReservations.find(r =>
      r.eventDate === eventDate &&
      r.id !== editingId &&
      r.status !== 'Annulé'
    );
    if (conflict) {
      if (!confirm(`⚠️ La date du ${new Date(eventDate).toLocaleDateString('fr-FR')} est déjà réservée pour ${conflict.clientName}. Continuer quand même ?`)) {
        return;
      }
    }
  }

  const payload = {
    clientName, phone, eventType, eventDate, guests,
    status, totalAmount, deposit, remainingAmount, notes
  };

  try {
    if (editingId) {
      await updateDoc(doc(db, "reservations", editingId), payload);
      showToast('Réservation modifiée', 'Modifications enregistrées.', 'success');
    } else {
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "reservations"), payload);
      showToast('Réservation créée', `${clientName} ajouté avec succès.`, 'success');
    }
    closeModal();
  } catch (err) {
    showToast('Erreur', err.message, 'danger');
  }
}

// ─── Delete ────────────────────────────────────────────────────────────────
async function deleteReservation(id) {
  if (!confirm('Voulez-vous vraiment supprimer cette réservation ? Action irréversible.')) return;
  try {
    await deleteDoc(doc(db, "reservations", id));
    showToast('Supprimé', 'La réservation a été supprimée.', 'success');
  } catch (err) {
    showToast('Erreur', err.message, 'danger');
  }
}

// ─── Receipt ───────────────────────────────────────────────────────────────
function showReceipt(id) {
  const res = allReservations.find(r => r.id === id);
  if (!res) return;

  const sym = currentCurrencySymbol || '€';
  const settings = currentSettings;

  document.getElementById('receipt-hall-name').innerText = settings?.hallName || 'SallePro';
  document.getElementById('receipt-id').innerText = res.id;
  document.getElementById('receipt-date').innerText = new Date().toLocaleDateString('fr-FR');
  document.getElementById('receipt-client-name').innerText = res.clientName;
  document.getElementById('receipt-client-phone').innerText = res.phone || '—';
  document.getElementById('receipt-event-type').innerText = res.eventType;
  document.getElementById('receipt-event-date').innerText = res.eventDate
    ? new Date(res.eventDate).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    : '—';
  document.getElementById('receipt-event-guests').innerText = `${res.guests} convives`;
  document.getElementById('receipt-total-val').innerText = `${(res.totalAmount||0).toLocaleString()} ${sym}`;
  document.getElementById('receipt-deposit-val').innerText = `${(res.deposit||0).toLocaleString()} ${sym}`;
  document.getElementById('receipt-remaining-val').innerText = `${(res.remainingAmount||0).toLocaleString()} ${sym}`;

  // PDF mock download button
  const pdfBtn = document.getElementById('receipt-export-pdf-btn');
  if (pdfBtn) pdfBtn.onclick = () => exportReceiptText(res, settings, sym);

  document.getElementById('receipt-modal')?.classList.add('open');
}

function exportReceiptText(res, settings, sym) {
  const text = `
==================================================
              FACTURE DE RESERVATION — SallePro
==================================================
Salle     : ${settings?.hallName || 'SallePro'}
Adresse   : ${settings?.address || '—'}
Téléphone : ${settings?.phone || '—'}
--------------------------------------------------
N° Reçu   : ${res.id}
Émise le  : ${new Date().toLocaleDateString('fr-FR')}
--------------------------------------------------
Client    : ${res.clientName}
Tél.      : ${res.phone || '—'}
--------------------------------------------------
Événement : ${res.eventType}
Date      : ${res.eventDate ? new Date(res.eventDate).toLocaleDateString('fr-FR') : '—'}
Invités   : ${res.guests}
Statut    : ${res.status}
Notes     : ${res.notes || 'Aucune'}
--------------------------------------------------
Total     : ${(res.totalAmount||0).toLocaleString()} ${sym}
Acompte   : ${(res.deposit||0).toLocaleString()} ${sym}
Reste dû  : ${(res.remainingAmount||0).toLocaleString()} ${sym}
==================================================
`;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `facture_${res.id}.txt`;
  a.click();
  showToast('Téléchargement', 'Facture exportée.', 'success');
}
