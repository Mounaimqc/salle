/**
 * SallePro - Client CRM Page Logic
 */

let selectedClientId = null;

document.addEventListener('DOMContentLoaded', () => {
  renderClientsTable();

  // Modal elements
  const modal = document.getElementById('client-modal');
  const addBtn = document.getElementById('open-add-client-btn');
  const closeBtn = document.getElementById('close-client-modal-btn');
  const cancelBtn = document.getElementById('cancel-client-btn');
  const form = document.getElementById('client-form');

  addBtn.onclick = () => openClientModal();
  closeBtn.onclick = () => closeModal();
  cancelBtn.onclick = () => closeModal();

  form.addEventListener('submit', handleFormSubmit);

  // Search input
  document.getElementById('search-clients').addEventListener('input', renderClientsTable);

  // Check URL parameters (e.g. redirected to add new client)
  const params = new URLSearchParams(window.location.search);
  if (params.get('addNew') === 'true') {
    openClientModal();
  }
});

/**
 * Open Modal Form
 */
function openClientModal(clientId = null) {
  const modal = document.getElementById('client-modal');
  const title = document.getElementById('client-modal-title');
  const form = document.getElementById('client-form');

  form.reset();

  if (clientId) {
    title.innerText = 'Éditer le Client';
    const client = db.getOne('clients', clientId);
    if (client) {
      document.getElementById('client-id').value = client.id;
      document.getElementById('client-name').value = client.name;
      document.getElementById('client-phone').value = client.phone;
      document.getElementById('client-email').value = client.email || '';
      document.getElementById('client-address').value = client.address || '';
      document.getElementById('client-notes').value = client.notes || '';
    }
  } else {
    title.innerText = 'Nouveau Client';
    document.getElementById('client-id').value = '';
  }

  modal.classList.add('open');
}

function closeModal() {
  document.getElementById('client-modal').classList.remove('open');
}

/**
 * Handle Form Submission
 */
function handleFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('client-id').value;
  const name = document.getElementById('client-name').value.trim();
  const phone = document.getElementById('client-phone').value.trim();
  const email = document.getElementById('client-email').value.trim();
  const address = document.getElementById('client-address').value.trim();
  const notes = document.getElementById('client-notes').value.trim();

  const payload = { name, phone, email, address, notes };

  if (id) {
    db.updateOne('clients', id, payload);
    showToast('Client mis à jour', `Les données de ${name} ont été modifiées.`, 'success');
  } else {
    payload.id = 'cli-' + Date.now();
    db.insertOne('clients', payload);
    showToast('Client créé', `Le client ${name} a été enregistré dans le CRM.`, 'success');
  }

  closeModal();
  renderClientsTable();

  // If adding new, select it
  if (!id) {
    showClientProfile(payload.id);
  } else if (selectedClientId === id) {
    showClientProfile(id); // refresh profile pane
  }
}

/**
 * Render Clients Table
 */
