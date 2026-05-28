/**
 * All HTTP calls to the Google Apps Script Web App.
 *
 * IMPORTANT: For POST requests we send body as text/plain to avoid CORS
 * preflight. GAS reads it via e.postData.contents and parses JSON manually.
 */

const Api = (() => {

  function checkConfigured() {
    if (!GAS_URL || GAS_URL.indexOf('PASTE-DEPLOYMENT-ID') !== -1) {
      throw new Error('GAS_URL is not configured. Edit js/config.js with your Apps Script deployment URL.');
    }
  }

  async function get(action, params) {
    checkConfigured();
    const url = new URL(GAS_URL);
    url.searchParams.set('action', action);
    if (params) {
      Object.keys(params).forEach(k => {
        if (params[k] !== undefined && params[k] !== null) {
          url.searchParams.set(k, params[k]);
        }
      });
    }
    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error('Network error: HTTP ' + res.status);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json.data;
  }

  async function post(action, body) {
    checkConfigured();
    const payload = Object.assign({ action }, body || {});
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Network error: HTTP ' + res.status);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json.data;
  }

  // ---- Public (student result, OTP-gated) ----
  const getLookupOptions = () => get('getLookupOptions', {});
  const validateStudent = (payload) => post('validateStudent', payload);
  const requestResultOtp = (payload) => post('requestResultOtp', payload);
  const verifyResultOtp = (rollNo, otp) => post('verifyResultOtp', { rollNo, otp });

  // ---- Auth ----
  const verifyUser = (token) => post('verifyUser', { token });

  // ---- Teacher + Admin ----
  const getMarks = (school, classType, token) => get('getMarks', { school, classType, token });
  const saveMarks = (school, classType, marks, token) =>
    post('saveMarks', { school, classType, marks, token });
  const getExamConfig = (token) => get('getExamConfig', { token });
  const getFormLinks = (token) => get('getFormLinks', { token });
  const getHsLinks = (token) => get('getHsLinks', { token });

  // ---- Admin only ----
  const getUsers = (token) => get('getUsers', { token });
  const addUser = (email, name, role, token) =>
    post('addUser', { email, name, role, token });
  const updateUserRole = (email, role, token) =>
    post('updateUserRole', { email, role, token });
  const deleteUser = (email, token) => post('deleteUser', { email, token });
  const saveExamConfig = (config, token) => post('saveExamConfig', { config, token });
  const saveFormLinks = (links, token) => post('saveFormLinks', { links, token });

  return {
    getLookupOptions,
    validateStudent,
    requestResultOtp,
    verifyResultOtp,
    verifyUser,
    getMarks,
    saveMarks,
    getExamConfig,
    getFormLinks,
    getHsLinks,
    getUsers,
    addUser,
    updateUserRole,
    deleteUser,
    saveExamConfig,
    saveFormLinks
  };
})();
