/**
 * SallePro - Stock Inventory Page (Firebase Firestore Module)
 */

import { db, auth, storage } from "./firebase.js";
import { showToast, currentCurrencySymbol } from "./app.js";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

console.log('stock.js: Imports loaded successfully');

let allStock = [];
let editingId = null;
let pendingImageFile = null;

window.addEventListener('authSessionLoaded', async () => {
  console.log('stock.js: authSessionLoaded event received');
  try {
    await initStockPage();
  } catch (error) {
    console.error('stock.js: Page initialization failed:', error);
    const { showFatalError } = await import("./auth.js");
    showFatalError(error);
  }
});

async function initStockPage() {
  console.log('stock.js: Initializing stock inventory page');

  try {
    listenToStock();
  } catch (err) {
    console.error("stock.js: Failed to start stock listener:", err);
  }

  try {
    bindUIEvents();
  } catch (err) {
    console.error("stock.js: Failed to bind UI events:", err);
  }

  console.log('stock.js: Page initialization completed');
}

// ─── Real-time Listener ────────────────────────────────────────────────────
function listenToStock() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  const q = query(collection(db, "users", userId, "stock"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    allStock = [];
    snapshot.forEach(d => allStock.push({ id: d.id, ...d.data() }));
    try {
      renderStockGrid();
    } catch (err) {
      console.error("stock.js: Error rendering stock grid:", err);
    }
  }, err => showToast('Erreur', err.message, 'danger'));
}

// ─── UI Events ─────────────────────────────────────────────────────────────
function bindUIEvents() {
  const addBtn = document.getElementById('open-add-stock-btn');
  if (addBtn) addBtn.onclick = () => openModal();

  const closeBtn = document.getElementById('close-stock-modal');
  if (closeBtn) closeBtn.onclick = () => closeModal();

  const cancelBtn = document.getElementById('cancel-stock-btn');
  if (cancelBtn) cancelBtn.onclick = () => closeModal();

  const form = document.getElementById('stock-form');
  if (form) form.addEventListener('submit', handleFormSubmit);

  ['search-stock', 'filter-stock-category', 'filter-low-stock-only'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('input', () => renderStockGrid());
    el?.addEventListener('change', () => renderStockGrid());
  });
}

// ─── Render Grid ───────────────────────────────────────────────────────────
function renderStockGrid() {
  const container = document.getElementById('stock-grid-container');
  const empty = document.getElementById('stock-empty-state');
  if (!container) return;

  const sym = currentCurrencySymbol || '€';
  const searchInput = document.getElementById('search-stock');
  const catFilterEl = document.getElementById('filter-stock-category');
  const lowOnlyEl = document.getElementById('filter-low-stock-only');

  const search = (searchInput?.value || '').toLowerCase();
  const catFilter = catFilterEl?.value || '';
  const lowOnly = lowOnlyEl?.checked || false;

  const filtered = allStock.filter(item => {
    const matchSearch = (item.itemName || '').toLowerCase().includes(search);
    const matchCat = !catFilter || item.category === catFilter;
    const isLow = (item.quantity || 0) <= (item.minimumQuantity || 0);
    return matchSearch && matchCat && (!lowOnly || isLow);
  });

  container.innerHTML = '';

  if (filtered.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  filtered.forEach(item => {
    const isLow = (item.quantity || 0) <= (item.minimumQuantity || 0);

    // Category icon map
    const icons = {
      'Chaises': 'fa-chair',
      'Tables': 'fa-table',
      'Décoration': 'fa-wand-magic-sparkles',
      'Vaisselle': 'fa-wine-glass',
      'Sonorisation': 'fa-volume-high',
      'Éclairage': 'fa-lightbulb'
    };
    const icon = icons[item.category] || 'fa-box';

    const card = document.createElement('div');
    card.className = 'stock-card';
    card.innerHTML = `
      <div class="stock-card-img ${isLow ? 'alert-active' : ''}">
        ${item.image
          ? `<img src="${item.image}" alt="${item.itemName}" style="width:100%;height:100%;object-fit:cover;">`
          : `<i class="fa-solid ${icon}"></i>`}
      </div>
      <div class="stock-card-body">
        <div class="stock-card-title">${item.itemName || '—'}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;">
          <span style="color:var(--text-muted);font-weight:600;"><i class="fa-solid fa-tags"></i> ${item.category || 'Général'}</span>
          <span style="font-weight:700;color:var(--color-secondary);">${(item.unitPrice || 0).toLocaleString()} ${sym}/u</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;">
          <span style="color:var(--text-light);">Seuil: ${item.minimumQuantity || 0} u</span>
          <span style="font-weight:700;padding:4px 10px;border-radius:var(--radius-sm);background:${isLow ? 'var(--danger-light)' : 'var(--success-light)'};color:${isLow ? 'var(--danger)' : 'var(--success)'};">
            ${item.quantity || 0} unités
          </span>
        </div>
      </div>
      <div class="stock-card-actions">
        <button class="btn btn-outline btn-sm" style="flex:1;" data-action="edit" data-id="${item.id}">
          <i class="fa-solid fa-pen-to-square"></i> Éditer
        </button>
        <button class="btn btn-danger btn-icon btn-sm" data-action="delete" data-id="${item.id}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>`;

    card.querySelectorAll('button[data-action]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (btn.dataset.action === 'edit') openModal(btn.dataset.id);
        else deleteItem(btn.dataset.id);
      };
    });

    container.appendChild(card);
  });
}