function renderClientsTable() {
  const tbody = document.getElementById('clients-table-body');
  const emptyState = document.getElementById('clients-empty-state');
  if (!tbody) return;

  const clients = db.getTable('clients');
  const reservations = db.getTable('reservations');
  const searchQuery = document.getElementById('search-clients').value.toLowerCase().trim();

  // Filter
  const filtered = clients.filter(c => {
    return c.name.toLowerCase().includes(searchQuery) ||
           c.phone.includes(searchQuery) ||
           (c.email && c.email.toLowerCase().includes(searchQuery));
  });

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  filtered.forEach(client => {
    const bookingCount = reservations.filter(r => r.clientId === client.id && r.status !== 'Annulé').length;

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    if (selectedClientId === client.id) {
      tr.style.backgroundColor = 'var(--bg-surface-hover)';
    }

    tr.innerHTML = `
      <td>
        <div style="font-weight: 600;">${client.name}</div>
        <div style="font-size: 0.75rem; color: var(--text-light);">${client.address || 'Adresse non renseignée'}</div>
      </td>
      <td style="font-weight: 500;">${client.phone}</td>
      <td>${client.email || '-'}</td>
      <td style="text-align: center;"><span class="badge badge-info">${bookingCount}</span></td>
      <td>
        <div style="display: flex; gap: 6px; justify-content: center;" onclick="event.stopPropagation();">
          <button class="btn btn-outline btn-icon btn-sm" onclick="openClientModal('${client.id}')" title="Modifier">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="deleteClient('${client.id}')" title="Supprimer">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;

    // Click event to show profile
    tr.addEventListener('click', () => {
      selectedClientId = client.id;
      // Re-render table to update background highlight
      renderClientsTable();
      showClientProfile(client.id);
    });

    tbody.appendChild(tr);
  });

  // Auto-select first client on load if none selected
  if (selectedClientId === null && filtered.length > 0) {
    selectedClientId = filtered[0].id;
    // Highlight it
    renderClientsTable();
    showClientProfile(selectedClientId);
  }
}

/**
 * Display Client Profile Details on the Right Column
 */
function showClientProfile(clientId) {
  const content = document.getElementById('profile-card-content');
  if (!content) return;

  const client = db.getOne('clients', clientId);
  if (!client) {
    content.innerHTML = `
      <div class="no-event-placeholder">
        <i class="fa-solid fa-id-card"></i>
        <span>Sélectionnez un client dans la liste pour afficher son historique.</span>
      </div>
    `;
    return;
  }

  const reservations = db.getTable('reservations');
  const settings = db.getTable('settings');
  const currency = settings.currency || '€';

  // Calculations
  const clientBookings = reservations.filter(r => r.clientId === client.id);
  const activeBookings = clientBookings.filter(r => r.status !== 'Annulé');
  
  // Lifetime Value = amount already paid by this client
  const lifetimeValue = activeBookings.reduce((sum, r) => sum + (r.totalAmount - r.remainingAmount), 0);
  const totalDebt = activeBookings.reduce((sum, r) => sum + r.remainingAmount, 0);

  // Generate Booking list HTML
  let bookingsHistoryHtml = '';
  if (clientBookings.length === 0) {
    bookingsHistoryHtml = `
      <div style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:16px 0;">
        Aucun événement réservé pour le moment.
      </div>
    `;
  } else {
    // Sort bookings by event date descending
    const sortedBookings = [...clientBookings].sort((a, b) => b.eventDate.localeCompare(a.eventDate));
    
    bookingsHistoryHtml = '<div style="display:flex; flex-direction:column; gap:10px;">';
    sortedBookings.forEach(res => {
      let badgeClass = 'badge-warning';
      if (res.status === 'Confirmé') badgeClass = 'badge-success';
      if (res.status === 'Annulé') badgeClass = 'badge-danger';

      const d = new Date(res.eventDate);
      const formattedDate = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

      bookingsHistoryHtml += `
        <div style="background-color: var(--bg-app); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:10px; font-size:0.85rem;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <strong style="color:var(--text-main);">${res.eventType}</strong>
            <span class="badge ${badgeClass}" style="font-size:0.7rem; padding: 2px 8px;">${res.status}</span>
          </div>
          <div style="display:flex; justify-content:space-between; color:var(--text-muted); font-size:0.75rem;">
            <span>Date: ${formattedDate}</span>
            <span>Total: ${res.totalAmount} ${currency}</span>
          </div>
          ${res.remainingAmount > 0 ? `
          <div style="text-align:right; font-size:0.75rem; color:var(--danger); font-weight:600; margin-top:2px;">
            Reste dû: ${res.remainingAmount} ${currency}
          </div>` : ''}
        </div>
      `;
    });
    bookingsHistoryHtml += '</div>';
  }

  content.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <!-- Profile Header / Main info -->
      <div style="text-align: center; padding-bottom:16px; border-bottom:1px solid var(--border-color);">
        <div style="width:70px; height:70px; border-radius:50%; background-color:var(--color-secondary-light); color:var(--color-secondary); font-size:1.8rem; display:flex; align-items:center; justify-content:center; margin:0 auto 12px; font-weight:700;">
          ${client.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
        </div>
        <h4 style="font-size:1.15rem; font-weight:700; color:var(--text-main);">${client.name}</h4>
        <p style="font-size:0.85rem; color:var(--text-muted);"><i class="fa-solid fa-phone"></i> ${client.phone}</p>
        ${client.email ? `<p style="font-size:0.85rem; color:var(--text-muted);"><i class="fa-solid fa-envelope"></i> ${client.email}</p>` : ''}
      </div>

      <!-- Quick Metrics -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div style="background-color: var(--success-light); border:1px solid rgba(16,185,129,0.15); border-radius:var(--radius-sm); padding:10px; text-align:center;">
          <div style="font-size:0.7rem; color:var(--success); font-weight:600; text-transform:uppercase;">Facturé Payé</div>
          <div style="font-size:1rem; font-weight:800; color:var(--success); margin-top:4px;">${lifetimeValue} ${currency}</div>
        </div>
        <div style="background-color: ${totalDebt > 0 ? 'var(--danger-light)' : 'var(--bg-surface-hover)'}; border:1px solid ${totalDebt > 0 ? 'rgba(239,68,68,0.15)' : 'var(--border-color)'}; border-radius:var(--radius-sm); padding:10px; text-align:center;">
          <div style="font-size:0.7rem; color:${totalDebt > 0 ? 'var(--danger)' : 'var(--text-muted)'}; font-weight:600; text-transform:uppercase;">Dette Restante</div>
          <div style="font-size:1rem; font-weight:800; color:${totalDebt > 0 ? 'var(--danger)' : 'var(--text-main)'}; margin-top:4px;">${totalDebt} ${currency}</div>
        </div>
      </div>

      <!-- Address & Notes -->
      <div style="font-size:0.85rem; display:flex; flex-direction:column; gap:10px;">
        <div>
          <span style="font-weight:600; color:var(--text-main);">Adresse:</span>
          <p style="color:var(--text-muted); margin-top:2px;">${client.address || 'Aucune adresse enregistrée.'}</p>
        </div>
        <div>
          <span style="font-weight:600; color:var(--text-main);">Notes client:</span>
          <p style="color:var(--text-muted); margin-top:2px; font-style:italic; background:var(--bg-app); padding:8px; border-radius:var(--radius-sm); border-left:3px solid var(--color-secondary);">
            ${client.notes || 'Aucune préférence enregistrée.'}
          </p>
        </div>
      </div>

      <!-- History list -->
      <div>
        <h4 style="font-size:0.9rem; font-weight:700; color:var(--text-main); margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
          <span>Historique des Réservations</span>
          <span class="badge badge-info" style="font-size:0.7rem; padding: 2px 6px;">Total: ${clientBookings.length}</span>
        </h4>
        ${bookingsHistoryHtml}
      </div>

      <!-- Create Reservation Quick Link -->
      <button class="btn btn-primary btn-sm" onclick="window.location.href='reservations.html?search=${encodeURIComponent(client.name)}'">
        <i class="fa-solid fa-calendar-plus"></i> Gérer ses Réservations
      </button>
    </div>
  `;
}

/**
 * Delete Client
 */
function deleteClient(id) {
  // Check if client has active bookings
  const bookings = db.getTable('reservations');
  const activeBookings = bookings.filter(b => b.clientId === id && b.status !== 'Annulé');

  if (activeBookings.length > 0) {
    alert(`Impossible de supprimer ce client. Il possède encore ${activeBookings.length} réservation(s) active(s) dans le système. Veuillez d'abord annuler ou supprimer ses réservations.`);
    return;
  }

  if (confirm('Voulez-vous vraiment supprimer ce client ? Toutes ses fiches d\'historique seront définitivement effacées.')) {
    const client = db.getOne('clients', id);
    db.deleteOne('clients', id);
    showToast('Client supprimé', `Le client ${client ? client.name : ''} a été supprimé.`, 'success');
    
    if (selectedClientId === id) {
      selectedClientId = null;
    }
    
    renderClientsTable();
  }
}
