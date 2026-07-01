/**
 * SallePro - Core Global Application Module
 */

import { auth, db } from "./firebase.js";
import { logoutUser } from "./auth.js";
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where,
  getDocs,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

console.log('app.js: Imports loaded successfully');

// Global currency configuration
export let currentCurrencySymbol = "€";
export let currentCurrencyCode = "EUR";

// Inject common layout elements
document.addEventListener('DOMContentLoaded', async () => {
  try {
    renderLayoutShell();
  } catch (error) {
    console.error('app.js: Layout shell rendering crashed:', error);
  }
});

// Watch for authentication session loads to update header profile details
window.addEventListener('authSessionLoaded', async () => {
  console.log('app.js: authSessionLoaded event triggered');
  try {
    updateUserProfileDisplay();
    await initializeUserSessionData();
  } catch (error) {
    console.error('app.js: Failed to initialize user data on event:', error);
  }
});

async function initializeUserSessionData() {
  console.log('app.js: Starting User Data initialization');

  // 1. Subscribe to Firebase settings (theme, currency, logo, etc.)
  try {
    subscribeToSettings();
  } catch (error) {
    console.error('app.js: Settings subscription crashed:', error);
  }

  // 2. Subscribe to stock collection for alerts
  try {
    subscribeToStockAlerts();
  } catch (error) {
    console.error('app.js: Stock alerts subscription crashed:', error);
  }

  // 3. Perform tomorrow event reminder alert check
  try {
    await checkTomorrowEventAlert();
  } catch (error) {
    console.error('app.js: Tomorrow event alert check crashed:', error);
  }

  console.log('app.js: User Data initialization completed');
}

/**
 * Render Sidebar and Top Navbar Markup
 */
function renderLayoutShell() {
  const sidebarContainer = document.getElementById('sidebar-container') || document.getElementById('sidebar');
  const navbarContainer = document.getElementById('navbar-container');

  if (!sidebarContainer && !navbarContainer) {
    console.log('app.js: Neither sidebar nor navbar containers found. Skipping shell rendering.');
    return;
  }

  const currentPath = window.location.pathname;
  const pageName = currentPath.substring(currentPath.lastIndexOf('/') + 1) || 'index.html';

  // 1. Render Sidebar
  if (sidebarContainer) {
    const isSidebarTag = sidebarContainer.tagName.toLowerCase() === 'aside';
    const sidebarContent = `
        <div class="sidebar-logo-area">
          <a href="index.html" class="logo-link">
            <i class="fa-solid fa-gem logo-icon-gold"></i>
            <span class="logo-text" id="sidebar-brand-name">SallePro</span>
          </a>
        </div>
        <nav class="sidebar-menu-nav">
          <a href="index.html" class="menu-item-link ${pageName === 'index.html' ? 'active' : ''}">
            <i class="fa-solid fa-chart-line"></i>
            <span class="menu-item-text">Tableau de bord</span>
          </a>
          <a href="reservations.html" class="menu-item-link ${pageName === 'reservations.html' ? 'active' : ''}">
            <i class="fa-solid fa-calendar-days"></i>
            <span class="menu-item-text">Réservations</span>
          </a>
          <a href="clients.html" class="menu-item-link ${pageName === 'clients.html' ? 'active' : ''}">
            <i class="fa-solid fa-users"></i>
            <span class="menu-item-text">Clients</span>
          </a>
          <a href="employees.html" class="menu-item-link ${pageName === 'employees.html' ? 'active' : ''}">
            <i class="fa-solid fa-user-tie"></i>
            <span class="menu-item-text">Employés</span>
          </a>
          <a href="stock.html" class="menu-item-link ${pageName === 'stock.html' ? 'active' : ''}">
            <i class="fa-solid fa-box-open"></i>
            <span class="menu-item-text">Stock</span>
          </a>
          <a href="charges.html" class="menu-item-link ${pageName === 'charges.html' ? 'active' : ''}">
            <i class="fa-solid fa-money-bill-wave"></i>
            <span class="menu-item-text">Charges</span>
          </a>
          <a href="reports.html" class="menu-item-link ${pageName === 'reports.html' ? 'active' : ''}">
            <i class="fa-solid fa-chart-pie"></i>
            <span class="menu-item-text">Rapports</span>
          </a>
          <a href="settings.html" class="menu-item-link ${pageName === 'settings.html' ? 'active' : ''}">
            <i class="fa-solid fa-gears"></i>
            <span class="menu-item-text">Paramètres</span>
          </a>
          <button id="sidebar-logout-btn" class="menu-item-link text-danger" style="margin-top: auto; background:none; border:none; width:100%; text-align:left; cursor:pointer;">
            <i class="fa-solid fa-right-from-bracket" style="color: var(--danger);"></i>
            <span class="menu-item-text">Déconnexion</span>
          </button>
        </nav>
        <div class="sidebar-user-footer">
          <div class="user-avatar-wrapper">
            <img id="sidebar-user-avatar" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100" alt="Avatar" class="user-avatar">
            <div class="user-status-dot"></div>
          </div>
          <div class="footer-info">
            <span class="footer-name" id="sidebar-user-name">Chargement...</span>
            <span class="footer-role" id="sidebar-user-role">-</span>
          </div>
        </div>
    `;

    if (isSidebarTag) {
      sidebarContainer.innerHTML = sidebarContent;
    } else {
      sidebarContainer.innerHTML = `<aside class="sidebar">${sidebarContent}</aside>`;
    }

    const logoutBtn = document.getElementById('sidebar-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', logoutUser);
    }
  }

  // 2. Render Navbar
  if (navbarContainer) {
    let pageTitle = 'Tableau de bord';
    if (pageName === 'reservations.html') pageTitle = 'Gestion des Réservations';
    else if (pageName === 'clients.html') pageTitle = 'Gestion des Clients';
    else if (pageName === 'employees.html') pageTitle = 'Gestion des Employés';
    else if (pageName === 'stock.html') pageTitle = 'Gestion du Stock';
    else if (pageName === 'charges.html') pageTitle = 'Gestion des Charges';
    else if (pageName === 'reports.html') pageTitle = 'Rapports Financiers';
    else if (pageName === 'settings.html') pageTitle = 'Paramètres Système';

    navbarContainer.innerHTML = `
      <header class="top-navbar">
        <div class="navbar-left">
          <button class="toggle-sidebar-btn" id="toggle-sidebar-trigger">
            <i class="fa-solid fa-bars-staggered"></i>
          </button>
          <div class="page-title-area">
            <h1>${pageTitle}</h1>
          </div>
        </div>
        <div class="navbar-right">
          <div class="nav-actions">
            <!-- Theme Toggle Button -->
            <button class="action-btn" id="theme-toggle-btn" title="Changer le thème">
              <i class="fa-solid fa-moon" id="theme-btn-icon"></i>
            </button>
            <!-- Notification Button -->
            <button class="action-btn" id="notif-btn" title="Notifications">
              <i class="fa-solid fa-bell"></i>
              <span class="badge-dot" id="notif-badge" style="display: none;"></span>
            </button>
          </div>
          <div class="user-profile-nav" id="navbar-user-profile-click">
            <div class="user-avatar-wrapper">
              <img id="navbar-user-avatar" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100" alt="Avatar" class="user-avatar">
              <div class="user-status-dot"></div>
            </div>
            <div class="user-info-text">
              <span class="user-name" id="navbar-user-name">Admin</span>
              <span class="user-role" id="navbar-user-role">Propriétaire</span>
            </div>
          </div>
        </div>
      </header>
      <!-- Mobile sidebar overlay -->
      <div class="sidebar-overlay" id="sidebar-overlay-trigger"></div>
    `;

    const profileClick = document.getElementById('navbar-user-profile-click');
    if (profileClick) {
      profileClick.onclick = () => { window.location.href = 'settings.html'; };
    }

    initNavbarInteractions();
  }

  // Populate profiles if already available in session storage
  updateUserProfileDisplay();
}

