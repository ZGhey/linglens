// Builds scripts/demo/notes.pdf: a one-page "lab notes" PDF where "dropout"
// means two different things in two sections. Each word is its own text-show
// operator, so pdf.js gives every word its own text-layer span and selection
// highlights line up with the rendered glyphs.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LINES = [
  ['F2', 22, 720, 'Training Robust Neural Networks'],
  ['F1', 11, 694, 'A. Researcher, B. Student - Lab Notes, 2026'],
  ['F2', 15, 650, '1 Data preparation'],
  ['F1', 11, 628, 'Before training we clean the dataset. Early dropout of weak features is a'],
  ['F1', 11, 613, 'data-cleaning step: inputs that carry little signal are removed so the model'],
  ['F1', 11, 598, 'never sees them. This keeps the input space small and the training fast.'],
  ['F2', 15, 560, '2 Regularization'],
  ['F1', 11, 538, 'Large networks memorize their training data. Here dropout randomly disables'],
  ['F1', 11, 523, 'units during training, which forces the network to learn redundant features'],
  ['F1', 11, 508, 'instead of relying on any single unit. We use a rate of 0.5 in hidden layers'],
  ['F1', 11, 493, 'and turn it off at evaluation time.'],
  ['F2', 15, 455, '3 Results'],
  ['F1', 11, 433, 'With both steps the validation error drops by a clear margin while training'],
  ['F1', 11, 418, 'time stays roughly the same as the baseline model.'],
]

const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c)
const ops = LINES.map(([font, size, y, text]) => {
  const words = text.split(' ').map((w, i, a) => (i < a.length - 1 ? w + ' ' : w))
  return `BT /${font} ${size} Tf 72 ${y} Td ${words.map((w) => `(${esc(w)}) Tj`).join(' ')} ET`
}).join('\n')

const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
  `<< /Length ${Buffer.byteLength(ops, 'latin1')} >>\nstream\n${ops}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
]
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
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'notes.pdf'), Buffer.from(out, 'latin1'))
