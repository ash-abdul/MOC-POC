// TR-07: English and Arabic text is held in resource files (server/i18n/*.json);
// Ministry Administrators can override any string on screen (translations table).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all } from '../db/index.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../i18n');
// Each area of the portal has its own resource file: server/i18n/<lang>/<area>.json
export const base = (lang) =>
  Object.assign({}, ...fs.readdirSync(path.join(dir, lang)).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, lang, f), 'utf8'))));

export function dict(lang) {
  const d = base(lang);
  for (const o of all('SELECT key, value FROM translations WHERE lang = ?', lang)) d[o.key] = o.value;
  return d;
}
