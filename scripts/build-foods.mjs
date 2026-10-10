#!/usr/bin/env node
// Builds public/foods.json, a compact offline generic-food database, from the
// USDA FoodData Central CSV downloads (public domain):
//   - SR Legacy        (FoodData_Central_sr_legacy_food_csv_2018-04.zip)
//   - FNDDS / Survey   (FoodData_Central_survey_food_csv_<date>.zip)
//
// Usage:
//   node scripts/build-foods.mjs <extracted-dir> <extracted-dir> [--out public/foods.json] [--fndds-date YYYY-MM-DD]
//
// Each directory may be the folder that holds food.csv or its parent (the folder
// the zip was extracted into). The dataset type is detected from its contents,
// so the arguments can be given in any order. No dependencies.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- config

// Output order. `nbr` = USDA nutrient_nbr; units are checked against nutrient.csv.
const NUTRIENTS = [
  { key: 'kcal', nbr: '208', unit: 'KCAL' },
  { key: 'protein', nbr: '203', unit: 'G' },
  { key: 'carbs', nbr: '205', unit: 'G' },
  { key: 'fat', nbr: '204', unit: 'G' },
  { key: 'fiber', nbr: '291', unit: 'G' },
  { key: 'sugar', nbr: '269', unit: 'G' },
  { key: 'satFat', nbr: '606', unit: 'G' },
  { key: 'monoFat', nbr: '645', unit: 'G' },
  { key: 'polyFat', nbr: '646', unit: 'G' },
  { key: 'transFat', nbr: '605', unit: 'G' },
  { key: 'chol', nbr: '601', unit: 'MG' },
  { key: 'sodium', nbr: '307', unit: 'MG' },
  { key: 'potassium', nbr: '306', unit: 'MG' },
  { key: 'calcium', nbr: '301', unit: 'MG' },
  { key: 'iron', nbr: '303', unit: 'MG' },
  { key: 'vitA', nbr: '320', unit: 'UG' },
  { key: 'vitC', nbr: '401', unit: 'MG' },
  { key: 'vitD', nbr: '328', unit: 'UG' },
];
// Energy fallbacks (Atwater general / specific factors), both KCAL.
const KCAL_FALLBACK = [
  { nbr: '957', unit: 'KCAL' },
  { nbr: '958', unit: 'KCAL' },
];
const MAX_PORTIONS = 6;

// All-caps tokens (3+ letters) that are abbreviations, acronyms or stylised
// brand names and must stay upper case.
const KEEP_UPPER = new Set([
  'NFS', 'USDA', 'NLEA', 'NFSMI', 'DHA', 'ARA', 'EPA', 'KFC', 'USA', 'BBQ',
  'PBM', 'TLC', 'LGG', 'EAS', 'NOS', 'AMP', 'KIND', 'UHT', 'MCT', 'IHOP', 'TCBY',
  'BLT', 'XXL',
]);

// ---------------------------------------------------------------- CSV

// Splits one CSV record. Returns null when the record continues on the next
// line (an unterminated quoted field), so the caller can append and retry.
function parseRecord(text) {
  const out = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { out.push(field); field = ''; i++; continue; }
    field += c; i++;
  }
  if (inQuotes) return null;
  out.push(field);
  return out;
}

// Streams a CSV file, calling onRow(objectKeyedByHeader) for each record.
async function readCsv(file, onRow) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let header = null;
  let pending = null;
  for await (let line of rl) {
    if (pending !== null) { line = pending + '\n' + line; pending = null; }
    if (header === null) line = line.replace(/^﻿/, '');
    const rec = parseRecord(line);
    if (rec === null) { pending = line; continue; }
    if (header === null) { header = rec.map((h) => h.trim()); continue; }
    if (rec.length === 1 && rec[0] === '') continue;
    const row = {};
    for (let k = 0; k < header.length; k++) row[header[k]] = rec[k] ?? '';
    onRow(row);
  }
  if (pending !== null) throw new Error(`${file}: unterminated quoted field at end of file`);
  return header;
}

