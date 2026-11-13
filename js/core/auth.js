// Autenticação: Firebase Auth (e-mail/senha) + perfil na coleção `usuarios`.
//
// Na versão atual o login tentava o Firebase Auth e, se falhasse, procurava
// o usuário na coleção `usuarios` — mas como as regras do Firestore exigem
// autenticação, na prática só o Auth funciona. Aqui mantemos só o Auth.
import { auth } from "./firebase.js?v=20261113-164426";
import { store, newId } from "./store.js?v=20261113-164426";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export let currentUser = null; // perfil da coleção usuarios

const MENSAGENS = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/invalid-email": "Digite um e-mail válido.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  "auth/network-request-failed": "Sem conexão com a internet.",
  "auth/user-disabled": "Este usuário está desativado.",
};

export async function login(email, senha, lembrar = true) {
  try {
    try { await setPersistence(auth, lembrar ? browserLocalPersistence : browserSessionPersistence); } catch {}
    await signInWithEmailAndPassword(auth, email.trim(), senha);
  } catch (e) {
    throw new Error(MENSAGENS[e.code] || "Não foi possível entrar. Tente de novo.");
  }
}

export async function logout() {
  store.stop();
  currentUser = null; store.usuarioAtual = "";
  await signOut(auth);
}

// Resolve o perfil de `usuarios` para o usuário do Auth. Se não existir,
// cria (mesmo comportamento da versão atual).
async function carregarPerfil(fbUser) {
  await store.start();
  const email = (fbUser.email || "").toLowerCase();
  let perfil = store.get("usuarios").find((u) => (u.email || "").toLowerCase() === email);
  if (!perfil) {
    perfil = {
      id: newId(), nome: fbUser.displayName || email.split("@")[0], email: fbUser.email,
      perfil: "Admin", ativo: true, criadoEm: new Date().toISOString(),
    };
    try { await store.setItem("usuarios", perfil); } catch (e) { console.error(e); }
  }
  if (perfil.ativo === false) {
    await logout();
    throw new Error("Este usuário está desativado. Fale com o administrador.");
  }
  currentUser = perfil; store.usuarioAtual = perfil?.email || "";
  return perfil;
}

// onAuth(fn): fn(perfil|null) sempre que o estado de login mudar.
export function onAuth(fn) {
  onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) { currentUser = null; fn(null); return; }
    try { fn(await carregarPerfil(fbUser)); }
    catch (e) { console.error(e); fn(null, e.message); }
  });
}

export const isAdmin = () => currentUser?.perfil === "Admin";
export const podeEditar = () => currentUser && currentUser.perfil !== "Visualizador";

export async function esqueciSenha(email) {
  const e = String(email || "").trim(); if (!e) throw new Error("Digite seu e-mail no campo acima e clique de novo.");
  try { await sendPasswordResetEmail(auth, e); }
  catch (err) { if (err.code === "auth/invalid-email") throw new Error("E-mail inválido."); if (err.code === "auth/too-many-requests") throw new Error("Muitas tentativas; aguarde alguns minutos."); throw new Error("Não foi possível enviar o e-mail agora."); }
}
