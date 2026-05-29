/**
 * BHSS HS Teachers → Google Group Sync
 * =====================================
 * Watches cell ranges in the "HS_Teachers" sheet. On any edit to a mapped
 * range, the linked Google Group(s) membership is synced to match the emails
 * in that range.
 *
 * This is a STANDALONE script, separate from the Result System Web App
 * backend (Code.gs). It uses the Admin SDK (AdminDirectory) and must be run
 * by a Google Workspace admin. It has no doGet/doPost and no web frontend.
 *
 * SETUP INSTRUCTIONS (one-time):
 *  1. Open the Google Sheet that contains the "HS_Teachers" tab.
 *  2. Extensions → Apps Script → paste this whole file → Save.
 *  3. Services (+) → add "Admin SDK API" (identifier: AdminDirectory).
 *  4. Run manualSync() once to fill the groups from the current sheet.
 *  5. Run installTrigger() once to enable automatic syncing on edits.
 *     Grant the requested permissions when prompted (sign in as an admin).
 *
 * To remove the automation later, run uninstallTriggers().
 */

// —— Configuration ——————————————————————————————————————————————————————————

const SHEET_NAME  = 'HS_Teachers';
const MEMBER_ROLE = 'MEMBER';

// Emails never removed from ANY group automatically (admin/script accounts).
const PROTECTED_EMAILS = [
  'bhssresult@baptisthss.in',
];

/**
 * Each entry maps a cell range to a Google Group email.
 * The first entry (F2:G17) is the master group — all teachers.
 * Rows 2–17 are also each linked to their own subject group.
 *
 * Ranges are fixed (not open-ended). If more teacher rows are added below
 * row 17 in the future, widen the master range and add per-row entries here.
 */
const GROUP_MAPPINGS = [
  { range: 'F2:G17', group: 'bhss-hs-teachers@baptisthss.in' }, // master — all teachers
  { range: 'F2:G2',   group: 'mizo1hs@baptisthss.in'           },
  { range: 'F3:G3',   group: 'science1hs@baptisthss.in'        },
  { range: 'F4:G4',   group: 'maths1hs@baptisthss.in'          },
  { range: 'F5:G5',   group: 'science2hs@baptisthss.in'        },
  { range: 'F6:G6',   group: 'english1hs@baptisthss.in'        },
  { range: 'F7:G7',   group: 'english2hs@baptisthss.in'        },
  { range: 'F8:G8',   group: 'maths2hs@baptisthss.in'          },
  { range: 'F9:G9',   group: 'socialscience1hs@baptisthss.in'  },
  { range: 'F10:G10', group: 'science3hs@baptisthss.in'        },
  { range: 'F11:G11', group: 'workeducation1hs@baptisthss.in'  },
  { range: 'F12:G12', group: 'hindi1hs@baptisthss.in'          },
  { range: 'F13:G13', group: 'mizo2hs@baptisthss.in'           },
  { range: 'F14:G14', group: 'maths3hs@baptisthss.in'          },
  { range: 'F15:G15', group: 'socialscience2hs@baptisthss.in'  },
  { range: 'F16:G16', group: 'hindi2hs@baptisthss.in'          },
  { range: 'F17:G17', group: 'scripturehs@baptisthss.in'       },
];

// —— Trigger installer / uninstaller ——————————————————————————————————————

function installTrigger() {
  uninstallTriggers();

  ScriptApp.newTrigger('onRangeEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  SpreadsheetApp.getActive().toast(
    'Trigger installed. Edits to mapped ranges will now sync their Google Groups.',
    '✓ Group Sync Active', 8
  );
  Logger.log('Trigger installed successfully.');
}

function uninstallTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('All triggers removed.');
}

// —— Main edit handler ————————————————————————————————————————————————————

function onRangeEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;

    // Find all mappings whose range overlaps the edited cell(s).
    const affectedMappings = GROUP_MAPPINGS.filter(function (mapping) {
      return rangesOverlap(e.range, sheet.getRange(mapping.range));
    });

    if (affectedMappings.length === 0) return;

    Logger.log('Edit affects ' + affectedMappings.length + ' group mapping(s).');

    let totalAdded = 0, totalRemoved = 0;

    affectedMappings.forEach(function (mapping) {
      const r = syncGroupMembers(sheet, mapping.range, mapping.group);
      totalAdded   += r.added;
      totalRemoved += r.removed;
    });

    SpreadsheetApp.getActive().toast(
      '+' + totalAdded + ' added, −' + totalRemoved + ' removed across ' +
      affectedMappings.length + ' group(s).',
      '✓ Groups Synced', 6
    );
  } catch (err) {
    Logger.log('onRangeEdit error: ' + err.message);
    SpreadsheetApp.getActive().toast(
      'Sync error: ' + err.message,
      '⚠️ Group Sync Failed', 12
    );
  }
}

