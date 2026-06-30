/**
 * SallePro - Stock Inventory Page (Firebase Firestore Module)
 */

import { db, storage } from "./firebase.js";
import { showToast, currentCurrencySymbol } from "./app.js";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

let allStock = [];
let editingId = null;
let pendingImageFile = null;

window.addEventListener('authSessionLoaded', () => {
  listenToStock();
  bindUIEvents();
});

// ─── Real-time Listener ────────────────────────────────────────────────────
function listenToStock() {
  const q = query(collection(db, "stock"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    allStock = [];
    snapshot.forEach(d => allStock.push({ id: d.id, ...d.data() }));
    renderStockGrid();
  }, err => showToast('Erreur', err.message, 'danger'));
}

// ─── UI Events ─────────────────────────────────────────────────────────────
function bindUIEvents() {
  document.getElementById('open-add-stock-btn')?.addEventListener('click', () => openModal());
  document.getElementById('close-stock-modal-btn')?.addEventListener('click', closeModal);
  document.getElementById('cancel-stock-btn')?.addEventListener('click', closeModal);
  document.getElementById('stock-form')?.addEventListener('submit', handleFormSubmit);

  ['search-stock', 'filter-stock-category', 'filter-low-stock-only'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('input', renderStockGrid);
    el?.addEventListener('change', renderStockGrid);
  });
}

// ─── Render Grid ───────────────────────────────────────────────────────────
function renderStockGrid() {
  const container = document.getElementById('stock-grid-container');
  const empty = document.getElementById('stock-empty-state');
  if (!container) return;

  const sym = currentCurrencySymbol || '€';
  const search = (document.getElementById('search-stock')?.value || '').toLowerCase();
  const catFilter = document.getElementById('filter-stock-category')?.value || '';
  const lowOnly = document.getElementById('filter-low-stock-only')?.checked || false;

  const filtered = allStock.filter(item => {
    const matchSearch = (item.itemName || '').toLowerCase().includes(search);
    const matchCat = !catFilter || item.category === catFilter;
    const isLow = item.quantity <= item.minimumQuantity;
    return matchSearch && matchCat && (!lowOnly || isLow);
  });

  container.innerHTML = '';

  if (filtered.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  filtered.forEach(item => {
    const isLow = item.quantity <= item.minimumQuantity;

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
        <div class="stock-card-title">${item.itemName}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;">
          <span style="color:var(--text-muted);font-weight:600;"><i class="fa-solid fa-tags"></i> ${item.category}</span>
          <span style="font-weight:700;color:var(--color-secondary);">${(item.unitPrice || 0).toLocaleString()} ${sym}/u</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;">
          <span style="color:var(--text-light);">Seuil: ${item.minimumQuantity} u</span>
          <span style="font-weight:700;padding:4px 10px;border-radius:var(--radius-sm);background:${isLow ? 'var(--danger-light)' : 'var(--success-light)'};color:${isLow ? 'var(--danger)' : 'var(--success)'};">
            ${item.quantity} unités
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
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'edit') openModal(btn.dataset.id);
        else deleteItem(btn.dataset.id);
      });
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
  form.reset();

  if (itemId) {
    const item = allStock.find(i => i.id === itemId);
    if (item) {
      title && (title.innerText = "Modifier l'Article");
      document.getElementById('stock-id').value = item.id;
      document.getElementById('stock-name').value = item.itemName || '';
      document.getElementById('stock-category').value = item.category || '';
      document.getElementById('stock-quantity').value = item.quantity || 0;
      document.getElementById('stock-min-alert').value = item.minimumQuantity || 0;
      document.getElementById('stock-price').value = item.unitPrice || '';
    }
  } else {
    title && (title.innerText = 'Ajouter un Article');
    document.getElementById('stock-id').value = '';
    document.getElementById('stock-quantity').value = 0;
    document.getElementById('stock-min-alert').value = 10;
  }

  document.getElementById('stock-modal')?.classList.add('open');
}

function closeModal() {
  document.getElementById('stock-modal')?.classList.remove('open');
  editingId = null;
  pendingImageFile = null;
}

// ─── Form Submit ───────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
  e.preventDefault();

  const itemName = document.getElementById('stock-name').value.trim();
  const category = document.getElementById('stock-category').value;
  const quantity = parseInt(document.getElementById('stock-quantity').value) || 0;
  const minimumQuantity = parseInt(document.getElementById('stock-min-alert').value) || 0;
  const unitPrice = parseFloat(document.getElementById('stock-price').value) || 0;

  const saveBtn = document.querySelector('#stock-form [type="submit"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enregistrement...'; }

  try {
    let imageUrl = '';

    // Upload image to Firebase Storage if selected
    if (pendingImageFile) {
      const storageRef = ref(storage, `stock/${Date.now()}_${pendingImageFile.name}`);
      const uploadResult = await uploadBytes(storageRef, pendingImageFile);
      imageUrl = await getDownloadURL(uploadResult.ref);
    }

    const payload = { itemName, category, quantity, minimumQuantity, unitPrice };
    if (imageUrl) payload.image = imageUrl;

    if (editingId) {
      await updateDoc(doc(db, "stock", editingId), payload);
      showToast('Stock mis à jour', `${itemName} modifié.`, 'success');
    } else {
      payload.createdAt = serverTimestamp();
      payload.image = imageUrl;
      await addDoc(collection(db, "stock"), payload);
      showToast('Article ajouté', `${itemName} enregistré dans l'inventaire.`, 'success');
    }

    if (quantity <= minimumQuantity) {
      showToast('Alerte Stock', `Quantité de "${itemName}" inférieure au seuil !`, 'warning');
    }

    closeModal();
  } catch (err) {
    showToast('Erreur', err.message, 'danger');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = 'Enregistrer'; }
  }
}

// ─── Delete ────────────────────────────────────────────────────────────────
async function deleteItem(id) {
  if (!confirm("Supprimer cet article de l'inventaire ?")) return;
  try {
    const item = allStock.find(i => i.id === id);
    await deleteDoc(doc(db, "stock", id));
    showToast('Supprimé', `${item?.itemName || 'Article'} retiré.`, 'success');
  } catch (err) {
    showToast('Erreur', err.message, 'danger');
  }
}
