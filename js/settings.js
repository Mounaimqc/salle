/**
 * SallePro - Settings Page Logic (Firebase Firestore Module)
 */

import { db } from "./firebase.js";
import { showToast } from "./app.js";
import {
  doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, addDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

console.log('settings.js: Imports loaded successfully');

window.addEventListener('authSessionLoaded', async () => {
  console.log('settings.js: authSessionLoaded event received');
  try {
    await initSettingsPage();
  } catch (error) {
    console.error('settings.js: Page initialization failed:', error);
    const { showFatalError } = await import("./auth.js");
    showFatalError(error);
  }
});

async function initSettingsPage() {
  console.log('settings.js: Initializing settings page');

  try {
    await loadSettingsForm();
  } catch (err) {
    console.error("settings.js: Failed to load settings form:", err);
  }

  try {
    bindUIEvents();
  } catch (err) {
    console.error("settings.js: Failed to bind UI events:", err);
  }

  console.log('settings.js: Page initialization completed');
}

/**
 * Load current configurations into form inputs from Firestore
 */
async function loadSettingsForm() {
  try {
    const docSnap = await getDoc(doc(db, "settings", "hall_settings"));
    if (docSnap.exists()) {
      const settings = docSnap.data();
      
      const nameInput = document.getElementById('settings-name');
      const addressInput = document.getElementById('settings-address');
      const phoneInput = document.getElementById('settings-phone');
      const currencyInput = document.getElementById('settings-currency');
      const darkToggle = document.getElementById('pref-darkmode');
      const notifToggle = document.getElementById('pref-notifications');

      if (nameInput) nameInput.value = settings.hallName || 'SallePro';
      if (addressInput) addressInput.value = settings.address || '';
      if (phoneInput) phoneInput.value = settings.phone || '';
      if (currencyInput) currencyInput.value = settings.currency || '€';

      updateCurrencyNameDisplay();

      // Toggles state
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (darkToggle) darkToggle.checked = isDark;
      if (notifToggle) notifToggle.checked = settings.notifications !== false;
    }
  } catch (err) {
    console.error("settings.js: Error loading settings from Firestore:", err);
  }
}

/**
 * Update code currency display (e.g. € -> EUR)
 */
function updateCurrencyNameDisplay() {
  const currencyEl = document.getElementById('settings-currency');
  const nameInput = document.getElementById('settings-currency-name');
  if (!currencyEl || !nameInput) return;

  const symbol = currencyEl.value;
  
  let currencyCode = 'EUR';
  if (symbol === '$') currencyCode = 'USD';
  else if (symbol === 'DA') currencyCode = 'DZD';
  else if (symbol === 'DH') currencyCode = 'MAD';
  else if (symbol === '£') currencyCode = 'GBP';

  nameInput.value = currencyCode;
}

/**
 * Bind UI Events
 */
function bindUIEvents() {
  // Settings form submission
  document.getElementById('settings-hall-form')?.addEventListener('submit', handleSettingsSubmit);

  // Devise change listener (update currency name display)
  const currencySelect = document.getElementById('settings-currency');
  currencySelect?.addEventListener('change', updateCurrencyNameDisplay);

  // Preferences triggers
  initPreferencesToggles();

  // Backup & Restore
  const exportBtn = document.getElementById('backup-export-btn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      try {
        exportDatabaseBackup();
      } catch (err) {
        console.error("settings.js: Failed to export database backup:", err);
      }
    };
  }

  const importInput = document.getElementById('backup-import-file');
  if (importInput) {
    importInput.addEventListener('change', (e) => {
      try {
        importDatabaseBackup(e);
      } catch (err) {
        console.error("settings.js: Failed to import database backup:", err);
      }
    });
  }
}

/**
 * Submit configuration alterations to Firestore
 */
