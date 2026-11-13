#!/usr/bin/env bash
# Atualiza version.json e envia para o GitHub (Pages publica sozinho).
# Uso: scripts/publicar.sh "mensagem do commit"
set -e
cd "$(dirname "$0")/.."
V="$(date -u +%Y%m%d-%H%M%S)"
echo "{\"v\":\"$V\"}" > version.json
python3 scripts/carimbar_versao.py "$V"
git add -A
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q -m "$1

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HuutfqkZESbs5wsEckBBug"
git push origin main
echo "publicado: versão $V"
