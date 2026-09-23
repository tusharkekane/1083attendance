import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCb8AWQO3lQBKA9JAYEyNPZ280J2j8Q_Pc",
  authDomain: "troop1083-scout-attendance.firebaseapp.com",
  projectId: "troop1083-scout-attendance",
  storageBucket: "troop1083-scout-attendance.firebasestorage.app",
  messagingSenderId: "875785898915",
  appId: "1:875785898915:web:c55cae5256e5e2e78ea816",
  measurementId: "G-SPEQHFPV9J"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
