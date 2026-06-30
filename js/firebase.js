/**
 * SallePro - Firebase v11 Initialization Service
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBgugHA-EG42XcgkZPXa5Z87DAwrIaGOkk",
  authDomain: "salle-21a09.firebaseapp.com",
  projectId: "salle-21a09",
  storageBucket: "salle-21a09.firebasestorage.app",
  messagingSenderId: "157167134480",
  appId: "1:157167134480:web:d9ac90811c2a30986ee795",
  measurementId: "G-EHTY4JHS44"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

