/**
 * School Result System - Google Apps Script Backend
 *
 * Deploy this as a Web App:
 *   1. Open the Google Sheet that holds your data
 *   2. Extensions -> Apps Script
 *   3. Replace any default code with this file's contents
 *   4. Click Deploy -> New deployment -> Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 *   5. Copy the Web App URL and paste it into js/config.js (GAS_URL)
 *
 * Required Sheet tabs: Users, HS_Students, HSS_Students, HS_Marks, HSS_Marks, ExamConfig, Links, HS_Links
 */

// ============================================================================
// ROUTER
// ============================================================================

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    switch (action) {
      case 'lookupStudent': return sendJson(handleLookupStudent(e.parameter));
      case 'getMarks':      return sendJson(handleGetMarks(e.parameter));
      case 'getUsers':      return sendJson(handleGetUsers(e.parameter));
      case 'getExamConfig': return sendJson(handleGetExamConfig(e.parameter));
      case 'getFormLinks':  return sendJson(handleGetFormLinks(e.parameter));
      case 'getHsLinks':    return sendJson(handleGetHsLinks(e.parameter));
      case 'ping':          return sendJson({ success: true, message: 'pong' });
      default:              return sendJson({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return sendJson({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var action = body.action || '';
    switch (action) {
      case 'verifyUser':       return sendJson(handleVerifyUser(body));
      case 'saveMarks':        return sendJson(handleSaveMarks(body));
      case 'addUser':          return sendJson(handleAddUser(body));
      case 'updateUserRole':   return sendJson(handleUpdateUserRole(body));
      case 'deleteUser':       return sendJson(handleDeleteUser(body));
      case 'saveExamConfig':   return sendJson(handleSaveExamConfig(body));
      case 'saveFormLinks':    return sendJson(handleSaveFormLinks(body));
      default:                 return sendJson({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return sendJson({ success: false, error: String(err) });
  }
}

function sendJson(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// SHEET HELPERS
// ============================================================================

function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function getSheetObjects(name) {
  var sheet = getSheet(name);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) {
      row[headers[c]] = values[r][c];
    }
    out.push(row);
  }
  return out;
}

function findRowIndex(sheet, columnHeader, value) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 1) return -1;
  var col = data[0].indexOf(columnHeader);
  if (col === -1) return -1;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][col]) === String(value)) return r + 1;
  }
  return -1;
}

function findRowIndexByTwo(sheet, h1, v1, h2, v2) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 1) return -1;
  var c1 = data[0].indexOf(h1);
  var c2 = data[0].indexOf(h2);
  if (c1 === -1 || c2 === -1) return -1;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][c1]) === String(v1) && String(data[r][c2]) === String(v2)) return r + 1;
  }
  return -1;
}

function today() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT', 'yyyy-MM-dd');
}

// ============================================================================
// AUTH
// ============================================================================

/**
 * Verifies a Google OAuth ID token by calling Google's tokeninfo endpoint.
 * Returns { email, name } on success, or throws on failure.
 */
function verifyGoogleToken(token) {
  if (!token) throw new Error('Missing auth token');
  var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('Invalid token');
  }
  var info = JSON.parse(res.getContentText());
  if (!info.email || !info.email_verified) throw new Error('Email not verified by Google');
  return { email: String(info.email).toLowerCase(), name: info.name || info.email };
}

function getUserRole(email) {
  var users = getSheetObjects('Users');
  var emailLower = String(email).toLowerCase();
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].email).toLowerCase() === emailLower) {
      return String(users[i].role || '').toLowerCase();
    }
  }
  return null;
}

function requireRole(token, allowedRoles) {
  var info = verifyGoogleToken(token);
  var role = getUserRole(info.email);
  if (!role) throw new Error('User not registered');
  if (allowedRoles.indexOf(role) === -1) throw new Error('Insufficient permissions');
  return { email: info.email, name: info.name, role: role };
}

// ============================================================================
// PUBLIC: Student Lookup
// ============================================================================

function handleLookupStudent(params) {
  var rollNo = String(params.rollNo || '').trim();
  if (!rollNo) return { success: false, error: 'Roll number required' };

  // Search HS first, then HSS
  var schools = ['hs', 'hss'];
  for (var i = 0; i < schools.length; i++) {
    var school = schools[i];
    var studentSheet = school === 'hs' ? 'HS_Students' : 'HSS_Students';
    var marksSheet = school === 'hs' ? 'HS_Marks' : 'HSS_Marks';

    var students = getSheetObjects(studentSheet);
    for (var s = 0; s < students.length; s++) {
      if (String(students[s].roll_no) === rollNo) {
        var student = students[s];
        var marksList = getSheetObjects(marksSheet);
        var marks = null;
        for (var m = 0; m < marksList.length; m++) {
          if (String(marksList[m].roll_no) === rollNo) {
            marks = marksList[m];
            break;
          }
        }
        return {
          success: true,
          data: {
            school: school,
            student: student,
            marks: marks,
            examConfig: getExamConfigObject()
          }
        };
      }
    }
  }
  return { success: false, error: 'Student not found' };
}