// ─── Modal ─────────────────────────────────────────────────────────────────
function openModal(itemId = null) {
  editingId = itemId;
  pendingImageFile = null;
  const form = document.getElementById('stock-form');
  const title = document.getElementById('stock-modal-title');
  if (form) form.reset();

  if (itemId) {
    const item = allStock.find(i => i.id === itemId);
    if (item) {
      if (title) title.innerText = "Modifier l'Article";
      
      const idEl = document.getElementById('stock-id');
      const nameEl = document.getElementById('stock-name');
      const categoryEl = document.getElementById('stock-category');
      const quantityEl = document.getElementById('stock-quantity');
      const minAlertEl = document.getElementById('stock-min-alert');
      const priceEl = document.getElementById('stock-price');

      if (idEl) idEl.value = item.id;
      if (nameEl) nameEl.value = item.itemName || '';
      if (categoryEl) categoryEl.value = item.category || '';
      if (quantityEl) quantityEl.value = item.quantity || 0;
      if (minAlertEl) minAlertEl.value = item.minimumQuantity || 0;
      if (priceEl) priceEl.value = item.unitPrice || '';
    }
  } else {
    if (title) title.innerText = 'Ajouter un Article';
    const idEl = document.getElementById('stock-id');
    const quantityEl = document.getElementById('stock-quantity');
    const minAlertEl = document.getElementById('stock-min-alert');

    if (idEl) idEl.value = '';
    if (quantityEl) quantityEl.value = 0;
    if (minAlertEl) minAlertEl.value = 10;
  }

  const modal = document.getElementById('stock-modal');
  if (modal) modal.classList.add('open');
}

function closeModal() {
  const modal = document.getElementById('stock-modal');
  if (modal) modal.classList.remove('open');
  editingId = null;
  pendingImageFile = null;
}

// ─── Form Submit ───────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
  e.preventDefault();

  const nameEl = document.getElementById('stock-name');
  const categoryEl = document.getElementById('stock-category');
  const quantityEl = document.getElementById('stock-quantity');
  const minAlertEl = document.getElementById('stock-min-alert');
  const priceEl = document.getElementById('stock-price');

  if (!nameEl || !categoryEl || !quantityEl || !minAlertEl || !priceEl) return;

  const itemName = nameEl.value.trim();
  const category = categoryEl.value;
  const quantity = parseInt(quantityEl.value) || 0;
  const minimumQuantity = parseInt(minAlertEl.value) || 0;
  const unitPrice = parseFloat(priceEl.value) || 0;

  const saveBtn = document.querySelector('#stock-form [type="submit"]');
  if (saveBtn) { 
    saveBtn.disabled = true; 
    saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enregistrement...'; 
  }

  try {
    let imageUrl = '';

    // Upload image to Firebase Storage if selected
    if (pendingImageFile) {
      const storageRef = ref(storage, `stock/${Date.now()}_${pendingImageFile.name}`);
      const uploadResult = await uploadBytes(storageRef, pendingImageFile);
      imageUrl = await getDownloadURL(uploadResult.ref);
    }

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const payload = { itemName, category, quantity, minimumQuantity, unitPrice };
    if (imageUrl) payload.image = imageUrl;

    if (editingId) {
      await updateDoc(doc(db, "users", userId, "stock", editingId), payload);
      showToast('Stock mis à jour', `${itemName} modifié.`, 'success');
    } else {
      payload.createdAt = serverTimestamp();
      payload.image = imageUrl;
      await addDoc(collection(db, "users", userId, "stock"), payload);
      showToast('Article ajouté', `${itemName} enregistré dans l'inventaire.`, 'success');
    }

    if (quantity <= minimumQuantity) {
      showToast('Alerte Stock', `Quantité de "${itemName}" inférieure au seuil !`, 'warning');
    }

    closeModal();
  } catch (err) {
    showToast('Erreur', err.message, 'danger');
  } finally {
    if (saveBtn) { 
      saveBtn.disabled = false; 
      saveBtn.innerText = 'Enregistrer'; 
    }
  }
}

// ─── Delete ────────────────────────────────────────────────────────────────
async function deleteItem(id) {
  if (!confirm("Supprimer cet article de l'inventaire ?")) return;
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  try {
    const item = allStock.find(i => i.id === id);
    await deleteDoc(doc(db, "users", userId, "stock", id));
    showToast('Supprimé', `${item?.itemName || 'Article'} retiré.`, 'success');
  } catch (err) {
    showToast('Erreur', err.message, 'danger');
  }
}
