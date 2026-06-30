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

// Check authentication status and redirect if necessary
export function checkSessionAndRoute() {
  const isLoginPage = window.location.pathname.endsWith('login.html');
  
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is logged in
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          sessionStorage.setItem('sp_current_user', JSON.stringify(userData));
        } else {
          // If no Firestore document, construct a default one
          const defaultData = { uid: user.uid, name: user.email.split('@')[0], email: user.email, role: 'Propriétaire', createdAt: new Date().toISOString() };
          await setDoc(doc(db, "users", user.uid), defaultData);
          sessionStorage.setItem('sp_current_user', JSON.stringify(defaultData));
        }
      } catch (e) {
        console.error("Error loading user profile: ", e);
      }

      if (isLoginPage) {
        window.location.href = 'index.html';
      } else {
        removeLoaderOverlay();
        // Dispatch session event to other scripts
        window.dispatchEvent(new Event('authSessionLoaded'));
      }
    } else {
      // User is logged out
      sessionStorage.removeItem('sp_current_user');
      if (!isLoginPage) {
        window.location.href = 'login.html';
      } else {
        removeLoaderOverlay();
      }
    }
  });
}

function removeLoaderOverlay() {
  const loader = document.getElementById('loading-overlay');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 400);
  }
}

// Login
export async function loginUser(email, password, rememberMe) {
  if (rememberMe) {
    // Firebase auth handles persistence automatically based on its default configuration, 
    // but we can set it explicitly or store flags if needed.
  }
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

// Sign up (Creates Auth account and sets Firestore document)
export async function registerAdmin(name, email, password) {
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
  await signOut(auth);
  sessionStorage.removeItem('sp_current_user');
  window.location.href = 'login.html';
}

// Run guard check on file load
checkSessionAndRoute();
