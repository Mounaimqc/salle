/**
 * SallePro - Reservations Page (Firebase Firestore Module)
 */

import { db, auth } from "./firebase.js";
import { showToast, currentCurrencySymbol } from "./app.js";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
  getDocs, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

console.log('reservations.js: Imports loaded successfully');

// Helper to format date as DD/MM/YYYY
function formatDateFR(dateStr) {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

// Calculate the duration of the reservation
function calculateDuration(startDate, endDate, entryTime, exitTime) {
  if (!startDate || !endDate) return "";
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "";
  
  const diffTime = end - start;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive number of days
  
  if (diffDays < 1) return "";

  // Calculate hours if start and end dates are the same
  if (startDate === endDate && entryTime && exitTime) {
    const [hEntry, mEntry] = entryTime.split(':').map(Number);
    const [hExit, mExit] = exitTime.split(':').map(Number);
    const totalMinutes = (hExit * 60 + mExit) - (hEntry * 60 + mEntry);
    if (totalMinutes > 0) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours}h${minutes > 0 ? ' ' + minutes + 'm' : ''} (1 jour)`;
    }
  }
  
  return `${diffDays} jour${diffDays > 1 ? 's' : ''}`;
}

let allReservations = [];
let allClients = [];
let editingId = null;
let currentSettings = {};

window.addEventListener('authSessionLoaded', async () => {
  console.log('reservations.js: authSessionLoaded event received');
  try {
    await initReservationsPage();
  } catch (error) {
    console.error('reservations.js: Page initialization failed:', error);
    const { showFatalError } = await import("./auth.js");
    showFatalError(error);
  }
});

window.addEventListener('spSettingsUpdated', (e) => {
  currentSettings = e.detail || {};
});

async function initReservationsPage() {
  console.log('reservations.js: Initializing reservations page');

  // 1. Real-time Firestore Listeners
  try {
    listenToReservations();
  } catch (err) {
    console.error("reservations.js: Failed to start reservations listener:", err);
  }

  try {
    listenToClients();
  } catch (err) {
    console.error("reservations.js: Failed to start clients listener:", err);
  }

  // 2. UI Bindings
  try {
    bindUIEvents();
  } catch (err) {
    console.error("reservations.js: Failed to bind UI events:", err);
  }

  // 3. Check Query Parameters
  try {
    checkQueryParams();
  } catch (err) {
    console.error("reservations.js: Failed to check query parameters:", err);
  }

  console.log('reservations.js: Page initialization completed');
}

// ─── Real-time Firestore Listener ──────────────────────────────────────────
function listenToReservations() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  const q = query(collection(db, "users", userId, "reservations"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    allReservations = [];
    snapshot.forEach(d => allReservations.push({ id: d.id, ...d.data() }));
    try {
      renderTable();
    } catch (err) {
      console.error("reservations.js: Error rendering table:", err);
    }
  }, err => showToast('Erreur', err.message, 'danger'));
}

function listenToClients() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  onSnapshot(collection(db, "users", userId, "clients"), (snapshot) => {
    allClients = [];
    snapshot.forEach(d => allClients.push({ id: d.id, ...d.data() }));
    try {
      populateClientsDropdown();
    } catch (err) {
      console.error("reservations.js: Error populating clients dropdown:", err);
    }
  }, err => console.error("reservations.js: Error listening to clients:", err));
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
  const openAddBtn = document.getElementById('open-add-modal-btn');
  if (openAddBtn) {
    openAddBtn.onclick = () => openModal();
  }

  const closeBookingBtn = document.getElementById('close-booking-modal');
  if (closeBookingBtn) {
    closeBookingBtn.onclick = () => closeModal();
  }

  const cancelBookingBtn = document.getElementById('cancel-booking-btn');
  if (cancelBookingBtn) {
    cancelBookingBtn.onclick = () => closeModal();
  }

  const form = document.getElementById('booking-form');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }

  // Auto-fill phone on client selection
  const clientSelect = document.getElementById('booking-client-name');
  const phoneInput = document.getElementById('booking-client-phone');
  if (clientSelect && phoneInput) {
    clientSelect.addEventListener('change', () => {
      const selectedOption = clientSelect.options[clientSelect.selectedIndex];
      phoneInput.value = selectedOption?.dataset.phone || '';
    });
  }

  // Auto-calculate remaining
  const total = document.getElementById('booking-total');
  const deposit = document.getElementById('booking-deposit');
  const remaining = document.getElementById('booking-remaining');
  const updateRemaining = () => {
    if (total && deposit && remaining) {
      const t = parseFloat(total.value) || 0;
      const d = parseFloat(deposit.value) || 0;
      remaining.value = Math.max(0, t - d);
    }
  };
  total?.addEventListener('input', updateRemaining);
  deposit?.addEventListener('input', updateRemaining);

  // Duration calculation live updates
  const startDateEl = document.getElementById('booking-start-date');
  const endDateEl = document.getElementById('booking-end-date');
  const entryTimeEl = document.getElementById('booking-entry-time');
  const exitTimeEl = document.getElementById('booking-exit-time');
  const durationLabel = document.getElementById('booking-duration-label');

  const updateDurationUI = () => {
    if (startDateEl && endDateEl && entryTimeEl && exitTimeEl && durationLabel) {
      const duration = calculateDuration(startDateEl.value, endDateEl.value, entryTimeEl.value, exitTimeEl.value);
      durationLabel.innerText = duration ? `Durée : ${duration}` : 'Durée : --';
    }
  };

  startDateEl?.addEventListener('input', updateDurationUI);
  startDateEl?.addEventListener('change', updateDurationUI);
  endDateEl?.addEventListener('input', updateDurationUI);
  endDateEl?.addEventListener('change', updateDurationUI);
  entryTimeEl?.addEventListener('input', updateDurationUI);
  entryTimeEl?.addEventListener('change', updateDurationUI);
  exitTimeEl?.addEventListener('input', updateDurationUI);
  exitTimeEl?.addEventListener('change', updateDurationUI);

  // Filters
  ['search-bookings','filter-type','filter-status','filter-date-start','filter-date-end'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('input', () => renderTable());
    el?.addEventListener('change', () => renderTable());
  });

  const resetFiltersBtn = document.getElementById('reset-filters-btn');
  if (resetFiltersBtn) {
    resetFiltersBtn.onclick = () => {
      ['search-bookings','filter-type','filter-status'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      ['filter-date-start','filter-date-end'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      renderTable();
    };
  }

  // Receipt modal close
  const closeReceipt = () => {
    const modal = document.getElementById('receipt-modal');
    if (modal) modal.classList.remove('open');
  };
  const closeReceiptHeaderBtn = document.getElementById('close-receipt-modal');
  const closeReceiptFooterBtn = document.getElementById('close-receipt-btn');
  if (closeReceiptHeaderBtn) closeReceiptHeaderBtn.onclick = closeReceipt;
  if (closeReceiptFooterBtn) closeReceiptFooterBtn.onclick = closeReceipt;
}

function checkQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const newDate = params.get('newDate');
  if (newDate) {
    openModal();
    const startDateEl = document.getElementById('booking-start-date');
    const endDateEl = document.getElementById('booking-end-date');
    const entryTimeEl = document.getElementById('booking-entry-time');
    const exitTimeEl = document.getElementById('booking-exit-time');
    if (startDateEl) startDateEl.value = newDate;
    if (endDateEl) endDateEl.value = newDate;
    if (entryTimeEl) entryTimeEl.value = '08:00';
    if (exitTimeEl) exitTimeEl.value = '22:00';
    
    const durationLabel = document.getElementById('booking-duration-label');
    if (durationLabel) durationLabel.innerText = 'Durée : 1 jour';
  }
  const search = params.get('search');
  if (search) {
    const el = document.getElementById('search-bookings');
    if (el) { 
      el.value = search; 
      renderTable(); 
    }
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
    const matchType = !typeFilter || typeFilter === 'all' || r.eventType === typeFilter;
    const matchStatus = !statusFilter || statusFilter === 'all' || r.status === statusFilter;
    const matchDate = (!dateStart || r.startDate >= dateStart) &&
                      (!dateEnd || r.endDate <= dateEnd);
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

    const eventDate = res.startDate && res.endDate
      ? `Du ${formatDateFR(res.startDate)} au ${formatDateFR(res.endDate)}<br><small style="color:var(--text-light);font-size:0.75rem;"><i class="fa-regular fa-clock"></i> ${res.entryTime || '—'} à ${res.exitTime || '—'}</small>`
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
      <td><span class="badge ${badge}">${res.status || 'En attente'}</span></td>
      <td>
        <div style="display:flex;gap:6px;justify-content:center;">
          <button class="btn btn-outline btn-icon btn-sm" title="Reçu" style="color:var(--info);" data-action="receipt" data-id="${res.id}"><i class="fa-solid fa-receipt"></i></button>
          <button class="btn btn-outline btn-icon btn-sm" title="Modifier" data-action="edit" data-id="${res.id}"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn btn-danger btn-icon btn-sm" title="Supprimer" data-action="delete" data-id="${res.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>`;

    // Bind action buttons
    tr.querySelectorAll('button[data-action]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'edit') openModal(id);
        else if (action === 'delete') deleteReservation(id);
        else if (action === 'receipt') showReceipt(id);
      };
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
  
  if (form) form.reset();
  const remainingEl = document.getElementById('booking-remaining');
  if (remainingEl) remainingEl.value = 0;

  if (reservationId) {
    const res = allReservations.find(r => r.id === reservationId);
    if (res) {
      if (title) title.innerText = 'Modifier la Réservation';
      const idEl = document.getElementById('booking-id');
      const nameEl = document.getElementById('booking-client-name');
      const phoneEl = document.getElementById('booking-client-phone');
      const typeEl = document.getElementById('booking-event-type');
      const startDateEl = document.getElementById('booking-start-date');
      const endDateEl = document.getElementById('booking-end-date');
      const entryTimeEl = document.getElementById('booking-entry-time');
      const exitTimeEl = document.getElementById('booking-exit-time');
      const guestsEl = document.getElementById('booking-guests');
      const statusEl = document.getElementById('booking-status');
      const totalEl = document.getElementById('booking-total');
      const depositEl = document.getElementById('booking-deposit');
      const notesEl = document.getElementById('booking-notes');

      if (idEl) idEl.value = res.id;
      if (nameEl) nameEl.value = res.clientName || '';
      if (phoneEl) phoneEl.value = res.phone || '';
      if (typeEl) typeEl.value = res.eventType || '';
      if (startDateEl) startDateEl.value = res.startDate || '';
      if (endDateEl) endDateEl.value = res.endDate || '';
      if (entryTimeEl) entryTimeEl.value = res.entryTime || '';
      if (exitTimeEl) exitTimeEl.value = res.exitTime || '';
      if (guestsEl) guestsEl.value = res.guests || '';
      if (statusEl) statusEl.value = res.status || 'En attente';
      if (totalEl) totalEl.value = res.totalAmount || '';
      if (depositEl) depositEl.value = res.deposit || '';
      if (remainingEl) remainingEl.value = res.remainingAmount || '';
      if (notesEl) notesEl.value = res.notes || '';

      const durationLabel = document.getElementById('booking-duration-label');
      if (durationLabel) {
        durationLabel.innerText = res.duration ? `Durée : ${res.duration}` : 'Durée : --';
      }
    }
  } else {
    if (title) title.innerText = 'Nouvelle Réservation';
    const idEl = document.getElementById('booking-id');
    const statusEl = document.getElementById('booking-status');
    if (idEl) idEl.value = '';
    if (statusEl) statusEl.value = 'En attente';

    const startDateEl = document.getElementById('booking-start-date');
    const endDateEl = document.getElementById('booking-end-date');
    const entryTimeEl = document.getElementById('booking-entry-time');
    const exitTimeEl = document.getElementById('booking-exit-time');
    const durationLabel = document.getElementById('booking-duration-label');

    if (startDateEl) startDateEl.value = '';
    if (endDateEl) endDateEl.value = '';
    if (entryTimeEl) entryTimeEl.value = '';
    if (exitTimeEl) exitTimeEl.value = '';
    if (durationLabel) durationLabel.innerText = 'Durée : --';
  }

  if (modal) modal.classList.add('open');
}

function closeModal() {
  const modal = document.getElementById('booking-modal');
  if (modal) modal.classList.remove('open');
  editingId = null;
}

// ─── Form Submit ───────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
  e.preventDefault();

  const nameEl = document.getElementById('booking-client-name');
  const phoneEl = document.getElementById('booking-client-phone');
  const typeEl = document.getElementById('booking-event-type');
  const startDateEl = document.getElementById('booking-start-date');
  const endDateEl = document.getElementById('booking-end-date');
  const entryTimeEl = document.getElementById('booking-entry-time');
  const exitTimeEl = document.getElementById('booking-exit-time');
  const guestsEl = document.getElementById('booking-guests');
  const statusEl = document.getElementById('booking-status');
  const totalEl = document.getElementById('booking-total');
  const depositEl = document.getElementById('booking-deposit');
  const notesEl = document.getElementById('booking-notes');

  if (!nameEl || !typeEl || !startDateEl || !endDateEl || !entryTimeEl || !exitTimeEl || !totalEl || !statusEl) return;

  const clientName = nameEl.value.trim();
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const eventType = typeEl.value;
  const startDate = startDateEl.value;
  const endDate = endDateEl.value;
  const entryTime = entryTimeEl.value;
  const exitTime = exitTimeEl.value;
  const guests = parseInt(guestsEl ? guestsEl.value : 0) || 0;
  const status = statusEl.value;
  const totalAmount = parseFloat(totalEl.value) || 0;
  const deposit = parseFloat(depositEl ? depositEl.value : 0) || 0;
  const remainingAmount = Math.max(0, totalAmount - deposit);
  const notes = notesEl ? notesEl.value.trim() : '';

  if (deposit > totalAmount) {
    showToast('Validation', "L'acompte ne peut pas dépasser le montant total.", 'warning');
    return;
  }

  if (endDate < startDate) {
    showToast('Validation', 'La date de fin doit être supérieure ou égale à la date de début.', 'warning');
    return;
  }

  if (exitTime <= entryTime) {
    showToast('Validation', "L'heure de sortie doit être supérieure à l'heure d'entrée.", 'warning');
    return;
  }

  // Double-booking check (only for non-cancelled bookings)
  if (status !== 'Annulé') {
    const conflict = allReservations.find(r =>
      r.id !== editingId &&
      r.status !== 'Annulé' &&
      startDate <= r.endDate &&
      endDate >= r.startDate
    );
    if (conflict) {
      showToast('Conflit de réservation', `⚠️ Cette période chevauche une réservation existante pour ${conflict.clientName} (du ${formatDateFR(conflict.startDate)} au ${formatDateFR(conflict.endDate)}).`, 'danger');
      return;
    }
  }

  const duration = calculateDuration(startDate, endDate, entryTime, exitTime);

  const payload = {
    clientName, phone, eventType, startDate, endDate, entryTime, exitTime, duration, guests,
    status, totalAmount, deposit, remainingAmount, notes
  };

  const userId = auth.currentUser?.uid;
  if (!userId) return;

  try {
    if (editingId) {
      await updateDoc(doc(db, "users", userId, "reservations", editingId), payload);
      showToast('Réservation modifiée', 'Modifications enregistrées.', 'success');
    } else {
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "users", userId, "reservations"), payload);
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
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  try {
    await deleteDoc(doc(db, "users", userId, "reservations", id));
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

  const hallNameEl = document.getElementById('receipt-hall-name');
  const receiptIdEl = document.getElementById('receipt-id');
  const receiptDateEl = document.getElementById('receipt-date');
  const clientNameEl = document.getElementById('receipt-client-name');
  const clientPhoneEl = document.getElementById('receipt-client-phone');
  const eventTypeEl = document.getElementById('receipt-event-type');
  const eventDateEl = document.getElementById('receipt-event-date');
  const guestsEl = document.getElementById('receipt-event-guests');
  const totalValEl = document.getElementById('receipt-total-val');
  const depositValEl = document.getElementById('receipt-deposit-val');
  const remainingValEl = document.getElementById('receipt-remaining-val');

  if (hallNameEl) hallNameEl.innerText = settings?.hallName || 'SallePro';
  if (receiptIdEl) receiptIdEl.innerText = res.id;
  if (receiptDateEl) receiptDateEl.innerText = new Date().toLocaleDateString('fr-FR');
  if (clientNameEl) clientNameEl.innerText = res.clientName || '—';
  if (clientPhoneEl) clientPhoneEl.innerText = res.phone || '—';
  if (eventTypeEl) eventTypeEl.innerText = res.eventType || '—';
  if (eventDateEl) {
    eventDateEl.innerHTML = res.startDate && res.endDate
      ? `Du ${formatDateFR(res.startDate)} au ${formatDateFR(res.endDate)}<br><small style="color:var(--text-muted);font-size:0.85rem;">Horaire : ${res.entryTime || '—'} à ${res.exitTime || '—'}</small>`
      : '—';
  }
  if (guestsEl) guestsEl.innerText = `${res.guests || 0} convives`;
  if (totalValEl) totalValEl.innerText = `${(res.totalAmount||0).toLocaleString()} ${sym}`;
  if (depositValEl) depositValEl.innerText = `${(res.deposit||0).toLocaleString()} ${sym}`;
  if (remainingValEl) remainingValEl.innerText = `${(res.remainingAmount||0).toLocaleString()} ${sym}`;

  // PDF / TXT mock export button
  const pdfBtn = document.getElementById('receipt-export-pdf-btn');
  if (pdfBtn) {
    pdfBtn.onclick = () => exportReceiptText(res, settings, sym);
  }

  // Print button
  const printBtn = document.getElementById('print-receipt-btn');
  if (printBtn) {
    printBtn.onclick = () => window.print();
  }

  const modal = document.getElementById('receipt-modal');
  if (modal) modal.classList.add('open');
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
Période   : Du ${formatDateFR(res.startDate)} au ${formatDateFR(res.endDate)}
Horaire   : de ${res.entryTime || '—'} à ${res.exitTime || '—'}
Durée     : ${res.duration || '—'}
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
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Téléchargement', 'Facture exportée.', 'success');
}
