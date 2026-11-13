// Aviso de nova versão: compara version.json do servidor com o carregado.
// version.json é atualizado a cada publicação (scripts/publicar.sh).
import { icon } from "./ui.js?v=20261113-182835";

let atual = null;
async function ler() {
  const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status);
  return (await r.json()).v;
}
export async function iniciarVerificacaoDeVersao() {
  try { atual = await ler(); } catch { return; }
  const check = async () => {
    try {
      const v = await ler();
      if (v && atual && v !== atual && !document.getElementById("nova-versao")) {
        const b = document.createElement("div");
        b.id = "nova-versao"; b.className = "nova-versao";
        b.innerHTML = `${icon("refresh")}<span>Nova versão disponível.</span><button class="btn btn-amber btn-sm" id="nv-reload">Atualizar agora</button>`;
        document.body.appendChild(b);
        b.querySelector("#nv-reload").addEventListener("click", () => location.reload());
      }
    } catch {}
  };
  setInterval(check, 3 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
}
