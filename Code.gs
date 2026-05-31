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
      case 'getLookupOptions': return sendJson(handleGetLookupOptions());
      case 'getMarks':      return sendJson(handleGetMarks(e.parameter));
      case 'getUsers':      return sendJson(handleGetUsers(e.parameter));
      case 'getExamConfig': return sendJson(handleGetExamConfig(e.parameter));
      case 'getFormLinks':  return sendJson(handleGetFormLinks(e.parameter));
      case 'getHsLinks':    return sendJson(handleGetHsLinks(e.parameter));
      case 'getHsReviewLinks': return sendJson(handleGetHsReviewLinks(e.parameter));
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
      case 'validateStudent':  return sendJson(handleValidateStudent(body));
      case 'requestResultOtp': return sendJson(handleRequestResultOtp(body));
      case 'verifyResultOtp':  return sendJson(handleVerifyResultOtp(body));
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
// PUBLIC: OTP-gated Student Result
// ============================================================================
//
// Flow: the homepage sends roll + class + section + stream to requestResultOtp,
// which verifies those details match the student record and emails a 6-digit
// code. The result itself is only returned by verifyResultOtp after the code is
// confirmed. There is intentionally NO endpoint that returns a result from the
// roll number alone.

function csvToArrayGs(s) {
  return String(s == null ? '' : s).split(',')
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x; });
}

