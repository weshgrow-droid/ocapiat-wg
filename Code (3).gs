/**
 * WESH GROW — API de synchronisation des dossiers "arrêtés/refusés"
 * ------------------------------------------------------------------
 * Ce script sert de backend au tableau de bord OCAPIAT (index.html).
 * Il lit/écrit les marquages "dossier arrêté/refusé" dans un onglet
 * du Google Sheet auquel ce script est attaché, et restreint l'accès
 * à une liste fermée d'adresses e-mail.
 *
 * INSTALLATION — voir README.md à la racine du repo pour le détail.
 * Résumé :
 *   1. Crée un Google Sheet (ou utilise celui du repo).
 *   2. Extensions > Apps Script, colle ce fichier.
 *   3. Renseigne ALLOWED_EMAILS ci-dessous.
 *   4. Déployer > Nouveau déploiement > Application Web
 *        - Exécuter en tant que : Moi
 *        - Qui a accès : Tous les utilisateurs de [ton domaine Google Workspace]
 *   5. Copie l'URL du déploiement dans config.js du site (API_URL).
 */

// ─── CONFIGURATION ────────────────────────────────────────────────
// Liste fermée des adresses autorisées à lire ET modifier les données.
// Remplace par les 3 adresses réelles des collaborateurs habilités.
const ALLOWED_EMAILS = [
  'exemple1@wesh-grow.com',
  'exemple2@wesh-grow.com',
  'exemple3@wesh-grow.com',
];

const SHEET_NAME = 'Overrides';
const HEADERS = ['Code dossier', 'Arrete', 'Raison', 'DateMarquage', 'ModifiePar'];

// ─── POINT D'ENTREE GET (lecture) ─────────────────────────────────
function doGet(e) {
  const auth = checkAuth_();
  if (!auth.ok) return jsonResponse_({ error: auth.error }, 403);

  const sheet = getSheet_();
  const data = readAll_(sheet);
  return jsonResponse_({ overrides: data, user: auth.email });
}

// ─── POINT D'ENTREE POST (écriture) ───────────────────────────────
// Corps attendu (JSON) : { code: "24.C.40906.1", stopped: true, reason: "..." }
// Pour annuler un marquage : { code: "...", stopped: false }
function doPost(e) {
  const auth = checkAuth_();
  if (!auth.ok) return jsonResponse_({ error: auth.error }, 403);

  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ error: 'JSON invalide' }, 400);
  }
  if (!body.code) return jsonResponse_({ error: 'Champ "code" manquant' }, 400);

  const sheet = getSheet_();
  upsertRow_(sheet, body, auth.email);

  const data = readAll_(sheet);
  return jsonResponse_({ overrides: data, user: auth.email });
}

// ─── AUTHENTIFICATION ──────────────────────────────────────────────
// Repose sur le compte Google de la personne qui appelle l'API.
// Le déploiement doit être fait avec "Qui a accès" = utilisateurs
// de ton Workspace pour que Session.getActiveUser() soit fiable.
function checkAuth_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) {
    return { ok: false, error: 'Non authentifié — connecte-toi avec ton compte Google Workspace.' };
  }
  if (ALLOWED_EMAILS.indexOf(email.toLowerCase()) === -1 &&
      ALLOWED_EMAILS.indexOf(email) === -1) {
    return { ok: false, error: 'Accès refusé pour ' + email + ' — adresse non autorisée.' };
  }
  return { ok: true, email: email };
}

// ─── HELPERS SHEET ─────────────────────────────────────────────────
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readAll_(sheet) {
  const values = sheet.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < values.length; i++) {
    const [code, arrete, raison, date, modifiePar] = values[i];
    if (!code) continue;
    if (arrete === true || arrete === 'TRUE' || arrete === 'VRAI') {
      out[code] = { stopped: true, reason: raison || '', date: fmtDate_(date), modifiedBy: modifiePar || '' };
    }
  }
  return out;
}

function upsertRow_(sheet, body, email) {
  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === body.code) { rowIndex = i + 1; break; }
  }
  const today = new Date();
  const row = [
    body.code,
    !!body.stopped,
    body.stopped ? (body.reason || '') : '',
    body.stopped ? today : '',
    body.stopped ? email : '',
  ];
  if (rowIndex === -1) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([row]);
  }
}

function fmtDate_(d) {
  if (!d) return null;
  try { return Utilities.formatDate(new Date(d), 'Europe/Paris', 'yyyy-MM-dd'); }
  catch (e) { return null; }
}

// ─── HELPER REPONSE JSON ────────────────────────────────────────────
function jsonResponse_(obj, code) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  // Apps Script Web Apps ne permettent pas de définir un vrai code HTTP
  // pour ContentService ; l'erreur est donc portée dans le champ "error".
  return output;
}