/**
 * Update Sidebar & Navbar user details
 */
function updateUserProfileDisplay() {
  const storedUser = sessionStorage.getItem('sp_current_user');
  if (!storedUser) return;

  const userData = JSON.parse(storedUser);

  const sidebarName = document.getElementById('sidebar-user-name');
  const sidebarRole = document.getElementById('sidebar-user-role');
  const navbarName = document.getElementById('navbar-user-name');
  const navbarRole = document.getElementById('navbar-user-role');

  if (sidebarName) sidebarName.innerText = userData.name || 'Admin';
  if (sidebarRole) sidebarRole.innerText = userData.role || 'Propriétaire';
  if (navbarName) navbarName.innerText = userData.name || 'Admin';
  if (navbarRole) navbarRole.innerText = userData.role || 'Propriétaire';

  // Render initials avatar if no photo URL exists
  if (userData.logo) {
    const sidebarAvatar = document.getElementById('sidebar-user-avatar');
    const navbarAvatar = document.getElementById('navbar-user-avatar');
    if (sidebarAvatar) sidebarAvatar.src = userData.logo;
    if (navbarAvatar) navbarAvatar.src = userData.logo;
  }
}

/**
 * Subscribe to the 'settings/hall_settings' document in real-time
 */
function subscribeToSettings() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  const docRef = doc(db, "users", userId, "settings", "hall_settings");
  
  onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const settings = docSnap.data();
      
      // Update global vars
      currentCurrencySymbol = settings.currency || "€";
      if (currentCurrencySymbol === "€") currentCurrencyCode = "EUR";
      else if (currentCurrencySymbol === "$") currentCurrencyCode = "USD";
      else if (currentCurrencySymbol === "DA") currentCurrencyCode = "DZD";
      else if (currentCurrencySymbol === "DH") currentCurrencyCode = "MAD";
      else if (currentCurrencySymbol === "£") currentCurrencyCode = "GBP";

      // Apply theme
      const isDark = settings.darkMode === true;
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      
      const themeCheckbox = document.getElementById('pref-darkmode');
      if (themeCheckbox) themeCheckbox.checked = isDark;
      
      const themeIcon = document.getElementById('theme-btn-icon');
      if (themeIcon) {
        themeIcon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      }

      // Update brand name
      const brand = document.getElementById('sidebar-brand-name');
      if (brand && settings.hallName) {
        brand.innerText = settings.hallName;
      }

      // Dispatch global settings updated event
      window.dispatchEvent(new CustomEvent('spSettingsUpdated', { detail: settings }));
    }
  }, (err) => {
    console.error("app.js: Error listening to settings document:", err);
  });
}

