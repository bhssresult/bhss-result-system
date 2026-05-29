/**
 * BHSS Teachers → Google Group Sync
 * =====================================
 * Watches cell ranges in the "HS_Teachers" and "HSS_Teachers" sheets. On any
 * edit to a mapped range, the linked Google Group(s) membership is synced to
 * match the emails in that range.
 *
 * This is a STANDALONE script, separate from the Result System Web App
 * backend (Code.gs). It uses the Admin SDK (AdminDirectory) and must be run
 * by a Google Workspace admin. It has no doGet/doPost and no web frontend.
 *
 * SETUP INSTRUCTIONS (one-time):
 *  1. Open the Google Sheet that contains the "HS_Teachers"/"HSS_Teachers" tabs.
 *  2. Extensions → Apps Script → paste this whole file → Save.
 *  3. Services (+) → add "Admin SDK API" (identifier: AdminDirectory).
 *  4. Run manualSync() once to fill the groups from the current sheets.
 *  5. Run installTrigger() once to enable automatic syncing on edits.
 *     Grant the requested permissions when prompted (sign in as an admin).
 *
 * To remove the automation later, run uninstallTriggers().
 */

// —— Configuration ——————————————————————————————————————————————————————————

const MEMBER_ROLE = 'MEMBER';

// Emails never removed from ANY group automatically (admin/script accounts).
const PROTECTED_EMAILS = [
  'bhssresult@baptisthss.in',
];

/**
 * One config per teacher sheet. Each `mappings` entry maps a cell range to a
 * Google Group email. The first entry of each is the master group (all teachers
 * of that school); the remaining entries link one subject group per row.
 *
 * Ranges are fixed (not open-ended). HS data is rows 2–17; HSS data is rows
 * 3–43 (HSS row 2 is intentionally excluded). If teachers are added below the
 * last row, widen that sheet's master range and add per-row entries here.
 */
