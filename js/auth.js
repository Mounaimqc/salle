/**
 * SallePro - Authentication & Session Management
 */

import { auth, db } from "./firebase.js";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
  doc, 
  setDoc, 
  getDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

console.log('auth.js: Imports loaded successfully');

// Global Fatal Error UI
export function showFatalError(error) {
  console.error("Critical Application Error:", error);
  const container = document.body;
  if (container) {
    container.innerHTML = `
      <div style="padding:40px;font-family:sans-serif;color:#be123c;background-color:#fff1f2;border:1px solid #fecdd3;border-radius:12px;margin:20px;max-width:800px;">
        <h2 style="margin-top:0;">Erreur Critique de l'Application</h2>
        <p>Une erreur inattendue s'est produite lors de l'initialisation de la page. Détails de l'erreur :</p>
        <pre style="background:#f8fafc;padding:15px;border-radius:8px;border:1px solid #e2e8f0;overflow-x:auto;font-family:monospace;font-size:0.9rem;color:#334155;">${error.stack || error.message || error}</pre>
        <button onclick="window.location.reload()" style="background:#be123c;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:600;cursor:pointer;margin-top:10px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">Réessayer</button>
      </div>
    `;
  }
}

// Remove the loading loader overlay and show the main application container
export function removeLoaderOverlay() {
  console.log('auth.js: Removing loader overlay and displaying app container');
  try {
    const loader = document.getElementById('loading-overlay');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => {
        if (loader.parentNode) loader.remove();
      }, 400);
    }
  } catch (err) {
    console.error("Error removing loader overlay:", err);
  } finally {
    // Crucial: Always make the app container visible even if overlay removal fails
    const appContainer = document.getElementById('app-container') || document.getElementById('app-root');
    if (appContainer) {
      appContainer.style.display = 'flex';
      console.log('auth.js: App container is now visible (display: flex)');
    }
  }
}

// Check authentication status and redirect if necessary
export function checkSessionAndRoute() {
  const isLoginPage = window.location.pathname.endsWith('login.html');
  console.log('auth.js: Checking authentication state. Is login page?', isLoginPage);
  
  onAuthStateChanged(auth, async (user) => {
    try {
      if (user) {
        console.log('auth.js: User is authenticated:', user.email);
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            sessionStorage.setItem('sp_current_user', JSON.stringify(userData));
          } else {
            console.log('auth.js: Creating new Firestore user profile document');
            const defaultData = { 
              uid: user.uid, 
              name: user.email.split('@')[0], 
              email: user.email, 
              role: 'Propriétaire', 
              createdAt: new Date().toISOString() 
            };
            await setDoc(doc(db, "users", user.uid), defaultData);
            sessionStorage.setItem('sp_current_user', JSON.stringify(defaultData));
          }
        } catch (e) {
          console.error("auth.js: Error loading user profile document:", e);
        }

        if (isLoginPage) {
          console.log('auth.js: Authenticated user on login page, redirecting to index.html');
          window.location.href = 'index.html';
        } else {
          removeLoaderOverlay();
          console.log('auth.js: Dispatching authSessionLoaded event');
          window.dispatchEvent(new Event('authSessionLoaded'));
        }
      } else {
        console.log('auth.js: User is not authenticated');
        sessionStorage.removeItem('sp_current_user');
        if (!isLoginPage) {
          console.log('auth.js: Unauthenticated user on protected page, redirecting to login.html');
          window.location.href = 'login.html';
        } else {
          removeLoaderOverlay();
        }
      }
    } catch (error) {
      console.error("auth.js: Error in onAuthStateChanged wrapper:", error);
      removeLoaderOverlay();
      showFatalError(error);
    }
  });
}

// Login
export async function loginUser(email, password, rememberMe) {
  console.log('auth.js: Attempting login for email:', email);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

// Sign up (Creates Auth account and sets Firestore document)
export async function registerAdmin(name, email, password) {
  console.log('auth.js: Attempting registration for email:', email);
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;
  
  const userData = {
    uid: user.uid,
    name,
    email,
    role: "Propriétaire",
    createdAt: new Date().toISOString()
  };

  await setDoc(doc(db, "users", user.uid), userData);
  return user;
}

// Logout
export async function logoutUser() {
  console.log('auth.js: Logging out user');
  await signOut(auth);
  sessionStorage.removeItem('sp_current_user');
  window.location.href = 'login.html';
}

// Run guard check on file load
try {
  checkSessionAndRoute();
} catch (error) {
  console.error("auth.js: Immediate session routing check failed:", error);
  showFatalError(error);
}
