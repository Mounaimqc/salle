/**
 * SallePro - Reservation Page Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  loadClientsDropdown();
  renderBookingsTable();

  // Modal elements
  const modal = document.getElementById('booking-modal');
  const addBtn = document.getElementById('open-add-modal-btn');
  const closeBtn = document.getElementById('close-modal-btn');
  const cancelBtn = document.getElementById('cancel-modal-btn');
  const form = document.getElementById('booking-form');

  // Open modal for new booking
  addBtn.onclick = () => openBookingModal();
  closeBtn.onclick = () => closeModal();
  cancelBtn.onclick = () => closeModal();

  // Auto calculate remaining balance on input change
  const totalInput = document.getElementById('booking-total');
  const depositInput = document.getElementById('booking-deposit');
  const remainingInput = document.getElementById('booking-remaining');

  const updateRemaining = () => {
    const total = parseFloat(totalInput.value) || 0;
    const deposit = parseFloat(depositInput.value) || 0;
    remainingInput.value = Math.max(0, total - deposit);
  };

  totalInput.addEventListener('input', updateRemaining);
  depositInput.addEventListener('input', updateRemaining);

  // Form submission
  form.addEventListener('submit', handleFormSubmit);

  // Toolbar event listeners
  document.getElementById('search-bookings').addEventListener('input', renderBookingsTable);
  document.getElementById('filter-type').addEventListener('change', renderBookingsTable);
  document.getElementById('filter-status').addEventListener('change', renderBookingsTable);
  document.getElementById('filter-date-start').addEventListener('change', renderBookingsTable);
  document.getElementById('filter-date-end').addEventListener('change', renderBookingsTable);

  document.getElementById('reset-filters-btn').onclick = () => {
    document.getElementById('search-bookings').value = '';
    document.getElementById('filter-type').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-date-start').value = '';
    document.getElementById('filter-date-end').value = '';
    renderBookingsTable();
    showToast('Filtres réinitialisés', 'Affichage de toutes les réservations.', 'info');
  };

  // Receipt Modal Close
  document.getElementById('close-receipt-modal-btn').onclick = () => {
    document.getElementById('receipt-modal').classList.remove('open');
  };

  // Check URL parameters for redirects
  checkQueryParameters();
});

/**
 * Check url parameters (e.g. from calendar or dashboard clicks)
 */
function checkQueryParameters() {
  const params = new URLSearchParams(window.location.search);
  
  // 1. Check for ?newDate=YYYY-MM-DD
  const newDate = params.get('newDate');
  if (newDate) {
    openBookingModal();
    document.getElementById('booking-event-date').value = newDate;
  }

  // 2. Check for ?search=Sophie
  const searchName = params.get('search');
  if (searchName) {
    const searchInput = document.getElementById('search-bookings');
    searchInput.value = searchName;
    renderBookingsTable();
  }
}

/**
 * Load list of clients into dropdown
 */
function loadClientsDropdown() {
  const select = document.getElementById('booking-client');
  if (!select) return;

  const clients = db.getTable('clients');
  select.innerHTML = '<option value="" disabled selected>-- Sélectionner un client --</option>';
  
  if (clients.length === 0) {
    select.innerHTML += '<option value="" disabled>Aucun client disponible. Créez-en un d\'abord.</option>';
    return;
  }

  clients.forEach(c => {
    select.innerHTML += `<option value="${c.id}">${c.name} (${c.phone})</option>`;
  });
}

/**
 * Open Modal Form
 */
function openBookingModal(bookingId = null) {
  const modal = document.getElementById('booking-modal');
  const title = document.getElementById('modal-title-label');
  const form = document.getElementById('booking-form');
  
  form.reset();
  loadClientsDropdown(); // reload list in case client was added

  if (bookingId) {
    title.innerText = 'Éditer la Réservation';
    const booking = db.getOne('reservations', bookingId);
    if (booking) {
      document.getElementById('booking-id').value = booking.id;
      document.getElementById('booking-client').value = booking.clientId;
      document.getElementById('booking-event-type').value = booking.eventType;
      document.getElementById('booking-guests').value = booking.guests;
      document.getElementById('booking-event-date').value = booking.eventDate;
      document.getElementById('booking-status').value = booking.status;
      document.getElementById('booking-total').value = booking.totalAmount;
      document.getElementById('booking-deposit').value = booking.deposit;
      document.getElementById('booking-remaining').value = booking.remainingAmount;
      document.getElementById('booking-notes').value = booking.notes || '';
    }
  } else {
    title.innerText = 'Nouvelle Réservation';
    document.getElementById('booking-id').value = '';
    document.getElementById('booking-status').value = 'En attente';
    document.getElementById('booking-remaining').value = 0;
  }

  modal.classList.add('open');
}