function escapeHtmlGs(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Find a student row by roll number across HS then HSS. Returns
// { school, student } or null.
function findStudentByRoll(rollNo) {
  rollNo = String(rollNo || '').trim();
  if (!rollNo) return null;
  var sheets = [['hs', 'HS_Students'], ['hss', 'HSS_Students']];
  for (var i = 0; i < sheets.length; i++) {
    var students = getSheetObjects(sheets[i][1]);
    for (var s = 0; s < students.length; s++) {
      if (String(students[s].roll_no).trim() === rollNo) {
        return { school: sheets[i][0], student: students[s] };
      }
    }
  }
  return null;
}

// Verify that the supplied roll + class + section (+ stream for HSS) match a
// student record. Returns { school, student } on a full match, else null.
function matchStudentIdentity(rollNo, cls, section, stream) {
  var found = findStudentByRoll(rollNo);
  if (!found) return null;
  var st = found.student;
  if (String(st['class']).trim() !== String(cls).trim()) return null;
  if (String(st.section || '').trim().toLowerCase() !== String(section).trim().toLowerCase()) return null;
  if (found.school === 'hss' &&
      String(st.stream || '').trim().toLowerCase() !== String(stream).trim().toLowerCase()) {
    return null;
  }
  return found;
}

// Assemble the displayable result (student + marks + examConfig) for a roll
// number. Strips the email so it is never sent to the client. Returns null if
// the student is not found.
function buildStudentResult(rollNo) {
  var found = findStudentByRoll(rollNo);
  if (!found) return null;
  var school = found.school;
  var student = found.student;
  var marksSheet = school === 'hs' ? 'HS_Marks' : 'HSS_Marks';
  var marksList = getSheetObjects(marksSheet);
  var marks = null;
  for (var m = 0; m < marksList.length; m++) {
    if (String(marksList[m].roll_no).trim() === String(student.roll_no).trim()) {
      marks = marksList[m];
      break;
    }
  }
  if (student.email !== undefined) delete student.email;
  if (student.phone !== undefined) delete student.phone;
  return { school: school, student: student, marks: marks, examConfig: getExamConfigObject() };
}

// Non-sensitive option lists for the homepage dropdowns.
function handleGetLookupOptions() {
  var cfg = getExamConfigObject();
  var classes = csvToArrayGs(cfg.hs_classes).concat(csvToArrayGs(cfg.hss_classes));
  var streams = [];
  ['science', 'arts', 'commerce'].forEach(function (s) {
    if (cfg['hss_subjects_' + s]) streams.push(s);
  });
  return {
    success: true,
    data: { classes: classes, streams: streams, sections: csvToArrayGs(cfg.sections) }
  };
}

function maskEmail(email) {
  var parts = String(email).split('@');
  if (parts.length !== 2 || !parts[0]) return '****';
  return parts[0].charAt(0) + '•••@' + parts[1];
}

function bullets(n) {
  var s = '';
  for (var i = 0; i < n; i++) s += '•';
  return s;
}

// Hint shown in step 2: reveal the first character and the two characters
// immediately before the "@"; mask only the middle of the local part. The
// domain (from "@" to the end) is shown. e.g. ramkumar@gmail.com ->
// "r•••••ar@gmail.com".
function maskEmailHint(email) {
  var s = String(email || '');
  var at = s.indexOf('@');
  if (at < 1) return s;
  var local = s.substring(0, at);
  var domain = s.substring(at);
  var masked = local.length <= 3
    ? local
    : local.charAt(0) + bullets(local.length - 3) + local.substring(local.length - 2);
  return masked + domain;
}

// Step 1: verify roll + class + section (+ stream) match a record. Does NOT
// send any email — returns a masked hint of the registered address so the
// student can confirm which email to enter in step 2. Generic error on miss.
function handleValidateStudent(body) {
  var GENERIC = 'We could not verify those details. Please check and try again.';
  var rollNo  = String(body.rollNo || '').trim();
  var cls     = String(body['class'] || '').trim();
  var section = String(body.section || '').trim();
  var stream  = String(body.stream || '').trim();
  if (!rollNo || !cls || !section) return { success: false, error: GENERIC };

  var found = matchStudentIdentity(rollNo, cls, section, stream);
  if (!found) return { success: false, error: GENERIC };

  var email = String(found.student.email || '').trim();
  if (!email) {
    return { success: false, error: 'No email is on file for this student. Please contact the school office.' };
  }
  return { success: true, data: { emailHint: maskEmailHint(email) } };
}

// Step 2: re-verify the details AND that the entered email matches the one on
// file, then email a one-time code. Requiring the full email before any send
// stops anyone from draining the daily email quota by spamming requests.
function handleRequestResultOtp(body) {
  var GENERIC = 'We could not verify those details. Please check and try again.';
  var rollNo  = String(body.rollNo || '').trim();
  var cls     = String(body['class'] || '').trim();
  var section = String(body.section || '').trim();
  var stream  = String(body.stream || '').trim();
  var entered = String(body.email || '').trim();
  if (!rollNo || !cls || !section || !entered) return { success: false, error: GENERIC };

  var found = matchStudentIdentity(rollNo, cls, section, stream);
  if (!found) return { success: false, error: GENERIC };
  var st = found.student;

  var email = String(st.email || '').trim();
  if (!email) {
    return { success: false, error: 'No email is on file for this student. Please contact the school office.' };
  }
  if (email.toLowerCase() !== entered.toLowerCase()) {
    return { success: false, error: 'That email does not match the one on file for this student.' };
  }

  var cache = CacheService.getScriptCache();
  var now = Date.now();
  var rlKey = 'rotp_rl_' + rollNo;
  var sends = cache.get(rlKey) ? JSON.parse(cache.get(rlKey)) : { count: 0, last: 0 };
  if (now - sends.last < 60 * 1000) {
    return { success: false, error: 'Please wait a minute before requesting another code.' };
  }
  if (sends.count >= 3) {
    return { success: false, error: 'Too many code requests. Please try again later.' };
  }

  var otp = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('rotp_' + rollNo, JSON.stringify({ otp: otp, exp: now + 5 * 60 * 1000, attempts: 0 }), 360);
  sends.count += 1;
  sends.last = now;
  cache.put(rlKey, JSON.stringify(sends), 900);

  var cfg = getExamConfigObject();
  var schoolName = cfg.school_name || 'BHSS Result System';
  var replyTo = String(cfg.contact_email || '').trim();
  var studentName = st.name || 'Student';

  var plainBody =
    'Dear ' + studentName + ',\n\n' +
    'Your one-time code to view your ' + schoolName + ' result is:\n\n' +
    '    ' + otp + '\n\n' +
    'This code expires in 5 minutes. If you did not request it, you can ignore this email.\n\n' +
    '— ' + schoolName;

  var htmlBody =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1e293b">' +
      '<div style="background:#4338ca;color:#ffffff;padding:16px 20px;border-radius:12px 12px 0 0;font-size:16px;font-weight:bold">' +
        escapeHtmlGs(schoolName) +
      '</div>' +
      '<div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:20px">' +
        '<p style="margin:0 0 12px">Dear ' + escapeHtmlGs(studentName) + ',</p>' +
        '<p style="margin:0 0 8px">Use this one-time code to view your result:</p>' +
        '<div style="font-size:30px;font-weight:bold;letter-spacing:6px;background:#eef2ff;color:#4338ca;text-align:center;padding:14px;border-radius:10px;margin:8px 0 16px">' +
          otp +
        '</div>' +
        '<p style="margin:0 0 8px;color:#64748b;font-size:14px">This code expires in 5 minutes.</p>' +
        '<p style="margin:0;color:#94a3b8;font-size:12px">If you did not request this, you can safely ignore this email.</p>' +
      '</div>' +
      '<p style="text-align:center;color:#94a3b8;font-size:12px;margin:12px 0">' + escapeHtmlGs(schoolName) + '</p>' +
    '</div>';

  var options = { name: schoolName, htmlBody: htmlBody };
  if (replyTo) options.replyTo = replyTo;
  MailApp.sendEmail(email, 'Your ' + schoolName + ' result access code', plainBody, options);

  return { success: true, data: { maskedEmail: maskEmail(email) } };
}

// Confirm the code and, if valid, return the result.
function handleVerifyResultOtp(body) {
  var rollNo = String(body.rollNo || '').trim();
  var otp    = String(body.otp || '').trim();
  if (!rollNo || !otp) return { success: false, error: 'Enter the code that was emailed to you.' };

  var cache = CacheService.getScriptCache();
  var key = 'rotp_' + rollNo;
  var raw = cache.get(key);
  if (!raw) return { success: false, error: 'Your code has expired. Please request a new one.' };

  var rec = JSON.parse(raw);
  if (Date.now() > rec.exp) {
    cache.remove(key);
    return { success: false, error: 'Your code has expired. Please request a new one.' };
  }
  rec.attempts = (rec.attempts || 0) + 1;
  if (rec.attempts > 5) {
    cache.remove(key);
    return { success: false, error: 'Too many incorrect attempts. Please request a new code.' };
  }
  if (String(rec.otp) !== otp) {
    cache.put(key, JSON.stringify(rec), 360);
    return { success: false, error: 'Incorrect code. Please try again.' };
  }

  cache.remove(key);
  var result = buildStudentResult(rollNo);
  if (!result) return { success: false, error: 'Result not found.' };
  return { success: true, data: result };
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
  requireRole(params.token, ['hs_teacher', 'hss_teacher', 'principal', 'admin']);
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
  requireRole(params.token, ['hs_teacher', 'hss_teacher', 'principal', 'admin']);
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
  requireRole(params.token, ['hs_teacher', 'hss_teacher', 'principal', 'admin']);
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

/**
 * Returns the HS Entry Review destination URLs from the `HS_Review_Links`
 * sheet (columns: term, class_section, url) as a lookup map keyed by
 * "term|class_section". Consumed by js/hs-entry-review.js. The Entry Review
 * wizard still shows a Name dropdown, but the name is NOT part of this key.
 */
function handleGetHsReviewLinks(params) {
  requireRole(params.token, ['hs_teacher', 'hss_teacher', 'principal', 'admin']);
  var rows = getSheetObjects('HS_Review_Links');
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var term = String(rows[i].term || '').trim();
    var cs = String(rows[i].class_section || '').trim();
    var url = String(rows[i].url || '').trim();
    if (term && cs && url) {
      map[term + '|' + cs] = url;
    }
  }
  return { success: true, data: { links: map } };
}

// ============================================================================
// MARKS
// ============================================================================

function handleGetMarks(params) {
  requireRole(params.token, ['hs_teacher', 'hss_teacher', 'principal', 'admin']);
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
  requireRole(body.token, ['hs_teacher', 'hss_teacher', 'principal', 'admin']);
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
  if (['admin', 'hs_teacher', 'hss_teacher', 'principal'].indexOf(role) === -1) throw new Error('role must be admin, hs_teacher, hss_teacher, or principal');

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
  if (['admin', 'hs_teacher', 'hss_teacher', 'principal'].indexOf(role) === -1) throw new Error('role must be admin, hs_teacher, hss_teacher, or principal');
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

// ============================================================================
// TEACHER SHEETS -> USERS SYNC
// ============================================================================
//
// Two tabs feed accounts into the Users sheet:
//   HS_Teachers  -> F2 = principal, F3:F = hs_teacher
//   HSS_Teachers -> F2 = principal, F3:F = hss_teacher
// In each, column A is the name; columns F and G each hold an email (H is
// ignored). Both emails on a row become separate users sharing that row's
// name. Row 2's emails are assigned the `principal` role; the teacher role
// starts at row 3. For each (role, source rows) pair, the Users rows of that
// role are mirrored to those emails:
//   - email present in source but not in Users -> add with that role (name col A)
//   - email present, name changed              -> update the name in Users
//   - the role's email no longer in source     -> remove that user from Users
// Rows of other roles are never added, changed, or deleted; an email already
// held by a user of a different role is left untouched (no duplicate).
//
// NOTE: HS_Teachers F2 and HSS_Teachers F2 are two DIFFERENT principals; both
// are stored with role `principal`. The principal reconcile is scoped to the
// emails currently in the two F2 cells, so neither sheet's sync deletes the
// other sheet's principal.
//
// Setup (run once each from the Apps Script editor):
//   1. syncAllTeachers()           — initial backfill of both sheets
//   2. createTeachersSyncTrigger() — installs the on-edit auto-sync

var TEACHER_SOURCES = [
  { sheet: 'HS_Teachers',  role: 'hs_teacher' },
  { sheet: 'HSS_Teachers', role: 'hss_teacher' }
];

var PRINCIPAL_ROLE = 'principal';

// Read { emailLower -> { email, name } } from a sheet's column A (name) and
// the email columns F and G, for rows [firstRow, lastRow] inclusive (1-based,
// where row 1 is the header). Pass lastRow = null to read to the end. A row may
// hold an email in F and/or G; each non-empty one becomes its own user, both
// sharing that row's col-A name. Deduped by email (first occurrence wins).
function readTeacherEmails(srcData, firstRow, lastRow) {
  var out = {};
  var emailCols = [5, 6]; // F, G (0-based)
  var end = (lastRow == null) ? srcData.length - 1 : lastRow - 1; // to 0-based
  for (var r = firstRow - 1; r <= end && r < srcData.length; r++) {
    if (r < 0) continue;
    var name = String(srcData[r][0] == null ? '' : srcData[r][0]).trim();
    for (var c = 0; c < emailCols.length; c++) {
      var email = String(srcData[r][emailCols[c]] == null ? '' : srcData[r][emailCols[c]]).trim();
      if (!email) continue;
      var key = email.toLowerCase();
      if (!out[key]) out[key] = { email: email, name: name };
    }
  }
  return out;
}

// Reconcile the Users rows of `role` against a `desired` map
// (emailLower -> { email, name }). Adds/updates/removes only rows of `role`.
function reconcileRole(usersSheet, role, desired) {
  var uData = usersSheet.getDataRange().getValues();
  var uHeaders = uData[0];
  var emailCol = uHeaders.indexOf('email');
  var nameCol = uHeaders.indexOf('name');
  var roleCol = uHeaders.indexOf('role');
  var dateCol = uHeaders.indexOf('added_date');
  if (emailCol === -1 || nameCol === -1 || roleCol === -1) {
    throw new Error('Users sheet missing email/name/role columns');
  }

  var existing = {}; // emailLower -> { row (1-based), role, name }
  for (var u = 1; u < uData.length; u++) {
    var em = String(uData[u][emailCol] == null ? '' : uData[u][emailCol]).trim().toLowerCase();
    if (!em) continue;
    existing[em] = {
      row: u + 1,
      role: String(uData[u][roleCol] || '').toLowerCase(),
      name: String(uData[u][nameCol] || '')
    };
  }

  var t = today();

  // Add new emails; update names of existing rows of this role.
  Object.keys(desired).forEach(function (key) {
    var d = desired[key];
    var ex = existing[key];
    if (!ex) {
      var newRow = new Array(uHeaders.length).fill('');
      newRow[emailCol] = d.email;
      newRow[nameCol] = d.name;
      newRow[roleCol] = role;
      if (dateCol !== -1) newRow[dateCol] = t;
      usersSheet.appendRow(newRow);
    } else if (ex.role === role && ex.name !== d.name) {
      usersSheet.getRange(ex.row, nameCol + 1).setValue(d.name);
    }
    // email already held by a user of a different role -> leave untouched.
  });

  // Remove rows of this role whose email is no longer desired.
  // Delete bottom-up so row indices stay valid.
  var toDelete = [];
  for (var u2 = 1; u2 < uData.length; u2++) {
    var em2 = String(uData[u2][emailCol] == null ? '' : uData[u2][emailCol]).trim().toLowerCase();
    var role2 = String(uData[u2][roleCol] || '').toLowerCase();
    if (role2 === role && em2 && !desired[em2]) {
      toDelete.push(u2 + 1);
    }
  }
  toDelete.sort(function (a, b) { return b - a; });
  toDelete.forEach(function (rowIdx) { usersSheet.deleteRow(rowIdx); });
}

// Sync one teacher sheet into Users: F2 -> principal, F3:F -> `role`.
function syncRoleFromTeacherSheet(sheetName, role) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(sheetName);
  if (!src) return; // tab not present yet — nothing to do
  var usersSheet = getSheet('Users');

  // Column A (index 0) = name, column F (index 5) = email.
  var srcData = src.getDataRange().getValues();

  // Row 2 only -> principal. Reconcile principals against the union of BOTH
  // sheets' F2 cells, so syncing one sheet never drops the other's principal.
  reconcileRole(usersSheet, PRINCIPAL_ROLE, collectPrincipalEmails(ss));

  // Rows 3..end -> this sheet's teacher role.
  reconcileRole(usersSheet, role, readTeacherEmails(srcData, 3, null));
}

// The desired principal set = the F2 email of every teacher source sheet.
function collectPrincipalEmails(ss) {
  var desired = {};
  TEACHER_SOURCES.forEach(function (s) {
    var sheet = ss.getSheetByName(s.sheet);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    var one = readTeacherEmails(data, 2, 2); // row 2 only
    Object.keys(one).forEach(function (k) { if (!desired[k]) desired[k] = one[k]; });
  });
  return desired;
}

// Backfill both teacher sheets at once (initial sync, run from the editor).
function syncAllTeachers() {
  TEACHER_SOURCES.forEach(function (s) { syncRoleFromTeacherSheet(s.sheet, s.role); });
}

// Installable on-edit handler: when either teacher tab changes, re-sync it.
// Wrapped in try/catch so a sync error never blocks the user's edit.
function onTeachersEdit(e) {
  try {
    if (!e || !e.range) return;
    var name = e.range.getSheet().getName();
    for (var i = 0; i < TEACHER_SOURCES.length; i++) {
      if (TEACHER_SOURCES[i].sheet === name) {
        syncRoleFromTeacherSheet(TEACHER_SOURCES[i].sheet, TEACHER_SOURCES[i].role);
        return;
      }
    }
  } catch (err) {
    console.error('Teacher sync failed: ' + err);
  }
}

// Run once from the editor to install the on-edit auto-sync trigger.
// Safe to re-run — it removes any prior teacher-sync trigger first
// (including the older onHsTeachersEdit handler).
function createTeachersSyncTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'onTeachersEdit' || fn === 'onHsTeachersEdit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('onTeachersEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
}