const SHEET_CONFIGS = [
  {
    sheet: 'HS_Teachers',
    mappings: [
      { range: 'F2:G17', group: 'bhss-hs-teachers@baptisthss.in' }, // master — all HS teachers
      { range: 'F2:G2',   group: 'english1hs@baptisthss.in'        },
      { range: 'F3:G3',   group: 'english2hs@baptisthss.in'        },
      { range: 'F4:G4', group: 'hindi1hs@baptisthss.in'          },
      { range: 'F5:G5', group: 'hindi2hs@baptisthss.in'          },
      { range: 'F6:G6',   group: 'maths1hs@baptisthss.in'          },
      { range: 'F7:G7',   group: 'maths2hs@baptisthss.in'          },
      { range: 'F8:G8', group: 'maths3hs@baptisthss.in'          },
      { range: 'F9:G9',   group: 'mizo1hs@baptisthss.in'           },
      { range: 'F10:G10', group: 'mizo2hs@baptisthss.in'           },
      { range: 'F11:G11',   group: 'science1hs@baptisthss.in'        },
      { range: 'F12:G12',   group: 'science2hs@baptisthss.in'        },
      { range: 'F13:G13', group: 'science3hs@baptisthss.in'        },
      { range: 'F14:G14', group: 'scripturehs@baptisthss.in'       },
      { range: 'F15:G15',   group: 'socialscience1hs@baptisthss.in'  },
      { range: 'F16:G16', group: 'socialscience2hs@baptisthss.in'  },
      { range: 'F17:G17', group: 'workeducation1hs@baptisthss.in'  },
    ],
  },
  {
    sheet: 'HSS_Teachers',
    mappings: [
      { range: 'F3:G43', group: 'bhss-hss-teachers@baptisthss.in' }, // master — all HSS teachers
      { range: 'F3:G3',    group: 'english1@baptisthss.in'     },
      { range: 'F4:G4',    group: 'english2@baptisthss.in'     },
      { range: 'F5:G5',    group: 'english3@baptisthss.in'     },
      { range: 'F6:G6',    group: 'english4@baptisthss.in'     },
      { range: 'F7:G7',    group: 'english5@baptisthss.in'     },
      { range: 'F8:G8',    group: 'mizo1@baptisthss.in'        },
      { range: 'F9:G9',    group: 'mizo2@baptisthss.in'        },
      { range: 'F10:G10',  group: 'mizo3@baptisthss.in'        },
      { range: 'F11:G11',  group: 'mizo4@baptisthss.in'        },
      { range: 'F12:G12',  group: 'history1@baptisthss.in'     },
      { range: 'F13:G13',  group: 'history2@baptisthss.in'     },
      { range: 'F14:G14',  group: 'geography1@baptisthss.in'   },
      { range: 'F15:G15',  group: 'geography2@baptisthss.in'   },
      { range: 'F16:G16',  group: 'education1@baptisthss.in'   },
      { range: 'F17:G17',  group: 'education2@baptisthss.in'   },
      { range: 'F18:G18',  group: 'polscience1@baptisthss.in'  },
      { range: 'F19:G19',  group: 'polscience2@baptisthss.in'  },
      { range: 'F20:G20',  group: 'economics1@baptisthss.in'   },
      { range: 'F21:G21',  group: 'economics2@baptisthss.in'   },
      { range: 'F22:G22',  group: 'sociology1@baptisthss.in'   },
      { range: 'F23:G23',  group: 'sociology2@baptisthss.in'   },
      { range: 'F24:G24',  group: 'commerce1@baptisthss.in'    },
      { range: 'F25:G25',  group: 'commerce2@baptisthss.in'    },
      { range: 'F26:G26',  group: 'commerce3@baptisthss.in'    },
      { range: 'F27:G27',  group: 'commerce4@baptisthss.in'    },
      { range: 'F28:G28',  group: 'commerce5@baptisthss.in'    },
      { range: 'F29:G29',  group: 'physics1@baptisthss.in'     },
      { range: 'F30:G30',  group: 'physics2@baptisthss.in'     },
      { range: 'F31:G31',  group: 'physics3@baptisthss.in'     },
      { range: 'F32:G32',  group: 'chemistry1@baptisthss.in'   },
      { range: 'F33:G33',  group: 'chemistry2@baptisthss.in'   },
      { range: 'F34:G34',  group: 'chemistry3@baptisthss.in'   },
      { range: 'F35:G35',  group: 'biology1@baptisthss.in'     },
      { range: 'F36:G36',  group: 'biology2@baptisthss.in'     },
      { range: 'F37:G37',  group: 'biology3@baptisthss.in'     },
      { range: 'F38:G38',  group: 'biology4@baptisthss.in'     },
      { range: 'F39:G39',  group: 'maths1@baptisthss.in'       },
      { range: 'F40:G40',  group: 'maths2@baptisthss.in'       },
      { range: 'F41:G41',  group: 'maths3@baptisthss.in'       },
      { range: 'F42:G42',  group: 'compscience1@baptisthss.in' },
      { range: 'F43:G43',  group: 'compscience2@baptisthss.in' },
    ],
  },
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
    const config = SHEET_CONFIGS.filter(function (c) { return c.sheet === sheet.getName(); })[0];
    if (!config) return;

    // Find all of this sheet's mappings whose range overlaps the edited cell(s).
    const affectedMappings = config.mappings.filter(function (mapping) {
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
 * Run from the Apps Script editor to sync ALL groups (both sheets) immediately,
 * without needing to edit any cell.
 */
function manualSync() {
  const ss = SpreadsheetApp.getActive();
  let totalAdded = 0, totalRemoved = 0, totalGroups = 0;

  SHEET_CONFIGS.forEach(function (config) {
    const sheet = ss.getSheetByName(config.sheet);
    if (!sheet) {
      Logger.log('Sheet "' + config.sheet + '" not found — skipping.');
      return;
    }
    config.mappings.forEach(function (mapping) {
      const r = syncGroupMembers(sheet, mapping.range, mapping.group);
      totalAdded   += r.added;
      totalRemoved += r.removed;
      totalGroups  += 1;
    });
  });

  ss.toast(
    'Full sync complete: +' + totalAdded + ' added, −' + totalRemoved +
    ' removed across ' + totalGroups + ' groups.',
    '✓ All Groups Synced', 8
  );
}

// —— Diagnostic ————————————————————————————————————————————————————————————

function diagnose() {
  Logger.log('Script running as: ' + Session.getEffectiveUser().getEmail());
  Logger.log('Active user: ' + Session.getActiveUser().getEmail());
  try {
    const result = AdminDirectory.Members.list(SHEET_CONFIGS[0].mappings[0].group, { maxResults: 1 });
    Logger.log('SUCCESS: ' + JSON.stringify(result));
  } catch (e) {
    Logger.log('FAILED: ' + e.message);
  }
}