/**
 * Handle Theme toggle and sidebar collapse bindings
 */
function initNavbarInteractions() {
  const container = document.getElementById('app-root') || document.getElementById('app-container');
  const toggleBtn = document.getElementById('toggle-sidebar-trigger');
  const overlay = document.getElementById('sidebar-overlay-trigger');
  const themeBtn = document.getElementById('theme-toggle-btn');

  // Sidebar Collapse state reload
  const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
  if (isCollapsed && container) {
    container.classList.add('sidebar-collapsed');
  }

  // Sidebar Collapse Toggle
  if (toggleBtn && container) {
    toggleBtn.onclick = () => {
      if (window.innerWidth > 991) {
        container.classList.toggle('sidebar-collapsed');
        localStorage.setItem('sidebar_collapsed', container.classList.contains('sidebar-collapsed'));
      } else {
        container.classList.toggle('sidebar-open');
      }
    };
  }

  // Mobile overlay
  if (overlay && container) {
    overlay.onclick = () => {
      container.classList.remove('sidebar-open');
    };
  }

  // Dark/Light Theme Button Click
  if (themeBtn) {
    themeBtn.onclick = async () => {
      const activeTheme = document.documentElement.getAttribute('data-theme');
      const isDarkMode = activeTheme !== 'dark';
      
      try {
        const userId = auth.currentUser?.uid;
        if (userId) {
          await updateDoc(doc(db, "users", userId, "settings", "hall_settings"), { darkMode: isDarkMode });
          showToast('Thème mis à jour', `Mode ${isDarkMode ? 'sombre' : 'clair'} activé.`, 'info');
        }
      } catch (err) {
        console.error("app.js: Error saving theme preference:", err);
      }
    };
  }
}

/**
 * Subscribe to stock collection in real-time to alert low stock items
 */
let lowStockItemsList = [];
function subscribeToStockAlerts() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  const stockRef = collection(db, "users", userId, "stock");
  
  onSnapshot(stockRef, (snapshot) => {
    lowStockItemsList = [];
    snapshot.forEach(doc => {
      const item = doc.data();
      if (item.quantity <= item.minimumQuantity) {
        lowStockItemsList.push(item.itemName);
      }
    });

    const badge = document.getElementById('notif-badge');
    const notifBtn = document.getElementById('notif-btn');
    
    if (badge) {
      badge.style.display = lowStockItemsList.length > 0 ? 'block' : 'none';
    }

    if (notifBtn) {
      notifBtn.onclick = () => {
        if (lowStockItemsList.length > 0) {
          showToast('Alerte Stock', `Stocks bas pour : ${lowStockItemsList.join(', ')}`, 'warning');
        } else {
          showToast('Notifications', 'Aucune alerte critique en cours.', 'success');
        }
      };
    }
  }, (err) => {
    console.error("app.js: Error listening to stock alerts:", err);
  });
}

/**
 * Check if there is a booked event scheduled for tomorrow
 */
async function checkTomorrowEventAlert() {
  const tomorrowStr = "2026-07-01"; // Simulated tomorrow date for testing
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  
  try {
    const q = query(
      collection(db, "users", userId, "reservations"), 
      where("status", "==", "Confirmé")
    );
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      snap.forEach(docSnap => {
        const res = docSnap.data();
        if (res.startDate <= tomorrowStr && res.endDate >= tomorrowStr) {
          setTimeout(() => {
            showToast('Événement Demain', `Rappel: Réception ${res.eventType} pour ${res.clientName} prévue demain !`, 'info');
          }, 2000);
        }
      });
    }
  } catch (err) {
    console.error("app.js: Error checking upcoming tomorrow events:", err);
  }
}

/**
 * Global Toast Alert Notification Panel
 */
export function showToast(title, message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconClass = 'fa-circle-check';
  if (type === 'warning') iconClass = 'fa-triangle-exclamation';
  if (type === 'danger') iconClass = 'fa-circle-exclamation';
  if (type === 'info') iconClass = 'fa-circle-info';

  toast.innerHTML = `
    <i class="fa-solid ${iconClass}"></i>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>
    <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
  `;

  container.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      toast.style.transform = 'translateY(20px)';
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 300);
    };
  }

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.transform = 'translateY(20px)';
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 300);
    }
  }, 4500);
}
