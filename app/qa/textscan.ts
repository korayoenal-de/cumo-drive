/**
 * Textscan (Testkatalog R29, R30; Koray 17.11.): liest alle Texte der App aus dem Quellcode und prüft die
 * Regeln für Texte. Kommentare zählen nicht, nur Zeichenketten, Vorlagen und Text in JSX.
 *
 * Fehler (Exit 1): Gedankenstriche, calimoto, Sie Form.
 * Hinweise: Wörter außerhalb des Glossars, Formate von Zeit und Strecke außerhalb von lib/format.ts.
 *
 * Aufruf im Ordner app: npx tsx qa/textscan.ts [--alle]   (--alle druckt auch jeden Hinweis einzeln)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../src');
const ALL = process.argv.includes('--alle');

type Hit = { file: string; line: number; text: string; rule: string; level: 'fehler' | 'hinweis' };
const hits: Hit[] = [];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === '__tests__' || n === 'node_modules') continue;
      out.push(...files(p));
    } else if (/\.(ts|tsx)$/.test(n) && !/\.d\.ts$/.test(n)) out.push(p);
  }
  return out;
}

/** Texte, die Menschen lesen: Argumente von t() und tr(), Text in JSX, Eigenschaften wie accessibilityLabel */
const UI_PROPS = new Set(['accessibilityLabel', 'accessibilityHint', 'placeholder', 'title', 'label', 'text', 'hint', 'subtitle', 'message', 'body']);

function isUiText(node: ts.Node): boolean {
  if (ts.isJsxText(node)) return true;
  let p = node.parent;
  // Bedingungen und Verkettungen nach oben durchreichen
  while (p && (ts.isConditionalExpression(p) || ts.isParenthesizedExpression(p) || ts.isBinaryExpression(p) || ts.isTemplateSpan(p) || ts.isTemplateExpression(p))) p = p.parent;
  if (!p) return false;
  if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && (p.expression.text === 't' || p.expression.text === 'tr')) return true;
  if (ts.isJsxExpression(p)) return true;
  if (ts.isJsxAttribute(p) && UI_PROPS.has(p.name.getText())) return true;
  if (ts.isPropertyAssignment(p) && UI_PROPS.has(p.name.getText())) return true;
  return false;
}

// Gedankenstrich: lange Striche oder ein Bindestrich mit Leerzeichen auf beiden Seiten mitten im Text
const DASH = /[–—]|\S - \S/;
// Sie Form: Höflichkeitsform groß geschrieben, nicht am Satzanfang (dort ist „Sie“ meist die Ausfahrt oder Tour)
const SIE = /[a-zäöüß,;]\s+(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/;
// Glossar (Konsistenzprüfung 15.11.): Fahrzeit statt Dauer, Touren statt Meine Touren, Organisator statt
// Veranstalter, Nachricht statt Anschreiben. „Länge“ darf bleiben (Koray 17.11., gewählte Länge der Rundtour).
const GLOSSAR: [RegExp, string][] = [
  [/\bDauer\b/, 'Fahrzeit statt Dauer'],
  [/\bMeine Touren\b/, 'Touren statt Meine Touren'],
  [/\bVeranstalter/, 'Organisator statt Veranstalter'],
  [/\b[Aa]nschreiben\b/, 'Nachricht statt Anschreiben'],
];
// Formate (R30): Zeit und Strecke kommen aus lib/format.ts; selbst gebaute Stunden und Minuten fallen auf
const FORMAT: [RegExp, string][] = [
  [/\d+\s*h\s+\d+/, 'Fahrzeit als „2 h 57“ statt „2:57 h“'],
  [/\bStd\.?\b|\bStunden?\b\s*\d/, 'Stunden ausgeschrieben statt Format aus format.ts'],
  [/\bMin\.(?!\w)/, 'Min. statt min'],
];

function check(file: string, sf: ts.SourceFile, node: ts.Node, raw: string) {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text || !/[A-Za-zÄÖÜäöüß]/.test(text)) return;
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const rel = path.relative(path.resolve(ROOT, '..'), file);
  const add = (rule: string, level: Hit['level']) => hits.push({ file: rel, line, text: text.slice(0, 120), rule, level });
  // Programmtexte (Pfade, Klassen, SQL, URLs) haben keine Leerzeichen zwischen Wörtern mit Strich
  if (DASH.test(text) && !/^https?:|^[\w./:-]+$|^calc\(/.test(text)) add('Gedankenstrich', 'fehler');
  if (/calimoto/i.test(text)) add('calimoto genannt', 'fehler');
  if (!isUiText(node)) return;
  if (SIE.test(text)) add('Sie Form statt Du Form', 'fehler');
  for (const [re, why] of GLOSSAR) if (re.test(text)) add(why, 'hinweis');
  if (!file.endsWith(path.join('lib', 'format.ts'))) for (const [re, why] of FORMAT) if (re.test(text)) add(why, 'hinweis');
}

for (const file of files(ROOT)) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node: ts.Node) => {
    // Imports, Typen und Schlüssel von Objekten sind keine Texte
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isLiteralTypeNode(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!(ts.isPropertyAssignment(node.parent) && node.parent.name === node) && !ts.isElementAccessExpression(node.parent)) check(file, sf, node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      // Platzhalter ohne Leerzeichen, damit aus `pass-${id}` kein Strich mit Leerzeichen wird
      check(file, sf, node, [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('X'));
    } else if (ts.isJsxText(node)) {
      check(file, sf, node, node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const fehler = hits.filter((h) => h.level === 'fehler');
const hinweise = hits.filter((h) => h.level === 'hinweis');
for (const h of fehler) console.log(`FEHLER  ${h.file}:${h.line}  [${h.rule}]  ${h.text}`);
if (ALL) for (const h of hinweise) console.log(`hinweis ${h.file}:${h.line}  [${h.rule}]  ${h.text}`);
else {
  const by = new Map<string, number>();
  for (const h of hinweise) by.set(h.rule, (by.get(h.rule) ?? 0) + 1);
  for (const [rule, n] of by) console.log(`hinweis ${n}x ${rule} (Einzelheiten mit --alle)`);
}
console.log(`\n${fehler.length} Fehler, ${hinweise.length} Hinweise`);
process.exit(fehler.length ? 1 : 0);