// —— Core sync logic ——————————————————————————————————————————————————————

function syncGroupMembers(sheet, rangeName, groupEmail) {
  const sheetEmails  = getSheetEmails(sheet, rangeName);
  const groupMembers = getGroupMembers(groupEmail);

  Logger.log('[' + groupEmail + '] Sheet: ' + Array.from(sheetEmails).join(', '));
  Logger.log('[' + groupEmail + '] Group: ' + Array.from(groupMembers.keys()).join(', '));

  // Protect: config list + the group's own address + any MANAGERs/OWNERs.
  const protectedEmails = new Set(PROTECTED_EMAILS.map(function (e) { return e.toLowerCase(); }));
  protectedEmails.add(groupEmail.toLowerCase());
  groupMembers.forEach(function (role, email) {
    if (role === 'MANAGER' || role === 'OWNER') protectedEmails.add(email);
  });

  const toAdd = Array.from(sheetEmails).filter(function (e) { return !groupMembers.has(e); });
  const toRemove = Array.from(groupMembers.keys()).filter(function (e) {
    return !sheetEmails.has(e) && !protectedEmails.has(e);
  });

  toAdd.forEach(function (email) {
    try {
      AdminDirectory.Members.insert({ email: email, role: MEMBER_ROLE }, groupEmail);
      Logger.log('[' + groupEmail + '] Added: ' + email);
    } catch (err) {
      Logger.log('[' + groupEmail + '] Could not add ' + email + ': ' + err.message);
    }
  });

  toRemove.forEach(function (email) {
    try {
      AdminDirectory.Members.remove(groupEmail, email);
      Logger.log('[' + groupEmail + '] Removed: ' + email);
    } catch (err) {
      Logger.log('[' + groupEmail + '] Could not remove ' + email + ': ' + err.message);
    }
  });

  Logger.log('[' + groupEmail + '] Sync done: +' + toAdd.length + ' / −' + toRemove.length);
  return { added: toAdd.length, removed: toRemove.length };
}

// —— Helper: read emails from a sheet range ————————————————————————————————

function getSheetEmails(sheet, rangeName) {
  const values = sheet.getRange(rangeName).getValues();
  const emails = new Set();

  values.forEach(function (row) {
    row.forEach(function (cell) {
      const val = String(cell).trim().toLowerCase();
      if (val && val.indexOf('@') !== -1) emails.add(val);
    });
  });

  return emails;
}

// —— Helper: read current group members ————————————————————————————————————

function getGroupMembers(groupEmail) {
  const members = new Map();
  let pageToken;

  do {
    const response = AdminDirectory.Members.list(groupEmail, {
      maxResults: 200,
      pageToken: pageToken,
    });
    (response.members || []).forEach(function (m) {
      if (m.email) members.set(m.email.toLowerCase(), m.role);
    });
    pageToken = response.nextPageToken;
  } while (pageToken);

  return members;
}

// —— Helper: range overlap check ——————————————————————————————————————————

function rangesOverlap(r1, r2) {
  if (r1.getSheet().getSheetId() !== r2.getSheet().getSheetId()) return false;

  return (
    r1.getRow()        <= r2.getLastRow()    &&
    r1.getLastRow()    >= r2.getRow()        &&
    r1.getColumn()     <= r2.getLastColumn() &&
    r1.getLastColumn() >= r2.getColumn()
  );
}

// —— Manual full sync (all groups) ————————————————————————————————————————

/**
 * Run from the Apps Script editor to sync ALL groups immediately,
 * without needing to edit any cell.
 */
function manualSync() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" not found.');

  let totalAdded = 0, totalRemoved = 0;

  GROUP_MAPPINGS.forEach(function (mapping) {
    const r = syncGroupMembers(sheet, mapping.range, mapping.group);
    totalAdded   += r.added;
    totalRemoved += r.removed;
  });

  SpreadsheetApp.getActive().toast(
    'Full sync complete: +' + totalAdded + ' added, −' + totalRemoved +
    ' removed across ' + GROUP_MAPPINGS.length + ' groups.',
    '✓ All Groups Synced', 8
  );
}

// —— Diagnostic ————————————————————————————————————————————————————————————

function diagnose() {
  Logger.log('Script running as: ' + Session.getEffectiveUser().getEmail());
  Logger.log('Active user: ' + Session.getActiveUser().getEmail());
  try {
    const result = AdminDirectory.Members.list(GROUP_MAPPINGS[0].group, { maxResults: 1 });
    Logger.log('SUCCESS: ' + JSON.stringify(result));
  } catch (e) {
    Logger.log('FAILED: ' + e.message);
  }
}