// ============================================================================
// EXAM CONFIG
// ============================================================================

function getExamConfigObject() {
  // Use getDisplayValues() instead of getValues() so Google Sheets never
  // strips commas from entries like "100,100,100,100,100" by mistaking
  // them for thousands-separated numbers. Display values always return
  // the string the user sees in the cell.
  var sheet = getSheet('ExamConfig');
  var display = sheet.getDataRange().getDisplayValues();
  if (display.length < 2) return {};
  var headers = display[0];
  var keyCol = headers.indexOf('key');
  var valCol = headers.indexOf('value');
  if (keyCol === -1 || valCol === -1) return {};
  var obj = {};
  for (var r = 1; r < display.length; r++) {
    var key = String(display[r][keyCol]).trim();
    var val = String(display[r][valCol]).trim();
    if (key) obj[key] = val;
  }
  return obj;
}

function handleGetExamConfig(params) {
  requireRole(params.token, ['teacher', 'admin']);
  return { success: true, data: { config: getExamConfigObject() } };
}

function handleSaveExamConfig(body) {
  requireRole(body.token, ['admin']);
  var config = body.config || {};
  var sheet = getSheet('ExamConfig');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var keyCol = headers.indexOf('key');
  var valCol = headers.indexOf('value');
  var dateCol = headers.indexOf('updated_date');
  if (keyCol === -1 || valCol === -1) throw new Error('ExamConfig sheet missing required columns');

  var existingKeys = {};
  for (var r = 1; r < data.length; r++) {
    existingKeys[String(data[r][keyCol])] = r + 1;
  }

  var t = today();
  Object.keys(config).forEach(function(k) {
    var rowIdx = existingKeys[k];
    var value = config[k];
    if (rowIdx) {
      // Force plain-text format so Google Sheets never reinterprets
      // comma-separated numbers (e.g. "100,100,100") as a numeric value.
      var cell = sheet.getRange(rowIdx, valCol + 1);
      cell.setNumberFormat('@STRING@');
      cell.setValue(value);
      if (dateCol !== -1) sheet.getRange(rowIdx, dateCol + 1).setValue(t);
    } else {
      sheet.appendRow(new Array(headers.length).fill(''));
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow, keyCol + 1).setValue(k);
      var valCell = sheet.getRange(lastRow, valCol + 1);
      valCell.setNumberFormat('@STRING@');
      valCell.setValue(value);
      if (dateCol !== -1) sheet.getRange(lastRow, dateCol + 1).setValue(t);
    }
  });
  return { success: true };
}

// ============================================================================
// FORM LINKS
// ============================================================================

function handleGetFormLinks(params) {
  requireRole(params.token, ['teacher', 'admin']);
  var links = getSheetObjects('Links');
  return { success: true, data: { links: links } };
}

function handleSaveFormLinks(body) {
  requireRole(body.token, ['admin']);
  var links = body.links || [];
  var sheet = getSheet('Links');
  var t = today();

  for (var i = 0; i < links.length; i++) {
    var link = links[i];
    var url = String(link.form_url || '');
    if (url && url.indexOf('https://') !== 0) {
      return { success: false, error: 'URLs must start with https://' };
    }
    var rowIdx = findRowIndexByTwo(sheet, 'school', link.school, 'class', link.class);
    if (rowIdx > 0) {
      var data = sheet.getDataRange().getValues();
      var headers = data[0];
      var urlCol = headers.indexOf('form_url');
      var dateCol = headers.indexOf('updated_date');
      if (urlCol !== -1) sheet.getRange(rowIdx, urlCol + 1).setValue(url);
      if (dateCol !== -1) sheet.getRange(rowIdx, dateCol + 1).setValue(t);
    } else {
      sheet.appendRow([link.school, link.class, url, t]);
    }
  }
  return { success: true };
}

// ============================================================================
// HS MARKS ENTRY LINKS
// ============================================================================

/**
 * Returns the HS Marks Entry destination URLs from the `HS_Links` sheet
 * (columns: term, name, class_section, url) as a lookup map keyed by
 * "term|name|class_section". Consumed by js/hs-marks-entry.js.
 */
function handleGetHsLinks(params) {
  requireRole(params.token, ['teacher', 'admin']);
  var rows = getSheetObjects('HS_Links');
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var term = String(rows[i].term || '').trim();
    var name = String(rows[i].name || '').trim();
    var cs = String(rows[i].class_section || '').trim();
    var url = String(rows[i].url || '').trim();
    if (term && name && cs && url) {
      map[term + '|' + name + '|' + cs] = url;
    }
  }
  return { success: true, data: { links: map } };
}

