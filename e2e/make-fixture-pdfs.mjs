// Generates the PDF fixtures used by e2e/pdf-reader.spec.ts. Run with
// `node e2e/make-fixture-pdfs.mjs`; the outputs are committed.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

/** Assemble a PDF from object bodies (1-based ids), with a correct xref. */
function pdf(objects) {
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

function stream(content) {
  return `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`
}

/** Text lines: [fontSize, y, text]. */
function textOps(lines, font = 'F1') {
  return lines
    .map(([size, y, text]) => `BT /${font} ${size} Tf 50 ${y} Td (${text}) Tj ET`)
    .join('\n')
}

// English paper: a heading, the term "dropout" twice in different sections.
const paper = pdf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  stream(
    textOps([
      [20, 720, 'Training Neural Networks'],
      [11, 690, 'Networks overfit when they memorize the training data.'],
      [11, 676, 'Early dropout of weak features is a data-cleaning step.'],
      [20, 630, 'Regularization'],
      [11, 600, 'Here dropout randomly disables units during training,'],
      [11, 586, 'which forces the network to learn redundant features.'],
    ]),
  ),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
])
writeFileSync(join(dir, 'paper.pdf'), paper)

// Chinese text through a predefined CMap (UniGB-UCS2-H): pdf.js must fetch the
// packed CMap from the extension to decode it — a missing cMapUrl shows up here.
const hex = (s) =>
  [...s].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()).join('')
const cjk = pdf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  stream(`BT /F1 16 Tf 50 700 Td <${hex('上下文感知的术语解释')}> Tj ET`),
  '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [6 0 R] >>',
  '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 7 0 R >>',
  '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 >>',
])
writeFileSync(join(dir, 'cjk.pdf'), cjk)

console.log('wrote paper.pdf, cjk.pdf')
