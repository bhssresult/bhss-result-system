/**
 * BHSS HS Teachers → Google Group Sync
 * =====================================
 * Watches the F2:G range (open-ended, to the last row) of the "HS_Teachers"
 * sheet. On any edit there, the destination Google Group's membership is
 * synced to match the emails in that range.
 *
 * This is a STANDALONE script, separate from the Result System Web App
 * backend (Code.gs). It uses the Admin SDK (AdminDirectory) and must be run
 * by a Google Workspace admin. It has no doGet/doPost and no web frontend.
 *
 * SETUP INSTRUCTIONS (one-time):
 *  1. Open the Google Sheet that contains the "HS_Teachers" tab.
 *  2. Extensions → Apps Script → paste this whole file → Save.
 *  3. Services (+) → add "Admin SDK API" (identifier: AdminDirectory).
 *  4. Run manualSync() once to fill the group from the current sheet.
 *  5. Run installTrigger() once to enable automatic syncing on edits.
 *     Grant the requested permissions when prompted (sign in as an admin).
 *
 * To remove the automation later, run uninstallTriggers().
 */

// —— Configuration ——————————————————————————————————————————————————————————

const SHEET_NAME  = 'HS_Teachers';
const MEMBER_ROLE = 'MEMBER';

// Destination group: all emails in HS_Teachers F2:G are mirrored here.
const GROUP_EMAIL = 'bhss-hs-teachers@baptisthss.in';

// Emails never removed from the group automatically (admin/script accounts).
const PROTECTED_EMAILS = [
  'bhssresult@baptisthss.in',
];

// Source columns: F and G (1-based columns 6 and 7), from row 2 down.
const SRC_FIRST_ROW = 2;
const SRC_FIRST_COL = 6; // F
const SRC_NUM_COLS  = 2; // F:G

// —— Trigger installer / uninstaller ——————————————————————————————————————

function installTrigger() {
  uninstallTriggers();

  ScriptApp.newTrigger('onRangeEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  SpreadsheetApp.getActive().toast(
    'Trigger installed. Edits to HS_Teachers F2:G will now sync the group.',
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

    // Only react when the edit touches the F:G columns at row >= 2.
    if (!editTouchesSource(e.range)) return;

    const { added, removed } = syncGroupMembers(sheet, GROUP_EMAIL);

    SpreadsheetApp.getActive().toast(
      '+' + added + ' added, −' + removed + ' removed.',
      '✓ Group Synced', 6
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

function syncGroupMembers(sheet, groupEmail) {
  const sheetEmails  = getSheetEmails(sheet);
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

// —— Helper: the open-ended F2:G source range ————————————————————————————————

// Returns the F:G range from row 2 to the last data row, or null if empty.
function getSourceRange(sheet) {
  const last = sheet.getLastRow();
  if (last < SRC_FIRST_ROW) return null;
  return sheet.getRange(SRC_FIRST_ROW, SRC_FIRST_COL, last - SRC_FIRST_ROW + 1, SRC_NUM_COLS);
}

// True if the edited range overlaps the F:G columns at row >= 2 (independent
// of the current last row, so clearing the bottom cell still counts).
function editTouchesSource(edited) {
  const lastCol = SRC_FIRST_COL + SRC_NUM_COLS - 1; // G
  return (
    edited.getLastRow()    >= SRC_FIRST_ROW &&
    edited.getColumn()     <= lastCol &&
    edited.getLastColumn() >= SRC_FIRST_COL
  );
}

// —— Helper: read emails from the source range ————————————————————————————————

function getSheetEmails(sheet) {
  const emails = new Set();
  const range = getSourceRange(sheet);
  if (!range) return emails;

  range.getValues().forEach(function (row) {
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

// —— Manual full sync ——————————————————————————————————————————————————————

/**
 * Run from the Apps Script editor to sync the group immediately,
 * without needing to edit any cell.
 */
function manualSync() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" not found.');

  const { added, removed } = syncGroupMembers(sheet, GROUP_EMAIL);

  SpreadsheetApp.getActive().toast(
    'Full sync complete: +' + added + ' added, −' + removed + ' removed.',
    '✓ Group Synced', 8
  );
}

// —— Diagnostic ————————————————————————————————————————————————————————————

function diagnose() {
  Logger.log('Script running as: ' + Session.getEffectiveUser().getEmail());
  Logger.log('Active user: ' + Session.getActiveUser().getEmail());
  try {
    const result = AdminDirectory.Members.list(GROUP_EMAIL, { maxResults: 1 });
    Logger.log('SUCCESS: ' + JSON.stringify(result));
  } catch (e) {
    Logger.log('FAILED: ' + e.message);
  }
}