// ---------------------------------------------------------------- helpers

function round3(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  if (v === 0) return 0;
  const mag = Math.floor(Math.log10(Math.abs(v)));
  const decimals = 2 - mag; // 3 significant digits
  if (decimals >= 0) {
    const r = Number(v.toFixed(Math.min(decimals, 2)));
    return Object.is(r, -0) ? 0 : r;
  }
  const p = 10 ** -decimals;
  return Math.round(v / p) * p;
}

const FRACTIONS = [
  [0.125, '1/8'], [0.25, '1/4'], [0.33, '1/3'], [0.333, '1/3'], [0.5, '1/2'],
  [0.66, '2/3'], [0.667, '2/3'], [0.67, '2/3'], [0.75, '3/4'],
];
function formatAmount(raw) {
  const a = Number(raw);
  if (!raw || !Number.isFinite(a) || a <= 0) return '1';
  const whole = Math.floor(a);
  const frac = Math.round((a - whole) * 1000) / 1000;
  if (frac === 0) return String(whole);
  const hit = FRACTIONS.find(([f]) => Math.abs(f - frac) < 0.0005);
  if (hit) return whole ? `${whole} ${hit[1]}` : hit[1];
  return String(Number(a.toFixed(3)));
}

function titleWord(w) {
  // w is all caps; keeps apostrophe segments lower case ("DENNY'S" -> "Denny's").
  let m;
  if ((m = /^MC([A-Z]{2,}.*)$/.exec(w))) return 'Mc' + titleWord(m[1]); // MCDONALD'S -> McDonald's
  if ((m = /^([A-Z])'([A-Z]{2,})$/.exec(w))) return `${m[1]}'${m[2][0]}${m[2].slice(1).toLowerCase()}`;
  return w[0] + w.slice(1).toLowerCase();
}

function fixCaps(name) {
  return name.replace(/[A-Za-z0-9'’]+/g, (tok) => {
    if (/^Mc[A-Z]{2}[^a-z]*$/.test(tok)) return 'Mc' + titleWord(tok.slice(2)); // McDONALD'S -> McDonald's
    if (/[a-z]/.test(tok)) return tok; // already mixed case: leave as-is
    if (/^\d+(ST|ND|RD|TH)$/.test(tok)) return tok.toLowerCase(); // 5TH -> 5th
    const letters = tok.replace(/[^A-Z]/g, '').length;
    if (letters < 3) return tok; // short abbreviations (NS, LS, B12, V8, M&M)
    if (KEEP_UPPER.has(tok)) return tok;
    if (!/^[A-Z]/.test(tok)) return tok; // starts with a digit, e.g. "4X6"
    return titleWord(tok);
  });
}

const BOILERPLATE = /\s*\([^()]*\b(USDA|Food Distribution Program|Commodity|School Lunch Program|NSLP)\b[^()]*\)/gi;

// "( 3 oz )" -> "(3 oz)", collapse runs of spaces.
function tidy(s) {
  return s.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s{2,}/g, ' ').trim();
}

function cleanName(raw) {
  let s = raw.replace(BOILERPLATE, '');
  s = fixCaps(s);
  s = s.replace(/,(?=[A-Za-z])/g, ', '); // "SCHIFF,TIGER'S" -> "Schiff, Tiger's"
  s = s.replace(/\s+,/g, ',').replace(/,\s*$/, '');
  return tidy(s);
}

// Source portions the app already offers generically.
const GENERIC_PORTION = /^(1 oz|1 ounce|100 g|100 grams|1 g|1 gram)$/i;

function portionLabel(p, unitNames) {
  const desc = (p.portion_description || '').trim();
  const mod = (p.modifier || '').trim();
  const unitId = (p.measure_unit_id || '').trim();
  const unit = unitId && unitId !== '9999' ? (unitNames.get(unitId) || '') : '';
  let label;
  if (desc) {
    label = /^\d/.test(desc) || !p.amount ? desc : `${formatAmount(p.amount)} ${desc}`;
  } else {
    // SR Legacy style: amount + (unit) + modifier. FNDDS puts numeric codes in
    // `modifier`, so ignore purely numeric modifiers.
    const text = [unit === 'undetermined' ? '' : unit, /^\d+$/.test(mod) ? '' : mod]
      .filter(Boolean).join(' ');
    if (!text) return null;
    label = /^\d/.test(text) ? text : `${formatAmount(p.amount)} ${text}`;
  }
  label = tidy(label);
  if (!/^\d/.test(label) && !/^[½¼¾⅓⅔⅛]/.test(label)) label = `1 ${label}`;
  return label;
}

// ---------------------------------------------------------------- dataset

function resolveDir(dir) {
  const abs = path.resolve(dir);
  if (fs.existsSync(path.join(abs, 'food.csv'))) return abs;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory() && fs.existsSync(path.join(abs, e.name, 'food.csv'))) return path.join(abs, e.name);
  }
  throw new Error(`No food.csv in ${abs} or its subfolders`);
}

function detectKind(dir) {
  if (fs.existsSync(path.join(dir, 'survey_fndds_food.csv'))) return 'fndds';
  if (fs.existsSync(path.join(dir, 'sr_legacy_food.csv'))) return 'sr';
  throw new Error(`${dir}: cannot tell whether this is SR Legacy or FNDDS`);
}

async function loadDataset(dir, kind) {
  const file = (f) => path.join(dir, f);
  const has = (f) => fs.existsSync(file(f));
  const log = (...a) => console.error(`[${kind}]`, ...a);

  // nutrient.csv: verify the expected name/unit for each nutrient_nbr we use.
  const byNbr = new Map(); // nbr -> { id, name, unit }
  const idToNbr = new Map();
  await readCsv(file('nutrient.csv'), (r) => {
    const nbr = String(r.nutrient_nbr).replace(/\.0+$/, '').trim();
    if (!nbr) return;
    byNbr.set(nbr, { id: r.id, name: r.name, unit: (r.unit_name || '').toUpperCase() });
    idToNbr.set(String(r.id).trim(), nbr);
  });
  const wanted = new Map(); // nbr -> output index (-1/-2 for kcal fallbacks)
  NUTRIENTS.forEach((n, i) => {
    const info = byNbr.get(n.nbr);
    if (!info) { log(`WARNING nutrient_nbr ${n.nbr} (${n.key}) not in nutrient.csv`); return; }
    if (info.unit !== n.unit) throw new Error(`[${kind}] nutrient ${n.nbr} unit ${info.unit}, expected ${n.unit}`);
    log(`  ${n.key.padEnd(9)} <- nbr ${n.nbr} id ${info.id} "${info.name}" ${info.unit}`);
    wanted.set(n.nbr, i);
  });
  KCAL_FALLBACK.forEach((n, i) => {
    const info = byNbr.get(n.nbr);
    if (info && info.unit === n.unit) wanted.set(n.nbr, -1 - i);
  });

  // Categories.
  const cats = new Map();
  if (kind === 'fndds' && has('wweia_food_category.csv')) {
    await readCsv(file('wweia_food_category.csv'), (r) => cats.set(String(r.wweia_food_category).trim(), r.wweia_food_category_description.trim()));
  } else if (has('food_category.csv')) {
    await readCsv(file('food_category.csv'), (r) => cats.set(String(r.id).trim(), r.description.trim()));
  }
  // For FNDDS the WWEIA number also lives in survey_fndds_food.csv.
  const wweiaOf = new Map();
  const sortKey = new Map();
  if (kind === 'fndds') {
    await readCsv(file('survey_fndds_food.csv'), (r) => {
      wweiaOf.set(r.fdc_id, String(r.wweia_category_number).trim());
      sortKey.set(r.fdc_id, Number(r.food_code));
    });
  } else if (has('sr_legacy_food.csv')) {
    await readCsv(file('sr_legacy_food.csv'), (r) => sortKey.set(r.fdc_id, Number(r.NDB_number)));
  }

  // food.csv
  const foods = new Map();
  let order = 0;
  await readCsv(file('food.csv'), (r) => {
    const catId = wweiaOf.get(r.fdc_id) || String(r.food_category_id || '').trim();
    foods.set(r.fdc_id, {
      id: Number(r.fdc_id),
      rawName: r.description,
      name: cleanName(r.description),
      cat: cats.get(catId) || undefined,
      n: new Array(NUTRIENTS.length).fill(null),
      kcalAlt: [null, null],
      portions: [],
      order: order++,
      sort: sortKey.get(r.fdc_id),
    });
  });
  log(`${foods.size} foods in food.csv`);

  // food_nutrient.csv. Most releases store nutrient.id in `nutrient_id`, but
  // some (e.g. FNDDS 2024-10-31) store the nutrient_nbr there. Decide by
  // sampling which interpretation matches the nutrient table.
  const fnFile = file('food_nutrient.csv');
  const sample = new Set();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(fnFile, { encoding: 'utf8' }), crlfDelay: Infinity });
    let header = null;
    for await (const line of rl) {
      const rec = parseRecord(line.replace(/^﻿/, ''));
      if (!rec) continue;
      if (!header) { header = rec; continue; }
      sample.add(rec[header.indexOf('nutrient_id')]);
      if (sample.size > 60) break;
    }
    rl.close();
  }
  let asId = 0, asNbr = 0;
  for (const v of sample) { if (idToNbr.has(v)) asId++; if (byNbr.has(v)) asNbr++; }
  const nbrMode = asNbr > asId;
  log(`food_nutrient.nutrient_id holds ${nbrMode ? 'nutrient_nbr' : 'nutrient.id'} values (id matches ${asId}, nbr matches ${asNbr})`);

  let kept = 0;
  await readCsv(fnFile, (r) => {
    const f = foods.get(r.fdc_id);
    if (!f) return;
    const raw = String(r.nutrient_id).trim();
    const nbr = nbrMode ? raw.replace(/\.0+$/, '') : idToNbr.get(raw);
    const idx = wanted.get(nbr);
    if (idx === undefined) return;
    if (r.amount === '' || r.amount == null) return;
    const v = Number(r.amount);
    if (!Number.isFinite(v)) return;
    if (idx >= 0) f.n[idx] = v; else f.kcalAlt[-1 - idx] = v;
    kept++;
  });
  log(`${kept} nutrient values used`);

  // Portions.
  const unitNames = new Map();
  if (has('measure_unit.csv')) await readCsv(file('measure_unit.csv'), (r) => unitNames.set(String(r.id).trim(), r.name.trim()));
  if (has('food_portion.csv')) {
    await readCsv(file('food_portion.csv'), (r) => {
      const f = foods.get(r.fdc_id);
      if (f) f.portions.push(r);
    });
  }
  let droppedGeneric = 0;
  for (const f of foods.values()) {
    const rows = f.portions
      .map((r, i) => ({ r, i, seq: r.seq_num === '' || r.seq_num == null ? Infinity : Number(r.seq_num) }))
      .sort((a, b) => (a.seq - b.seq) || (a.i - b.i));
    const out = [];
    const seen = new Set();
    for (const { r } of rows) {
      const g = Number(r.gram_weight);
      if (!Number.isFinite(g) || g <= 0) continue;
      if (/quantity not specified/i.test(r.portion_description || '') || /quantity not specified/i.test(r.modifier || '')) continue;
      const label = portionLabel(r, unitNames);
      if (!label) continue;
      if (GENERIC_PORTION.test(label)) { droppedGeneric++; continue; }
      const k = label.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([label, Math.round(g * 10) / 10]);
      if (out.length >= MAX_PORTIONS) break;
    }
    f.portions = out;
  }
  log(`dropped ${droppedGeneric} generic 1 oz / 100 g source portions`);

  // Energy fallback, rounding, filtering.
  const result = [];
  let noData = 0, kcalFromAtwater = 0, kcalComputed = 0;
  for (const f of foods.values()) {
    const [, p, c, fat] = f.n;
    if (f.n[0] === null) {
      const alt = f.kcalAlt.find((v) => v !== null);
      if (alt !== undefined) { f.n[0] = alt; kcalFromAtwater++; }
      else if (p !== null || c !== null || fat !== null) {
        f.n[0] = 4 * (p || 0) + 4 * (c || 0) + 9 * (fat || 0);
        kcalComputed++;
      }
    }
    if (f.n[0] === null && p === null && c === null && fat === null) { noData++; continue; }
    const nut = f.n.map(round3);
    while (nut.length && nut[nut.length - 1] === null) nut.pop();
    result.push({ ...f, nut });
  }
  log(`kept ${result.length}, dropped ${noData} without nutrient data; kcal from Atwater ${kcalFromAtwater}, computed ${kcalComputed}`);

  result.sort((a, b) => {
    const sa = Number.isFinite(a.sort) ? a.sort : Infinity;
    const sb = Number.isFinite(b.sort) ? b.sort : Infinity;
    return (sa - sb) || (a.order - b.order);
  });
  return result;
}

// ---------------------------------------------------------------- main

async function main() {
  const args = process.argv.slice(2);
  const here = path.dirname(fileURLToPath(import.meta.url));
  let out = path.resolve(here, '..', 'public', 'foods.json');
  let fnddsDate = null;
  const dirs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = path.resolve(args[++i]);
    else if (args[i] === '--fndds-date') fnddsDate = args[++i];
    else dirs.push(args[i]);
  }
  if (!dirs.length) {
    console.error('Usage: node scripts/build-foods.mjs <sr_legacy_dir> <survey_food_dir> [--out file] [--fndds-date YYYY-MM-DD]');
    process.exit(1);
  }

  const sets = { sr: null, fndds: null };
  for (const d of dirs) {
    const dir = resolveDir(d);
    const kind = detectKind(dir);
    if (sets[kind]) throw new Error(`Two ${kind} directories given`);
    if (kind === 'fndds' && !fnddsDate) {
      const m = /(\d{4}-\d{2}-\d{2})/.exec(path.basename(dir)) || /(\d{4}-\d{2}-\d{2})/.exec(dir);
      fnddsDate = m ? m[1] : null;
    }
    sets[kind] = await loadDataset(dir, kind);
  }

  const fndds = sets.fndds || [];
  const sr = sets.sr || [];
  const fnddsNames = new Set(fndds.map((f) => f.name.toLowerCase()));
  const srKept = sr.filter((f) => !fnddsNames.has(f.name.toLowerCase()));
  const dropped = sr.filter((f) => fnddsNames.has(f.name.toLowerCase())).map((f) => f.name);
  console.error(`[merge] ${dropped.length} SR Legacy foods dropped as exact-name duplicates of FNDDS foods, e.g. ${dropped.slice(0, 8).join(' | ')}`);

  const foods = [...fndds, ...srKept].map((f) => {
    const row = [f.id, f.name, f.nut, f.portions];
    if (f.cat) row.push(f.cat);
    return row;
  });

  const parts = [];
  if (sets.sr) parts.push('SR Legacy 2018');
  if (sets.fndds) parts.push(`FNDDS ${fnddsDate || 'unknown date'}`);
  const doc = {
    v: 1,
    src: `USDA FoodData Central (${parts.join(', ')}), public domain`,
    keys: NUTRIENTS.map((n) => n.key),
    foods,
  };
  const json = JSON.stringify(doc);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, json);
  console.error(`[done] ${foods.length} foods (${fndds.length} FNDDS + ${srKept.length} SR Legacy), ${Buffer.byteLength(json)} bytes -> ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
