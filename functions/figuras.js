// Lista, por página, as imagens grandes de um PDF. Roda em processo separado (pdf.js trava e consome
// memória em alguns PDFs escaneados): o chamador mata o processo se demorar. Uso: node figuras.js <arquivo.pdf>
const fs = require("fs");
const { PDFParse } = require("pdf-parse");
process.on("beforeExit", () => { process.stderr.write("pdf.js não concluiu a listagem (travou)"); process.exit(2); });
(async () => {
  const parser = new PDFParse({ data: fs.readFileSync(process.argv[2]) });
  const im = await parser.getImage({ imageThreshold: 250, imageBuffer: false, imageDataUrl: false });
  const out = (im.pages || []).filter((pg) => pg.images.length).map((pg) => ({ p: pg.pageNumber, i: pg.images.map((x) => [x.width, x.height]) }));
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
})().catch((e) => { process.stderr.write(String(e && e.message || e)); process.exit(1); });
