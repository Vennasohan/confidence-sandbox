import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, query, where, getDocs, orderBy, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA880sJ-O0WmAk07yHSl5F5I6PbPrUCVD8",
  authDomain: "confidence-scorer.firebaseapp.com",
  projectId: "confidence-scorer",
  storageBucket: "confidence-scorer.firebasestorage.app",
  messagingSenderId: "744355537361",
  appId: "1:744355537361:web:78d04a3257d9ff731640f0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { auth, db, googleProvider, signInWithPopup, signOut, collection, addDoc, query, where, getDocs, orderBy, serverTimestamp };
