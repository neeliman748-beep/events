import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBd3QLfl77Uq43TYmwaulh_o5IrqBRPqRs",
  authDomain: "event2026-3617d.firebaseapp.com",
  projectId: "event2026-3617d",
  storageBucket: "event2026-3617d.firebasestorage.app",
  messagingSenderId: "991764135456",
  appId: "1:991764135456:web:5dc0c45387ace9b6e34645",
  measurementId: "G-3K5QL9K39G"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);