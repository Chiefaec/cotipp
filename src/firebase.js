import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCoKOeLgZHfo9p5mRGWZT6bZerXCXRtikM",
  authDomain: "cotipp-e74a4.firebaseapp.com",
  projectId: "cotipp-e74a4",
  storageBucket: "cotipp-e74a4.firebasestorage.app",
  messagingSenderId: "432116524158",
  appId: "1:432116524158:web:88080dfd4a6b70f413a42f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DOC_REF = () => doc(db, "cotipp", "main");
const CFG_REF = () => doc(db, "cotipp", "cfg");

export async function fbLoad() {
  try {
    const snap = await getDoc(DOC_REF());
    return snap.exists() ? snap.data() : null;
  } catch(e) { console.error("fbLoad error", e); return null; }
}

export async function fbSave(data) {
  try { await setDoc(DOC_REF(), data); } catch(e) { console.error("fbSave error", e); }
}

export async function fbLoadCfg() {
  try {
    const snap = await getDoc(CFG_REF());
    return snap.exists() ? snap.data() : null;
  } catch(e) { return null; }
}

export async function fbSaveCfg(cfg) {
  try { await setDoc(CFG_REF(), cfg); } catch(e) { console.error("fbSaveCfg error", e); }
}

export function fbSubscribe(callback) {
  return onSnapshot(DOC_REF(), (snap) => {
    if(snap.exists()) callback(snap.data());
  }, (err) => console.error("fbSubscribe error", err));
}
