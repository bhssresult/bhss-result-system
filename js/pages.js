/**
 * Page render functions.
 * Each render* function populates a section element with HTML and wires
 * its own event handlers.
 *
 * All dynamic text from sheet data uses Utils.escapeHtml() to prevent XSS.
 */

const Pages = (() => {

  const esc = Utils.escapeHtml;
  let cachedExamConfig = null;
  let cachedFormLinks = null;

  // ============================================================
  // HOME PAGE (public)
  // ============================================================
  function renderHome() {
    const form = document.getElementById('lookup-form');
    const statusEl = document.getElementById('lookup-status');
    const resultEl = document.getElementById('lookup-result');

    form.onsubmit = async (e) => {
      e.preventDefault();
      const rollNo = document.getElementById('lookup-rollno').value.trim();
      if (!rollNo) return;

      statusEl.textContent = 'Searching...';
      statusEl.className = 'mt-3 text-sm text-slate-600';
      resultEl.classList.add('hidden');
      resultEl.innerHTML = '';

      try {
        const data = await Api.lookupStudent(rollNo);
        statusEl.textContent = '';

        // Update hero with exam name if config available
        if (data.examConfig) {
          const schoolName = data.examConfig.school_name;
          const examName = data.examConfig.exam_name;
          if (schoolName) document.getElementById('home-school-name').textContent = schoolName;
          if (examName) document.getElementById('home-exam-name').textContent = examName;
        }

        resultEl.innerHTML = renderResultCard(data.school, data.student, data.marks, data.examConfig, true);
        resultEl.classList.remove('hidden');
        wireResultCardButtons(resultEl);
      } catch (err) {
        statusEl.textContent = err.message || 'Student not found';
        statusEl.className = 'mt-3 text-sm text-red-600';
      }
    };
  }

  // ============================================================
  // RESULT CARD (shared component)
  // ============================================================
  function renderResultCard(school, student, marksRow, examConfig, includePrintButton) {
    const stream = student.stream || '';
    const cfg = Utils.getSubjectConfig(examConfig, school, stream);
    const result = Utils.computeResult(marksRow || {}, cfg.subjects, cfg.maxMarks, cfg.passMarks);

    const examName = examConfig && examConfig.exam_name ? examConfig.exam_name : '';
    const schoolName = examConfig && examConfig.school_name ? examConfig.school_name : '';

    const subjectRows = result.subjects.map(s => `
      <tr>
        <td>${esc(s.subject)}</td>
        <td class="num">${esc(s.max)}</td>
        <td class="num">${esc(s.obtained)}</td>
        <td>${esc(s.grade)}</td>
        <td class="${s.status === 'P' ? 'status-pass' : s.status === 'F' ? 'status-fail' : ''}">${esc(s.status)}</td>
      </tr>
    `).join('');

    const printBtn = includePrintButton
      ? `<button class="print-card-btn no-print bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded font-semibold text-sm">🖨️ Print</button>`
      : '';

    return `
      <div class="result-card bg-white rounded-2xl shadow p-6 md:p-8 mb-6">
        <div class="text-center mb-4 border-b border-slate-200 pb-4">
          <h2 class="text-2xl md:text-3xl font-bold text-brand-700">${esc(schoolName)}</h2>
          <p class="text-slate-600">${esc(examName)}</p>
          <p class="text-xs uppercase tracking-wide text-slate-500 mt-1">Statement of Marks</p>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 text-sm">
          <div><div class="text-slate-500">Name</div><div class="font-semibold">${esc(student.name)}</div></div>
          <div><div class="text-slate-500">Roll No</div><div class="font-semibold">${esc(student.roll_no)}</div></div>
          <div><div class="text-slate-500">Class</div><div class="font-semibold">${esc(student.class)}${student.section ? ' (' + esc(student.section) + ')' : ''}</div></div>
          ${stream ? `<div><div class="text-slate-500">Stream</div><div class="font-semibold">${esc(stream)}</div></div>` : ''}
        </div>

        <table class="subjects-table mb-4">
          <thead>
            <tr><th>Subject</th><th class="num">Max</th><th class="num">Obtained</th><th>Grade</th><th>P/F</th></tr>
          </thead>
          <tbody>
            ${subjectRows || '<tr><td colspan="5" class="text-center text-slate-400">No marks recorded</td></tr>'}
            <tr class="summary-row">
              <td>Total</td>
              <td class="num">${esc(result.totalMax)}</td>
              <td class="num">${esc(result.totalObtained)}</td>
              <td colspan="2">${esc(result.percentage)}%</td>
            </tr>
          </tbody>
        </table>

        <div class="flex flex-wrap items-center justify-between gap-3 mt-4">
          <div class="text-sm">
            <div><span class="text-slate-500">Overall Grade:</span> <span class="font-bold">${esc(result.grade)}</span></div>
            <div><span class="text-slate-500">Result:</span>
              <span class="font-bold ${result.hasFailed ? 'status-fail' : 'status-pass'}">${esc(result.status)}</span>
              &middot; <span class="text-slate-700">${esc(result.division)}</span>
            </div>
          </div>
          ${printBtn}
        </div>
      </div>
    `;
  }

  function wireResultCardButtons(container) {
    const btns = container.querySelectorAll('.print-card-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => window.print());
    });
  }

  // ============================================================
  // ADMIN PAGE
  // ============================================================
  async function renderAdmin() {
    wireAdminTabs();
    await Promise.all([
      renderAdminUsers(),
      renderAdminExamConfig(),
      renderAdminLinks()
    ]);
  }

  function wireAdminTabs() {
    const tabs = document.querySelectorAll('.admin-tab');
    const panels = document.querySelectorAll('.admin-tab-panel');
    tabs.forEach(tab => {
      tab.onclick = () => {
        tabs.forEach(t => {
          t.classList.remove('border-brand-600', 'text-brand-700');
          t.classList.add('border-transparent', 'text-slate-500');
        });
        tab.classList.add('border-brand-600', 'text-brand-700');
        tab.classList.remove('border-transparent', 'text-slate-500');
        panels.forEach(p => p.classList.add('hidden'));
        document.getElementById('admin-tab-' + tab.dataset.tab).classList.remove('hidden');
      };
    });
  }

  async function renderAdminUsers() {
    const container = document.getElementById('admin-tab-users');
    container.innerHTML = '<p class="text-slate-500">Loading users...</p>';
    try {
      const data = await Api.getUsers(Auth.getToken());
      const users = data.users || [];

      const rows = users.map(u => `
        <tr class="border-b border-slate-100">
          <td class="py-2 px-3">${esc(u.email)}</td>
          <td class="py-2 px-3">${esc(u.name)}</td>
          <td class="py-2 px-3">
            <select data-email="${esc(u.email)}" class="user-role-select border border-slate-300 rounded px-2 py-1 text-sm">
              <option value="admin"   ${u.role === 'admin'   ? 'selected' : ''}>admin</option>
              <option value="teacher" ${u.role === 'teacher' ? 'selected' : ''}>teacher</option>
            </select>
          </td>
          <td class="py-2 px-3 text-sm text-slate-500">${esc(Utils.formatDate(u.added_date))}</td>
          <td class="py-2 px-3 text-right">
            <button data-email="${esc(u.email)}" class="user-delete-btn bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded text-sm font-semibold">Remove</button>
          </td>
        </tr>
      `).join('');

      container.innerHTML = `
        <div class="mb-6 border border-slate-200 rounded-lg p-4 bg-slate-50">
          <h3 class="font-semibold mb-3">Add User</h3>
          <form id="add-user-form" class="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input id="new-user-email" type="email" required placeholder="email@school.edu"
                   class="border border-slate-300 rounded px-3 py-2" />
            <input id="new-user-name" type="text" required placeholder="Full Name"
                   class="border border-slate-300 rounded px-3 py-2" />
            <select id="new-user-role" class="border border-slate-300 rounded px-3 py-2">
              <option value="teacher">teacher</option>
              <option value="admin">admin</option>
            </select>
            <button type="submit" class="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded">Add</button>
          </form>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-100 text-left">
              <tr>
                <th class="py-2 px-3">Email</th>
                <th class="py-2 px-3">Name</th>
                <th class="py-2 px-3">Role</th>
                <th class="py-2 px-3">Added</th>
                <th class="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5" class="py-4 text-center text-slate-400">No users yet</td></tr>'}</tbody>
          </table>
        </div>
      `;

      // Wire form
      document.getElementById('add-user-form').onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('new-user-email').value.trim().toLowerCase();
        const name  = document.getElementById('new-user-name').value.trim();
        const role  = document.getElementById('new-user-role').value;
        Utils.showLoading(true);
        try {
          await Api.addUser(email, name, role, Auth.getToken());
          Utils.showToast('User added', 'success');
          await renderAdminUsers();
        } catch (err) {
          Utils.showToast(err.message, 'error');
        } finally { Utils.showLoading(false); }
      };

      // Wire role selects
      container.querySelectorAll('.user-role-select').forEach(sel => {
        sel.onchange = async () => {
          const email = sel.dataset.email;
          const role = sel.value;
          Utils.showLoading(true);
          try {
            await Api.updateUserRole(email, role, Auth.getToken());
            Utils.showToast('Role updated', 'success');
          } catch (err) {
            Utils.showToast(err.message, 'error');
            await renderAdminUsers();
          } finally { Utils.showLoading(false); }
        };
      });

      // Wire delete buttons
      container.querySelectorAll('.user-delete-btn').forEach(btn => {
        btn.onclick = async () => {
          const email = btn.dataset.email;
          if (!confirm('Remove user ' + email + '?')) return;
          Utils.showLoading(true);
          try {
            await Api.deleteUser(email, Auth.getToken());
            Utils.showToast('User removed', 'success');
            await renderAdminUsers();
          } catch (err) {
            Utils.showToast(err.message, 'error');
          } finally { Utils.showLoading(false); }
        };
      });

    } catch (err) {
      container.innerHTML = '<p class="text-red-600">Failed to load users: ' + esc(err.message) + '</p>';
    }
  }

  async function renderAdminExamConfig() {
    const container = document.getElementById('admin-tab-exam');
    container.innerHTML = '<p class="text-slate-500">Loading configuration...</p>';
    try {
      const data = await Api.getExamConfig(Auth.getToken());
      const cfg = data.config || {};
      cachedExamConfig = cfg;

      const field = (key, label, type) => `
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-1">${esc(label)}</label>
          <input data-key="${esc(key)}" type="${type || 'text'}" value="${esc(cfg[key] || '')}"
                 class="exam-config-input w-full border border-slate-300 rounded px-3 py-2" />
        </div>
      `;

      container.innerHTML = `
        <p class="text-sm text-slate-600 mb-4">Subjects, max marks, and pass marks must be comma-separated values in matching order.</p>

        <div class="grid md:grid-cols-2 gap-4">
          ${field('school_name', 'School Name')}
          ${field('exam_name',   'Exam Name')}
          ${field('exam_date',   'Exam Date', 'date')}
        </div>

        <h3 class="font-bold mt-6 mb-3 text-brand-700">High School (HS)</h3>
        <div class="grid md:grid-cols-2 gap-4">
          ${field('hs_classes',    'HS Classes (comma list)')}
          ${field('hs_subjects',   'HS Subjects (comma list)')}
          ${field('hs_max_marks',  'HS Max Marks (comma list)')}
          ${field('hs_pass_marks', 'HS Pass Marks (comma list)')}
        </div>

        <h3 class="font-bold mt-6 mb-3 text-brand-700">Higher Secondary (HSS)</h3>
        <div class="grid md:grid-cols-2 gap-4">
          ${field('hss_classes',           'HSS Classes')}
          ${field('hss_subjects_science',  'HSS Subjects - Science')}
          ${field('hss_max_marks_science', 'HSS Max Marks - Science')}
          ${field('hss_pass_marks_science','HSS Pass Marks - Science')}
          ${field('hss_subjects_arts',     'HSS Subjects - Arts')}
          ${field('hss_max_marks_arts',    'HSS Max Marks - Arts')}
          ${field('hss_pass_marks_arts',   'HSS Pass Marks - Arts')}
          ${field('hss_subjects_commerce', 'HSS Subjects - Commerce (optional)')}
          ${field('hss_max_marks_commerce','HSS Max Marks - Commerce (optional)')}
          ${field('hss_pass_marks_commerce','HSS Pass Marks - Commerce (optional)')}
        </div>

        <div class="mt-6">
          <button id="save-exam-config" class="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2 rounded">Save Configuration</button>
        </div>
      `;

      document.getElementById('save-exam-config').onclick = async () => {
        const newConfig = {};
        container.querySelectorAll('.exam-config-input').forEach(inp => {
          newConfig[inp.dataset.key] = inp.value;
        });
        Utils.showLoading(true);
        try {
          await Api.saveExamConfig(newConfig, Auth.getToken());
          Utils.showToast('Configuration saved', 'success');
          cachedExamConfig = newConfig;
        } catch (err) {
          Utils.showToast(err.message, 'error');
        } finally { Utils.showLoading(false); }
      };
    } catch (err) {
      container.innerHTML = '<p class="text-red-600">Failed to load: ' + esc(err.message) + '</p>';
    }
  }

  async function renderAdminLinks() {
    const container = document.getElementById('admin-tab-links');
    container.innerHTML = '<p class="text-slate-500">Loading links...</p>';
    try {
      const [linksData, examData] = await Promise.all([
        Api.getFormLinks(Auth.getToken()),
        cachedExamConfig ? Promise.resolve({ config: cachedExamConfig }) : Api.getExamConfig(Auth.getToken())
      ]);
      const existingLinks = linksData.links || [];
      const cfg = examData.config || {};
      const hsClasses  = Utils.csvToArray(cfg.hs_classes);
      const hssClasses = Utils.csvToArray(cfg.hss_classes);

      // Build a lookup map for existing URLs
      const lookup = {};
      existingLinks.forEach(l => {
        lookup[l.school + '_' + l.class] = l.form_url;
      });

      const linkRow = (school, cls) => `
        <tr class="border-b border-slate-100">
          <td class="py-2 px-3 font-semibold">${esc(school.toUpperCase())} - Class ${esc(cls)}</td>
          <td class="py-2 px-3">
            <input data-school="${esc(school)}" data-class="${esc(cls)}"
                   class="link-input w-full border border-slate-300 rounded px-3 py-1.5 text-sm"
                   placeholder="https://forms.gle/..." value="${esc(lookup[school + '_' + cls] || '')}" />
          </td>
        </tr>
      `;

      const allRows = [
        ...hsClasses.map(c => linkRow('hs', c)),
        ...hssClasses.map(c => linkRow('hss', c))
      ].join('');

      container.innerHTML = `
        <p class="text-sm text-slate-600 mb-4">Set the Google Form URL for each class. These open when teachers click the "Marks Entry" button.</p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-100 text-left">
              <tr><th class="py-2 px-3">Class</th><th class="py-2 px-3">Google Form URL</th></tr>
            </thead>
            <tbody>${allRows || '<tr><td colspan="2" class="py-4 text-center text-slate-400">Configure HS/HSS classes first in Exam Configuration</td></tr>'}</tbody>
          </table>
        </div>
        <div class="mt-6">
          <button id="save-links" class="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2 rounded">Save Links</button>
        </div>
      `;

      document.getElementById('save-links').onclick = async () => {
        const links = [];
        container.querySelectorAll('.link-input').forEach(inp => {
          links.push({
            school: inp.dataset.school,
            class: inp.dataset.class,
            form_url: inp.value.trim()
          });
        });
        Utils.showLoading(true);
        try {
          await Api.saveFormLinks(links, Auth.getToken());
          Utils.showToast('Form links saved', 'success');
          cachedFormLinks = links;
        } catch (err) {
          Utils.showToast(err.message, 'error');
        } finally { Utils.showLoading(false); }
      };
    } catch (err) {
      container.innerHTML = '<p class="text-red-600">Failed to load: ' + esc(err.message) + '</p>';
    }
  }

  // ============================================================
  // HS / HSS RESULTS PAGES
  // ============================================================
  async function renderSchoolResults(school) {
    const containerId = school === 'hs' ? 'hs-class-buttons' : 'hss-class-buttons';
    const container = document.getElementById(containerId);
    container.innerHTML = '<p class="text-slate-500 col-span-full">Loading...</p>';

    try {
      const [examData, linksData] = await Promise.all([
        cachedExamConfig ? Promise.resolve({ config: cachedExamConfig }) : Api.getExamConfig(Auth.getToken()),
        Api.getFormLinks(Auth.getToken())
      ]);
      const cfg = examData.config || {};
      cachedExamConfig = cfg;
      const classes = Utils.csvToArray(school === 'hs' ? cfg.hs_classes : cfg.hss_classes);
      const linksMap = {};
      (linksData.links || []).forEach(l => { linksMap[l.school + '_' + l.class] = l.form_url; });

      if (!classes.length) {
        container.innerHTML = `<p class="col-span-full text-slate-500">No classes configured. Set ${esc(school.toUpperCase())} classes in Admin → Exam Configuration.</p>`;
        return;
      }

      container.innerHTML = classes.map(cls => {
        const formUrl = linksMap[school + '_' + cls] || '';
        const marksEntryBtn = formUrl
          ? `<a href="${esc(formUrl)}" target="_blank" rel="noopener" class="block text-center bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded shadow">📝 Marks Entry</a>`
          : `<button disabled class="block w-full text-center bg-slate-300 text-slate-500 font-semibold py-3 rounded cursor-not-allowed" title="Configure form URL in Admin">📝 Marks Entry (no URL)</button>`;

        return `
          <div class="bg-white rounded-2xl shadow p-5">
            <h2 class="text-xl font-bold text-brand-700 mb-4">Class ${esc(cls)}</h2>
            <div class="space-y-3">
              ${marksEntryBtn}
              <a href="#/${school}-marks-review?class=${encodeURIComponent(cls)}"
                 class="block text-center bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded shadow">
                📋 Marks Entry Review
              </a>
              <a href="#/${school}-result-preview?class=${encodeURIComponent(cls)}"
                 class="block text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded shadow">
                🏆 Result Preview
              </a>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = '<p class="col-span-full text-red-600">Failed to load: ' + esc(err.message) + '</p>';
    }
  }

  // ============================================================
  // MARKS REVIEW PAGE
  // ============================================================
  async function renderMarksReview(school, classType) {
    const title = document.getElementById('marks-review-title');
    title.textContent = `Marks Review — ${school.toUpperCase()} Class ${classType}`;

    const content = document.getElementById('marks-review-content');
    content.innerHTML = '<p class="text-slate-500">Loading marks...</p>';

    document.getElementById('marks-review-refresh').onclick = () => renderMarksReview(school, classType);

    try {
      const data = await Api.getMarks(school, classType, Auth.getToken());
      const marks = data.marks || [];
      cachedExamConfig = data.examConfig || cachedExamConfig;

      if (!marks.length) {
        content.innerHTML = '<p class="text-slate-500">No marks entered yet for this class.</p>';
        return;
      }

      // Determine subject columns: collect keys not starting with _, roll_no, class, stream
      const skipKeys = new Set(['roll_no', 'class', 'stream', '_name', '_section', '_stream']);
      const subjectKeys = Object.keys(marks[0]).filter(k => !skipKeys.has(k));

      const headerCells = ['Roll No', 'Name', 'Class']
        .concat(school === 'hss' ? ['Stream'] : [])
        .concat(subjectKeys);

      const headerHtml = headerCells.map(h => `<th class="py-2 px-3 bg-slate-100 text-left text-sm whitespace-nowrap">${esc(h)}</th>`).join('');

      const rowHtml = marks.map(m => {
        const cells = [
          esc(m.roll_no),
          esc(m._name || ''),
          esc(m.class)
        ];
        if (school === 'hss') cells.push(esc(m.stream || ''));
        subjectKeys.forEach(k => cells.push(esc(m[k] !== undefined && m[k] !== '' ? m[k] : '-')));
        return '<tr class="border-b border-slate-100">' +
               cells.map(c => `<td class="py-2 px-3 text-sm whitespace-nowrap">${c}</td>`).join('') +
               '</tr>';
      }).join('');

      content.innerHTML = `
        <table class="w-full">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${rowHtml}</tbody>
        </table>
      `;
    } catch (err) {
      content.innerHTML = '<p class="text-red-600">Failed to load: ' + esc(err.message) + '</p>';
    }
  }

  // ============================================================
  // RESULT PREVIEW PAGE
  // ============================================================
  async function renderResultPreview(school, classType) {
    const title = document.getElementById('result-preview-title');
    title.textContent = `Result Preview — ${school.toUpperCase()} Class ${classType}`;

    const content = document.getElementById('result-preview-content');
    content.innerHTML = '<p class="text-slate-500">Loading results...</p>';

    document.getElementById('result-preview-refresh').onclick = () => renderResultPreview(school, classType);
    document.getElementById('result-preview-print').onclick = () => window.print();

    try {
      const data = await Api.getMarks(school, classType, Auth.getToken());
      const marks = data.marks || [];
      const examConfig = data.examConfig || cachedExamConfig || {};
      cachedExamConfig = examConfig;

      if (!marks.length) {
        content.innerHTML = '<p class="text-slate-500">No marks available for this class.</p>';
        return;
      }

      const cards = marks.map(m => {
        const student = {
          roll_no: m.roll_no,
          name: m._name || '(unknown)',
          class: m.class,
          section: m._section || '',
          stream: m.stream || m._stream || ''
        };
        return renderResultCard(school, student, m, examConfig, false);
      }).join('');
      content.innerHTML = cards;
    } catch (err) {
      content.innerHTML = '<p class="text-red-600">Failed to load: ' + esc(err.message) + '</p>';
    }
  }

  return {
    renderHome,
    renderAdmin,
    renderSchoolResults,
    renderMarksReview,
    renderResultPreview
  };
})();