async function handleSettingsSubmit(e) {
  e.preventDefault();

  const nameInput = document.getElementById('settings-name');
  const addressInput = document.getElementById('settings-address');
  const phoneInput = document.getElementById('settings-phone');
  const currencyInput = document.getElementById('settings-currency');
  const currencyNameInput = document.getElementById('settings-currency-name');

  if (!nameInput || !addressInput || !phoneInput || !currencyInput || !currencyNameInput) return;

  const hallName = nameInput.value.trim();
  const address = addressInput.value.trim();
  const phone = phoneInput.value.trim();
  const currency = currencyInput.value;
  const currencyName = currencyNameInput.value;

  try {
    const docRef = doc(db, "settings", "hall_settings");
    await setDoc(docRef, {
      hallName,
      address,
      phone,
      currency,
      currencyName
    }, { merge: true });

    showToast('Paramètres mis à jour', 'Les données de l\'établissement ont été enregistrées.', 'success');
    
    // Reload layouts to reflect new name/devise
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (err) {
    showToast('Erreur', err.message, 'danger');
  }
}

/**
 * Initialize preference toggle interactions synced to Firestore
 */
function initPreferencesToggles() {
  const darkToggle = document.getElementById('pref-darkmode');
  const notifToggle = document.getElementById('pref-notifications');

  // Theme Sync
  darkToggle?.addEventListener('change', async () => {
    const isChecked = darkToggle.checked;
    const newTheme = isChecked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // Sync navbar theme button icon
    const icon = document.getElementById('theme-btn-icon');
    if (icon) {
      icon.className = isChecked ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }

    try {
      await updateDoc(doc(db, "settings", "hall_settings"), { darkMode: isChecked });
      showToast('Thème mis à jour', `Mode ${newTheme === 'dark' ? 'sombre' : 'clair'} activé.`, 'info');
      window.dispatchEvent(new Event('themeChanged'));
    } catch (err) {
      console.error("settings.js: Error saving theme preference to Firestore:", err);
    }
  });

  // Notification settings save
  notifToggle?.addEventListener('change', async () => {
    try {
      await updateDoc(doc(db, "settings", "hall_settings"), { notifications: notifToggle.checked });
      showToast('Préférences modifiées', 'Les réglages de notifications ont été enregistrés.', 'success');
    } catch (err) {
      showToast('Erreur', err.message, 'danger');
    }
  });
}

/**
 * Export full Firestore database collections as a backup JSON file
 */
async function exportDatabaseBackup() {
  const exportBtn = document.getElementById('backup-export-btn');
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Exportation...';
  }

  try {
    const collectionsToBackup = ['users', 'clients', 'reservations', 'employees', 'stock', 'charges', 'settings'];
    const backupObj = {};

    for (const colName of collectionsToBackup) {
      const querySnapshot = await getDocs(collection(db, colName));
      const docs = [];
      querySnapshot.forEach(docSnap => {
        docs.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Map 'charges' to 'expenses' for compatibility with old local storage backups if any
      const keyName = colName === 'charges' ? 'expenses' : colName;
      backupObj[keyName] = docs;
    }

    const jsonString = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const today = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `sallepro_backup_${today}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Sauvegarde créée', 'Le fichier de configuration a été téléchargé.', 'success');
  } catch (error) {
    showToast('Erreur d\'export', 'Impossible de compiler la base de données.', 'danger');
    console.error(error);
  } finally {
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.innerHTML = '<i class="fa-solid fa-download"></i> Exporter la base';
    }
  }
}

/**
 * Import and override Firestore database with a backup file
 */
async function importDatabaseBackup(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      
      // Validate schema
      const requiredTables = ['users', 'clients', 'reservations', 'employees', 'stock', 'settings'];
      const hasExpenses = data.hasOwnProperty('expenses') || data.hasOwnProperty('charges');
      const hasAllKeys = requiredTables.every(k => data.hasOwnProperty(k)) && hasExpenses;

      if (!hasAllKeys) {
        showToast('Fichier invalide', 'Le format de sauvegarde n\'est pas reconnu par SallePro.', 'danger');
        return;
      }

      if (confirm('Attention! Importer ce fichier écrasera TOUTES vos données actuelles sur Firestore (réservations, clients, inventaire). Voulez-vous continuer ?')) {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
          loadingOverlay.style.opacity = '1';
          loadingOverlay.style.display = 'flex';
        }

        const expensesData = data.expenses || data.charges || [];
        const collectionsMap = {
          'users': data.users || [],
          'clients': data.clients || [],
          'reservations': data.reservations || [],
          'employees': data.employees || [],
          'stock': data.stock || [],
          'charges': expensesData,
          'settings': data.settings || []
        };

        for (const [colName, docsArray] of Object.entries(collectionsMap)) {
          if (colName === 'settings') {
            const settingsDoc = Array.isArray(docsArray) ? docsArray.find(d => d.id === 'hall_settings') || docsArray[0] : docsArray;
            if (settingsDoc) {
              const { id, ...settingsFields } = settingsDoc;
              await setDoc(doc(db, "settings", "hall_settings"), settingsFields);
            }
          } else {
            // Delete current documents
            const currentSnap = await getDocs(collection(db, colName));
            const deletePromises = [];
            currentSnap.forEach(docSnap => {
              deletePromises.push(deleteDoc(doc(db, colName, docSnap.id)));
            });
            await Promise.all(deletePromises);

            // Insert backup documents
            const writePromises = [];
            docsArray.forEach(d => {
              const { id, ...fields } = d;
              if (id) {
                writePromises.push(setDoc(doc(db, colName, id), fields));
              } else {
                writePromises.push(addDoc(collection(db, colName), fields));
              }
            });
            await Promise.all(writePromises);
          }
        }

        showToast('Restauration réussie', 'Base de données rechargée avec succès.', 'success');
        
        // Reload layout
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (err) {
      showToast('Erreur d\'importation', 'Le fichier JSON est corrompu ou illisible.', 'danger');
      console.error(err);
    }
  };
  
  reader.readAsText(file);
  
  // Reset input file value to allow importing same file again
  e.target.value = '';
}