function closeModal() {
  document.getElementById('booking-modal').classList.remove('open');
}

/**
 * Handle Form Submission
 */
function handleFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('booking-id').value;
  const clientId = document.getElementById('booking-client').value;
  const eventType = document.getElementById('booking-event-type').value;
  const guests = parseInt(document.getElementById('booking-guests').value) || 0;
  const eventDate = document.getElementById('booking-event-date').value;
  const status = document.getElementById('booking-status').value;
  const totalAmount = parseFloat(document.getElementById('booking-total').value) || 0;
  const deposit = parseFloat(document.getElementById('booking-deposit').value) || 0;
  const remainingAmount = parseFloat(document.getElementById('booking-remaining').value) || 0;
  const notes = document.getElementById('booking-notes').value.trim();

  // Validate math
  if (deposit > totalAmount) {
    showToast('Erreur de validation', 'L\'acompte ne peut pas être supérieur au montant total.', 'danger');
    return;
  }

  if (!clientId) {
    showToast('Erreur de validation', 'Veuillez sélectionner un client.', 'danger');
    return;
  }

  // Check double-booking date conflicts for other active bookings
  const reservations = db.getTable('reservations');
  const hasConflict = reservations.some(r => 
    r.eventDate === eventDate && 
    r.id !== id && 
    r.status !== 'Annulé' && 
    status !== 'Annulé'
  );

  if (hasConflict) {
    if (!confirm('Attention: La date sélectionnée est déjà réservée pour un autre événement actif. Souhaitez-vous quand même enregistrer cette réservation (Surchargement de date) ?')) {
      return;
    }
  }

  const payload = {
    clientId,
    eventType,
    guests,
    eventDate,
    status,
    totalAmount,
    deposit,
    remainingAmount,
    notes
  };

  if (id) {
    // Update
    db.updateOne('reservations', id, payload);
    showToast('Réservation modifiée', 'Les modifications ont été enregistrées avec succès.', 'success');
  } else {
    // Insert
    payload.id = 'res-' + Date.now();
    payload.bookingDate = new Date().toISOString().split('T')[0];
    db.insertOne('reservations', payload);
    showToast('Réservation créée', 'La nouvelle réservation a été enregistrée.', 'success');
  }

  closeModal();
  renderBookingsTable();
}

/**
 * Render reservations table with filters
 */
