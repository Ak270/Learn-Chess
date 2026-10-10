// Coach Report (docs/backend/10 §6): a printable HTML page with metrics (with uncertainty), top mistakes with board
// diagrams, active notes and the plan, for sharing with a human coach or friend. All data stays in the file.
import { Chess } from 'chess.js';

const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const H = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export function boardSvg(fen: string, size = 200, arrow?: [string, string]): string {
  const c = new Chess(fen);
  const s = size / 8;
  const files = 'abcdefgh';
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Chess position">`;
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      out += `<rect x="${f * s}" y="${r * s}" width="${s}" height="${s}" fill="${(r + f) % 2 ? '#739552' : '#ebecd0'}"/>`;
      const p = c.board()[r][f];
      if (p)
        out += `<text x="${f * s + s / 2}" y="${r * s + s * 0.78}" font-size="${s * 0.85}" text-anchor="middle" fill="${p.color === 'w' ? '#fff' : '#111'}" stroke="${p.color === 'w' ? '#111' : '#fff'}" stroke-width="${s * 0.03}">${GLYPH[p.type]}</text>`;
    }
  if (arrow) {
    const xy = (sq: string) => [files.indexOf(sq[0]) * s + s / 2, (8 - Number(sq[1])) * s + s / 2];
    const [x1, y1] = xy(arrow[0]);
    const [x2, y2] = xy(arrow[1]);
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fa412d" stroke-width="${s * 0.14}" stroke-linecap="round" opacity=".85"/>`;
  }
  return out + '</svg>';
}

export interface ReportData {
  generatedAt: string;
  name: string;
  games: number;
  baseline?: { blundersPer40: number; missedThreatsPerGame: number; accuracy: number; n: number };
  mistakes: { title: string; fen: string; arrow?: [string, string]; text: string; diagnosis: string[] }[];
  memories: string[];
  focus: string;
  limitations: string[];
}

export function coachReportHtml(d: ReportData): string {
  const b = d.baseline;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mentor coach report</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#222}h1{margin-bottom:0}h2{margin-top:28px;border-bottom:1px solid #ddd}.card{display:flex;gap:16px;margin:12px 0;page-break-inside:avoid}.muted{color:#555}table{border-collapse:collapse}td,th{padding:4px 12px 4px 0;text-align:left}</style></head><body>
<h1>Chess coach report</h1><p class="muted">${H(d.name)} · generated ${H(d.generatedAt)} · ${d.games} games reviewed</p>
<h2>Where things stand</h2>${b ? `<table><tr><th>Blunders per 40 moves</th><td>${b.blundersPer40.toFixed(1)}</td></tr><tr><th>Missed threats per game</th><td>${b.missedThreatsPerGame.toFixed(1)}</td></tr><tr><th>Accuracy</th><td>${Math.round(b.accuracy)}%</td></tr></table><p class="muted">Based on ${b.n} games. With this few games the numbers are rough: treat changes smaller than about a third as noise.</p>` : '<p>Not enough reviewed games yet for numbers (needs 5).</p>'}
<p><b>Current focus:</b> ${H(d.focus)}</p>
<h2>The mistakes worth talking about</h2>${d.mistakes.map((m) => `<div class="card">${boardSvg(m.fen, 200, m.arrow)}<div><b>${H(m.title)}</b><p>${H(m.text)}</p>${m.diagnosis.length ? `<p class="muted">Likely reasons: ${m.diagnosis.map(H).join('; ')}</p>` : ''}</div></div>`).join('') || '<p>None yet.</p>'}
<h2>What the coach has noticed</h2>${d.memories.length ? `<ul>${d.memories.map((x) => `<li>${H(x)}</li>`).join('')}</ul>` : '<p>Nothing with enough evidence yet.</p>'}
<h2>Limits of this report</h2><ul>${d.limitations.map((x) => `<li>${H(x)}</li>`).join('')}</ul></body></html>`;
}
