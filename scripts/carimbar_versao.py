#!/usr/bin/env python3
"""Acrescenta ?v=VERSAO a todo import de módulo local (js/**/*.js e index.html).
Assim, ao publicar, o navegador busca os arquivos novos sem precisar de Ctrl+F5."""
import re, sys, pathlib
v = sys.argv[1]
raiz = pathlib.Path(__file__).resolve().parent.parent
# import ... from "./x.js" | "../core/x.js"  e  import("./x.js")
pad = re.compile(r'''((?:from|import)\s*\(?\s*["'])(\.{1,2}/[^"']+?\.js)(\?v=[\w-]+)?(["'])''')
n = 0
for p in list((raiz / "js").rglob("*.js")):
    s = p.read_text(encoding="utf-8")
    novo = pad.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={v}{m.group(4)}", s)
    if novo != s: p.write_text(novo, encoding="utf-8"); n += 1
idx = raiz / "index.html"; s = idx.read_text(encoding="utf-8")
novo = re.sub(r'(src="js/app\.js)(\?v=[\w-]+)?"', lambda m: f'{m.group(1)}?v={v}"', s)
novo = re.sub(r'(href="css/app\.css)(\?v=[\w-]+)?"', lambda m: f'{m.group(1)}?v={v}"', novo)
if novo != s: idx.write_text(novo, encoding="utf-8"); n += 1
print(f"carimbados {n} arquivo(s) com v={v}")