function renderBookingsTable() {
  const tbody = document.getElementById('bookings-table-body');
  const emptyState = document.getElementById('bookings-empty-state');
  if (!tbody) return;

  const reservations = db.getTable('reservations');
  const clients = db.getTable('clients');
  const settings = db.getTable('settings');
  const currency = settings.currency || '€';

  // Get filter inputs
  const searchQuery = document.getElementById('search-bookings').value.toLowerCase().trim();
  const filterType = document.getElementById('filter-type').value;
  const filterStatus = document.getElementById('filter-status').value;
  const dateStart = document.getElementById('filter-date-start').value;
  const dateEnd = document.getElementById('filter-date-end').value;

  // Filter list
  const filtered = reservations.filter(res => {
    const client = clients.find(c => c.id === res.clientId) || { name: 'Client Inconnu' };
    
    // Search match (name or notes)
    const matchesSearch = client.name.toLowerCase().includes(searchQuery) || 
                          (res.notes && res.notes.toLowerCase().includes(searchQuery));
    
    // Type match
    const matchesType = !filterType || res.eventType === filterType;

    // Status match
    const matchesStatus = !filterStatus || res.status === filterStatus;

    // Date range match
    const matchesDateRange = (!dateStart || res.eventDate >= dateStart) && 
                             (!dateEnd || res.eventDate <= dateEnd);

    return matchesSearch && matchesType && matchesStatus && matchesDateRange;
  });

  // Sort by event date descending
  filtered.sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
    document.getElementById('empty-state-add-btn').onclick = () => openBookingModal();
    return;
  }

  emptyState.style.display = 'none';

  filtered.forEach(res => {
    const client = clients.find(c => c.id === res.clientId) || { name: 'Client Inconnu', phone: '' };

    let badgeClass = 'badge-warning';
    if (res.status === 'Confirmé') badgeClass = 'badge-success';
    if (res.status === 'Annulé') badgeClass = 'badge-danger';

    // Dates formatting
    const dEvent = new Date(res.eventDate);
    const formattedEventDate = dEvent.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="font-weight: 600;">${client.name}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">${client.phone}</div>
      </td>
      <td>
        <div style="font-weight: 500;">${res.eventType}</div>
        <div style="font-size: 0.75rem; color: var(--text-light); max-width: 150px; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${res.notes || ''}">${res.notes || 'Aucune note'}</div>
      </td>
      <td style="font-weight: 500;">${formattedEventDate}</td>
      <td>${res.guests} pers.</td>
      <td style="font-weight: 700; color: var(--color-primary);">${res.totalAmount} ${currency}</td>
      <td style="color: var(--success); font-weight: 500;">${res.deposit} ${currency}</td>
      <td style="color: ${res.remainingAmount > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight: 700;">${res.remainingAmount} ${currency}</td>
      <td><span class="badge ${badgeClass}">${res.status}</span></td>
      <td>
        <div style="display: flex; gap: 6px; justify-content: center;">
          <button class="btn btn-outline btn-icon btn-sm" onclick="showReceipt('${res.id}')" title="Reçu / Facturation" style="color: var(--info); border-color: rgba(59, 130, 246, 0.2);">
            <i class="fa-solid fa-receipt"></i>
          </button>
          <button class="btn btn-outline btn-icon btn-sm" onclick="openBookingModal('${res.id}')" title="Modifier">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="deleteBooking('${res.id}')" title="Supprimer">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Delete Booking
 */
function deleteBooking(id) {
  if (confirm('Voulez-vous vraiment supprimer cette réservation ? Cette opération est irréversible.')) {
    db.deleteOne('reservations', id);
    showToast('Réservation supprimée', 'L\'enregistrement a été supprimé du système.', 'success');
    renderBookingsTable();
  }
}

/**
 * Show Invoice Receipt Modal
 */
function showReceipt(bookingId) {
  const booking = db.getOne('reservations', bookingId);
  if (!booking) return;

  const client = db.getOne('clients', booking.clientId) || { name: 'Client Inconnu', phone: '-' };
  const settings = db.getTable('settings');
  const currency = settings.currency || '€';

  // Fill receipt data
  document.getElementById('receipt-hall-name').innerText = settings.hallName;
  document.getElementById('receipt-hall-address').innerText = settings.address;
  document.getElementById('receipt-hall-phone').innerText = `Tél: ${settings.phone}`;

  document.getElementById('receipt-id').innerText = booking.id;
  document.getElementById('receipt-date').innerText = new Date(booking.bookingDate).toLocaleDateString('fr-FR');
  
  document.getElementById('receipt-client-name').innerText = client.name;
  document.getElementById('receipt-client-phone').innerText = `Tél: ${client.phone}`;
  
  document.getElementById('receipt-event-type').innerText = booking.eventType;
  document.getElementById('receipt-event-date').innerText = new Date(booking.eventDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('receipt-event-guests').innerText = `${booking.guests} Convives`;
  
  document.getElementById('receipt-total-val').innerText = `${booking.totalAmount.toLocaleString()} ${currency}`;
  document.getElementById('receipt-deposit-val').innerText = `${booking.deposit.toLocaleString()} ${currency}`;
  document.getElementById('receipt-remaining-val').innerText = `${booking.remainingAmount.toLocaleString()} ${currency}`;

  // Hook PDF export download mock
  const pdfBtn = document.getElementById('receipt-export-pdf-btn');
  pdfBtn.onclick = () => {
    exportReceiptAsTextFile(booking, client, settings);
  };

  // Open receipt modal
  document.getElementById('receipt-modal').classList.add('open');
}

/**
 * Mock PDF download. We generate a formatted text file (.txt) invoice
 */
function exportReceiptAsTextFile(booking, client, settings) {
  const currency = settings.currency || '€';
  const textContent = `
==================================================
              FACTURE DE RESERVATION
                     SallePro
==================================================
Salle de Réception : ${settings.hallName}
Adresse            : ${settings.address}
Téléphone          : ${settings.phone}
--------------------------------------------------
N° Facture : ${booking.id}
Émise le   : ${new Date(booking.bookingDate).toLocaleDateString('fr-FR')}
--------------------------------------------------
FACTURÉ À :
Client    : ${client.name}
Téléphone : ${client.phone}
Adresse   : ${client.address || '-'}
--------------------------------------------------
DÉTAILS DE L'ÉVÉNEMENT :
Type d'événement   : ${booking.eventType}
Date de l'événement: ${new Date(booking.eventDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
Nombre d'invités    : ${booking.guests} convives
Status             : ${booking.status}
Notes              : ${booking.notes || 'Aucune note'}
--------------------------------------------------
RÉCAPITULATIF FINANCIER :
Tarif Total         : ${booking.totalAmount.toLocaleString()} ${currency}
Acompte Versé       : ${booking.deposit.toLocaleString()} ${currency}
Reste dû            : ${booking.remainingAmount.toLocaleString()} ${currency}
--------------------------------------------------
Merci pour votre confiance !
SallePro - Logiciel Premium de Gestion de Salles
==================================================
`;

  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sallepro_facture_${booking.id}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('Téléchargement lancé', 'La facture a été exportée sous format texte.', 'success');
}
