/**
 * SallePro - Settings Page Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  loadSettingsForm();

  // Settings form submission
  document.getElementById('settings-hall-form').addEventListener('submit', handleSettingsSubmit);

  // Devise change listener (update currency name display)
  const currencySelect = document.getElementById('settings-currency');
  currencySelect.addEventListener('change', updateCurrencyNameDisplay);

  // Preferences triggers
  initPreferencesToggles();

  // Backup & Restore
  document.getElementById('backup-export-btn').onclick = exportDatabaseBackup;
  document.getElementById('backup-import-file').addEventListener('change', importDatabaseBackup);
});

/**
 * Load current configurations into form inputs
 */
function loadSettingsForm() {
  const settings = db.getTable('settings');
  if (!settings) return;

  document.getElementById('settings-name').value = settings.hallName || 'SallePro';
  document.getElementById('settings-address').value = settings.address || '';
  document.getElementById('settings-phone').value = settings.phone || '';
  document.getElementById('settings-currency').value = settings.currency || '€';

  updateCurrencyNameDisplay();

  // Toggles state
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.getElementById('pref-darkmode').checked = isDark;
  document.getElementById('pref-notifications').checked = settings.notifications !== false;
}

/**
 * Update code currency display (e.g. € -> EUR)
 */
function updateCurrencyNameDisplay() {
  const symbol = document.getElementById('settings-currency').value;
  const nameInput = document.getElementById('settings-currency-name');
  
  let currencyCode = 'EUR';
  if (symbol === '$') currencyCode = 'USD';
  else if (symbol === 'DA') currencyCode = 'DZD';
  else if (symbol === 'DH') currencyCode = 'MAD';
  else if (symbol === '£') currencyCode = 'GBP';

  nameInput.value = currencyCode;
}

/**
 * Submit configuration alterations
 */
function handleSettingsSubmit(e) {
  e.preventDefault();

  const hallName = document.getElementById('settings-name').value.trim();
  const address = document.getElementById('settings-address').value.trim();
  const phone = document.getElementById('settings-phone').value.trim();
  const currency = document.getElementById('settings-currency').value;
  const currencyName = document.getElementById('settings-currency-name').value;

  const currentSettings = db.getTable('settings');
  const payload = {
    ...currentSettings,
    hallName,
    address,
    phone,
    currency,
    currencyName
  };

  db.saveTable('settings', payload);
  showToast('Paramètres mis à jour', 'Les données de l\'établissement ont été enregistrées.', 'success');
  
  // Reload layouts to reflect new name/devise
  setTimeout(() => {
    window.location.reload();
  }, 1000);
}

/**
 * Initialize preference toggle interactions
 */
function initPreferencesToggles() {
  const darkToggle = document.getElementById('pref-darkmode');
  const notifToggle = document.getElementById('pref-notifications');

  // Theme Sync
  darkToggle.addEventListener('change', () => {
    const isChecked = darkToggle.checked;
    const newTheme = isChecked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Sync navbar theme button icon
    const icon = document.getElementById('theme-btn-icon');
    if (icon) {
      icon.className = isChecked ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }

    showToast('Thème mis à jour', `Mode ${newTheme === 'dark' ? 'sombre' : 'clair'} activé.`, 'info');
    window.dispatchEvent(new Event('themeChanged'));
  });

  // Notification settings save
  notifToggle.addEventListener('change', () => {
    const currentSettings = db.getTable('settings');
    currentSettings.notifications = notifToggle.checked;
    db.saveTable('settings', currentSettings);
    
    showToast('Préférences modifiées', 'Les réglages de notifications ont été enregistrés.', 'success');
  });
}

/**
 * Export full LocalStorage databases as a backup JSON file
 */
function exportDatabaseBackup() {
  try {
    const tables = ['users', 'clients', 'reservations', 'employees', 'stock', 'expenses', 'settings'];
    const backupObj = {};

    tables.forEach(table => {
      backupObj[table] = JSON.parse(localStorage.getItem('sp_' + table));
    });

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
  }
}

/**
 * Import and override LocalStorage with a backup file
 */
function importDatabaseBackup(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      
      // Validate schema
      const requiredTables = ['users', 'clients', 'reservations', 'employees', 'stock', 'expenses', 'settings'];
      const hasAllKeys = requiredTables.every(k => data.hasOwnProperty(k));

      if (!hasAllKeys) {
        showToast('Fichier invalide', 'Le format de sauvegarde n\'est pas reconnu par SallePro.', 'danger');
        return;
      }

      if (confirm('Attention! Importer ce fichier écrasera TOUTES vos données actuelles (réservations, clients, inventaire). Voulez-vous continuer ?')) {
        // Write keys
        requiredTables.forEach(table => {
          localStorage.setItem('sp_' + table, JSON.stringify(data[table]));
        });

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
