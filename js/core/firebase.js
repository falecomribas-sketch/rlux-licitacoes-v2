// Conexão com o Firebase — mesmo projeto da versão atual (rlux-licitacoes).
// A apiKey do Firebase é pública por design; a proteção dos dados vem das
// Regras de Segurança do Firestore/Storage, que exigem usuário autenticado.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDlIrB6t2oklh5fmwDUix2YkKbQebLFeF4",
  authDomain: "rlux-licitacoes.firebaseapp.com",
  projectId: "rlux-licitacoes",
  storageBucket: "rlux-licitacoes.firebasestorage.app",
  messagingSenderId: "1049469372524",
  appId: "1:1049469372524:web:4ce1734d8c82ee15ebf049",
};

export const app = initializeApp(firebaseConfig);

// Cache local persistente: a tela abre com os dados da última visita e
// atualiza sozinha quando o Firestore responde. Substitui o botão
// "Sincronizar Nuvem" da versão anterior.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const storage = getStorage(app);
export const auth = getAuth(app);
