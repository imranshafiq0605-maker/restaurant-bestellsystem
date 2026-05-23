import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBiJcAuiG7x-kOOrFhLqepLSWw0NSee-BM",
  authDomain: "la-rosa-bestellsystem.firebaseapp.com",
  projectId: "la-rosa-bestellsystem",
  storageBucket: "la-rosa-bestellsystem.firebasestorage.app",
  messagingSenderId: "752947654043",
  appId: "1:752947654043:web:3f8c2d0963c50cd7a2053e",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);