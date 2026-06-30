/**
 * SallePro - Stock Inventory Page Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  renderStockGrid();

  // Modal event bindings
  const modal = document.getElementById('stock-modal');
  const addBtn = document.getElementById('open-add-stock-btn');
  const closeBtn = document.getElementById('close-stock-modal-btn');
  const cancelBtn = document.getElementById('cancel-stock-btn');
  const form = document.getElementById('stock-form');

  addBtn.onclick = () => openStockModal();
  closeBtn.onclick = () => closeModal();
  cancelBtn.onclick = () => closeModal();

  form.addEventListener('submit', handleFormSubmit);

  // Search & Filters inputs
  document.getElementById('search-stock').addEventListener('input', renderStockGrid);
  document.getElementById('filter-stock-category').addEventListener('change', renderStockGrid);
  document.getElementById('filter-low-stock-only').addEventListener('change', renderStockGrid);
});

/**
 * Open Modal Form
 */
function openStockModal(itemId = null) {
  const modal = document.getElementById('stock-modal');
  const title = document.getElementById('stock-modal-title');
  const form = document.getElementById('stock-form');

  form.reset();

  if (itemId) {
    title.innerText = 'Éditer l\'Article';
    const item = db.getOne('stock', itemId);
    if (item) {
      document.getElementById('stock-id').value = item.id;
      document.getElementById('stock-name').value = item.name;
      document.getElementById('stock-category').value = item.category;
      document.getElementById('stock-quantity').value = item.quantity;
      document.getElementById('stock-min-alert').value = item.minStockAlert;
      document.getElementById('stock-price').value = item.price || '';
    }
  } else {
    title.innerText = 'Nouvel Article';
    document.getElementById('stock-id').value = '';
    document.getElementById('stock-quantity').value = 0;
    document.getElementById('stock-min-alert').value = 10;
  }

  modal.classList.add('open');
}

function closeModal() {
  document.getElementById('stock-modal').classList.remove('open');
}

/**
 * Handle Form Submission
 */
function handleFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('stock-id').value;
  const name = document.getElementById('stock-name').value.trim();
  const category = document.getElementById('stock-category').value;
  const quantity = parseInt(document.getElementById('stock-quantity').value) || 0;
  const minStockAlert = parseInt(document.getElementById('stock-min-alert').value) || 0;
  const price = parseFloat(document.getElementById('stock-price').value) || 0;

  const payload = { name, category, quantity, minStockAlert, price };

  if (id) {
    db.updateOne('stock', id, payload);
    showToast('Stock mis à jour', `${name} a été modifié avec succès.`, 'success');
  } else {
    payload.id = 'stk-' + Date.now();
    payload.image = '';
    db.insertOne('stock', payload);
    showToast('Matériel enregistré', `${name} a été ajouté à l'inventaire.`, 'success');
  }

  closeModal();
  renderStockGrid();

  // If new item added triggers low stock, toast it
  if (quantity <= minStockAlert) {
    showToast('Alerte Stock', `Alerte: La quantité de ${name} est inférieure au seuil critique!`, 'warning');
  }
}

/**
 * Render Stock Grid Cards
 */
function renderStockGrid() {
  const container = document.getElementById('stock-grid-container');
  const emptyState = document.getElementById('stock-empty-state');
  if (!container) return;

  const stock = db.getTable('stock');
  const searchQuery = document.getElementById('search-stock').value.toLowerCase().trim();
  const selectedCat = document.getElementById('filter-stock-category').value;
  const showLowStockOnly = document.getElementById('filter-low-stock-only').checked;
  const settings = db.getTable('settings');
  const currency = settings.currency || '€';

  // Apply filters
  const filtered = stock.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery);
    const matchesCategory = !selectedCat || item.category === selectedCat;
    
    const isLowStock = item.quantity <= item.minStockAlert;
    const matchesLowStock = !showLowStockOnly || isLowStock;

    return matchesSearch && matchesCategory && matchesLowStock;
  });

  container.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  filtered.forEach(item => {
    const isLowStock = item.quantity <= item.minStockAlert;
    
    // Select category icon
    let iconClass = 'fa-box';
    if (item.category === 'Chaises') iconClass = 'fa-chair';
    else if (item.category === 'Tables') iconClass = 'fa-table';
    else if (item.category === 'Décoration') iconClass = 'fa-wand-magic-sparkles';
    else if (item.category === 'Vaisselle') iconClass = 'fa-wine-glass';
    else if (item.category === 'Sonorisation') iconClass = 'fa-volume-high';
    else if (item.category === 'Éclairage') iconClass = 'fa-lightbulb';

    const card = document.createElement('div');
    card.className = 'stock-card';
    card.innerHTML = `
      <div class="stock-card-img-placeholder ${isLowStock ? 'alert-active' : ''}">
        <i class="fa-solid ${iconClass}"></i>
      </div>
      <div class="stock-card-content">
        <div class="stock-card-title">${item.name}</div>
        
        <div class="stock-meta-row">
          <span style="color: var(--text-muted); font-size:0.8rem; font-weight:600;"><i class="fa-solid fa-tags"></i> ${item.category}</span>
          <span style="font-weight: 700; color:var(--color-secondary); font-size:0.95rem;">${item.price} ${currency} / u</span>
        </div>

        <div class="stock-meta-row" style="margin-top: 4px;">
          <span style="color:var(--text-light); font-size:0.75rem;">Seuil d'alerte : ${item.minStockAlert} u</span>
          <span class="stock-qty-badge ${isLowStock ? 'low' : 'ok'}">
            ${item.quantity} unités en stock
          </span>
        </div>
      </div>
      <div class="stock-actions">
        <button class="btn btn-outline btn-sm" style="flex:1;" onclick="openStockModal('${item.id}')">
          <i class="fa-solid fa-pen-to-square"></i> Éditer
        </button>
        <button class="btn btn-danger btn-icon btn-sm" onclick="deleteStockItem('${item.id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

/**
 * Delete Stock Item
 */
function deleteStockItem(id) {
  if (confirm('Voulez-vous vraiment supprimer cet article de l\'inventaire ?')) {
    const item = db.getOne('stock', id);
    db.deleteOne('stock', id);
    showToast('Matériel supprimé', `L'article ${item ? item.name : ''} a été supprimé.`, 'success');
    renderStockGrid();
  }
}