// ============================================================================
// MARKS
// ============================================================================

function handleGetMarks(params) {
  requireRole(params.token, ['teacher', 'admin']);
  var school = String(params.school || '').toLowerCase();
  var classType = String(params.classType || '');
  if (school !== 'hs' && school !== 'hss') throw new Error('Invalid school');
  var marksSheet = school === 'hs' ? 'HS_Marks' : 'HSS_Marks';
  var studentSheet = school === 'hs' ? 'HS_Students' : 'HSS_Students';

  var allMarks = getSheetObjects(marksSheet);
  var allStudents = getSheetObjects(studentSheet);
  var studentMap = {};
  for (var i = 0; i < allStudents.length; i++) {
    studentMap[String(allStudents[i].roll_no)] = allStudents[i];
  }

  var rows = [];
  for (var m = 0; m < allMarks.length; m++) {
    if (classType && String(allMarks[m].class) !== classType) continue;
    var rec = allMarks[m];
    var stud = studentMap[String(rec.roll_no)];
    if (stud) {
      rec._name = stud.name;
      rec._section = stud.section;
      if (stud.stream) rec._stream = stud.stream;
    }
    rows.push(rec);
  }
  return { success: true, data: { marks: rows, examConfig: getExamConfigObject() } };
}

function handleSaveMarks(body) {
  requireRole(body.token, ['teacher', 'admin']);
  var school = String(body.school || '').toLowerCase();
  if (school !== 'hs' && school !== 'hss') throw new Error('Invalid school');
  var marksSheet = getSheet(school === 'hs' ? 'HS_Marks' : 'HSS_Marks');
  var rows = body.marks || [];
  var data = marksSheet.getDataRange().getValues();
  var headers = data[0];
  var rollCol = headers.indexOf('roll_no');
  if (rollCol === -1) throw new Error('Marks sheet missing roll_no column');

  var updated = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rollNo = String(row.roll_no);
    var rowIdx = findRowIndex(marksSheet, 'roll_no', rollNo);
    if (rowIdx === -1) {
      var newRow = new Array(headers.length).fill('');
      for (var c = 0; c < headers.length; c++) {
        if (row.hasOwnProperty(headers[c])) newRow[c] = row[headers[c]];
      }
      marksSheet.appendRow(newRow);
    } else {
      for (var c2 = 0; c2 < headers.length; c2++) {
        if (row.hasOwnProperty(headers[c2])) {
          marksSheet.getRange(rowIdx, c2 + 1).setValue(row[headers[c2]]);
        }
      }
    }
    updated++;
  }
  return { success: true, data: { updated: updated } };
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

function handleVerifyUser(body) {
  var info = verifyGoogleToken(body.token);
  var role = getUserRole(info.email);
  if (!role) return { success: false, error: 'User not registered. Contact the administrator.' };
  return { success: true, data: { email: info.email, name: info.name, role: role } };
}

function handleGetUsers(params) {
  requireRole(params.token, ['admin']);
  var users = getSheetObjects('Users');
  return { success: true, data: { users: users } };
}

function handleAddUser(body) {
  requireRole(body.token, ['admin']);
  var email = String(body.email || '').toLowerCase().trim();
  var name = String(body.name || '').trim();
  var role = String(body.role || '').toLowerCase().trim();
  if (!email || !name || !role) throw new Error('email, name, and role required');
  if (role !== 'admin' && role !== 'teacher') throw new Error('role must be admin or teacher');

  var sheet = getSheet('Users');
  if (findRowIndex(sheet, 'email', email) > 0) {
    return { success: false, error: 'User already exists' };
  }
  sheet.appendRow([email, name, role, today()]);
  return { success: true };
}

function handleUpdateUserRole(body) {
  requireRole(body.token, ['admin']);
  var email = String(body.email || '').toLowerCase().trim();
  var role = String(body.role || '').toLowerCase().trim();
  if (role !== 'admin' && role !== 'teacher') throw new Error('role must be admin or teacher');
  var sheet = getSheet('Users');
  var rowIdx = findRowIndex(sheet, 'email', email);
  if (rowIdx === -1) return { success: false, error: 'User not found' };
  var data = sheet.getDataRange().getValues();
  var roleCol = data[0].indexOf('role');
  if (roleCol === -1) throw new Error('Users sheet missing role column');
  sheet.getRange(rowIdx, roleCol + 1).setValue(role);
  return { success: true };
}

function handleDeleteUser(body) {
  var caller = requireRole(body.token, ['admin']);
  var email = String(body.email || '').toLowerCase().trim();
  if (email === caller.email) return { success: false, error: 'Cannot delete yourself' };
  var sheet = getSheet('Users');
  var rowIdx = findRowIndex(sheet, 'email', email);
  if (rowIdx === -1) return { success: false, error: 'User not found' };
  sheet.deleteRow(rowIdx);
  return { success: true };
}
