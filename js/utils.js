/**
 * Utility functions: escaping, parsing, grade/division calculation.
 * No DOM dependencies — pure helpers.
 */

const Utils = (() => {

  /** Prevent XSS when rendering sheet data into HTML. */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Parse a comma-separated value from ExamConfig into a trimmed array. */
  function csvToArray(str) {
    if (!str && str !== 0) return [];
    return String(str).split(',').map(s => s.trim()).filter(Boolean);
  }

  /** Parse a CSV of numbers into a number array (NaN values dropped). */
  function csvToNumbers(str) {
    return csvToArray(str).map(n => Number(n.replace(/,/g, ''))).filter(n => !isNaN(n));
  }

  /** Return grade letter from percentage. */
  function calculateGrade(percentage) {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C+';
    if (percentage >= 40) return 'C';
    if (percentage >= 33) return 'D';
    return 'F';
  }

  /** Return division string from total percentage and pass-fail status. */
  function calculateDivision(percentage, hasFailed) {
    if (hasFailed) return 'Fail';
    if (percentage >= 60) return 'First Division (Distinction)';
    if (percentage >= 45) return 'Second Division';
    if (percentage >= 33) return 'Third Division';
    return 'Fail';
  }

  /** Whether a mark value (number or 'A'/'NA') represents a present, numeric score. */
  function isNumericMark(value) {
    if (value === null || value === undefined || value === '') return false;
    const n = Number(value);
    return !isNaN(n);
  }

  /**
   * Compute the result summary for a single student.
   *
   * @param marksRow  - one row object from the marks sheet (subject -> score)
   * @param subjects  - array of subject names (column headers)
   * @param maxMarks  - array of max marks per subject (same order)
   * @param passMarks - array of pass marks per subject (same order)
   * @returns {{ subjects: Array, totalObtained: number, totalMax: number,
   *            percentage: number, hasFailed: boolean, division: string,
   *            grade: string, status: string }}
   */
  function computeResult(marksRow, subjects, maxMarks, passMarks) {
    let totalObtained = 0;
    let totalMax = 0;
    let hasFailed = false;
    const subjectResults = subjects.map((sub, i) => {
      const rawValue = marksRow ? marksRow[sub] : '';
      const max = Number(maxMarks[i] || 0);
      const pass = Number(passMarks[i] || 0);
      totalMax += max;

      if (rawValue === 'NA' || rawValue === 'na') {
        return { subject: sub, max: max, obtained: 'NA', grade: '-', status: '-' };
      }
      if (rawValue === 'A' || rawValue === 'a' || rawValue === '' || rawValue == null) {
        hasFailed = true;
        return { subject: sub, max: max, obtained: 'Absent', grade: '-', status: 'F' };
      }
      const obtained = Number(rawValue);
      if (isNaN(obtained)) {
        return { subject: sub, max: max, obtained: rawValue, grade: '-', status: '-' };
      }
      totalObtained += obtained;
      const passed = obtained >= pass;
      if (!passed) hasFailed = true;
      const pct = max > 0 ? (obtained / max) * 100 : 0;
      return {
        subject: sub,
        max: max,
        obtained: obtained,
        grade: calculateGrade(pct),
        status: passed ? 'P' : 'F'
      };
    });

    const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    return {
      subjects: subjectResults,
      totalObtained: totalObtained,
      totalMax: totalMax,
      percentage: Math.round(percentage * 100) / 100,
      hasFailed: hasFailed,
      division: calculateDivision(percentage, hasFailed),
      grade: calculateGrade(percentage),
      status: hasFailed ? 'Fail' : 'Pass'
    };
  }

  /**
   * Get the subjects/max/pass arrays for a given school + stream (HSS only).
   * Falls back to HS arrays if stream is missing.
   */
  function getSubjectConfig(examConfig, school, stream) {
    if (!examConfig) return { subjects: [], maxMarks: [], passMarks: [] };
    if (school === 'hs') {
      return {
        subjects:  csvToArray(examConfig.hs_subjects),
        maxMarks:  csvToNumbers(examConfig.hs_max_marks),
        passMarks: csvToNumbers(examConfig.hs_pass_marks)
      };
    }
    // HSS - pick by stream
    const s = String(stream || 'science').toLowerCase();
    return {
      subjects:  csvToArray(examConfig['hss_subjects_' + s]),
      maxMarks:  csvToNumbers(examConfig['hss_max_marks_' + s]),
      passMarks: csvToNumbers(examConfig['hss_pass_marks_' + s])
    };
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toISOString().slice(0, 10);
    } catch (e) {
      return String(value);
    }
  }

  function showToast(message, type) {
    const toast = document.getElementById('toast');
    const inner = document.getElementById('toast-inner');
    if (!toast || !inner) return;
    const bg = type === 'error' ? 'bg-red-600' : type === 'warn' ? 'bg-amber-500' : 'bg-emerald-600';
    inner.className = 'px-4 py-3 rounded shadow-lg text-white font-semibold ' + bg;
    inner.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add('hidden'), 3500);
  }

  function showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (!el) return;
    if (show) el.classList.add('show');
    else el.classList.remove('show');
  }

  return {
    escapeHtml,
    csvToArray,
    csvToNumbers,
    calculateGrade,
    calculateDivision,
    isNumericMark,
    computeResult,
    getSubjectConfig,
    formatDate,
    showToast,
    showLoading
  };
})();
