// Store — espelho em memória das coleções do Firestore, atualizado em tempo real.
//
// Uso:
//   store.get('propostas')         -> array (sempre a versão mais recente)
//   store.on('propostas', fn)      -> chama fn quando a coleção muda
//   store.on('*', fn)              -> chama fn quando qualquer coleção muda
//   await store.ready()            -> resolve após a primeira carga de todas
//
// Escritas vão direto no Firestore (setItem/remove); o listener traz a
// alteração de volta e dispara os eventos. Não há mais cache manual em
// localStorage nem botão de sincronizar.
import { db } from "./firebase.js";
import {
  collection, onSnapshot, doc, setDoc, deleteDoc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Mesmas coleções da versão atual. Nomes e campos não mudam durante a convivência.
export const COLLECTIONS = [
  "portais", "categorias", "produtos", "orgaos", "licitacoes", "propostas",
  "atas", "adesoes", "empenhos", "crm", "cobrancas", "usuarios",
  "exequibilidade", "reequilibrio",
];

const data = {};
const listeners = {};
const unsubs = [];
let readyPromise = null;

function emit(name) {
  (listeners[name] || []).forEach((fn) => { try { fn(data[name]); } catch (e) { console.error(e); } });
  (listeners["*"] || []).forEach((fn) => { try { fn(name, data[name]); } catch (e) { console.error(e); } });
}

export const store = {
  get(name) { return data[name] || []; },

  find(name, id) { return (data[name] || []).find((x) => x.id === id) || null; },

  on(name, fn) {
    (listeners[name] ||= []).push(fn);
    return () => { listeners[name] = listeners[name].filter((f) => f !== fn); };
  },

  // Inicia os listeners (chamar depois do login). Idempotente.
  start() {
    if (readyPromise) return readyPromise;
    readyPromise = Promise.all(COLLECTIONS.map((name) => new Promise((resolve) => {
      let first = true;
      const unsub = onSnapshot(collection(db, name), (snap) => {
        data[name] = snap.docs.map((d) => d.data());
        emit(name);
        if (first) { first = false; resolve(); }
      }, (err) => {
        console.error(`Erro ao ouvir ${name}:`, err);
        data[name] ||= [];
        if (first) { first = false; resolve(); }
      });
      unsubs.push(unsub);
    })));
    return readyPromise;
  },

  ready() { return readyPromise || Promise.resolve(); },

  // Para os listeners (no logout) e limpa os dados em memória.
  stop() {
    unsubs.splice(0).forEach((u) => u());
    Object.keys(data).forEach((k) => delete data[k]);
    readyPromise = null;
  },

  // Grava um item (cria ou substitui). O item precisa ter .id
  async setItem(name, item) {
    if (!item?.id) throw new Error("item sem id");
    await setDoc(doc(db, name, item.id), item);
    return item;
  },

  async remove(name, id) { await deleteDoc(doc(db, name, id)); },

  // Documentos avulsos (ex.: config/reguaEnvios)
  async getObj(name, id) {
    const s = await getDoc(doc(db, name, id));
    return s.exists() ? s.data() : null;
  },
  async setObj(name, id, obj) { await setDoc(doc(db, name, id), obj); },

  // Ouve um documento avulso em tempo real (ex.: config/reguaEnvios)
  watchObj(name, id, cb) {
    const unsub = onSnapshot(doc(db, name, id), (s) => cb(s.exists() ? s.data() : null), (e) => console.error(e));
    unsubs.push(unsub);
    return unsub;
  },
};

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
