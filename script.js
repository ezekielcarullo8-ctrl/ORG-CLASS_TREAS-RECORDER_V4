  /* =========================================================================
    APP LOCK / OFFLINE DEVICE ACTIVATION
    -------------------------------------------------------------------------
    How this works:
    1. On first launch on a phone, the app reads a unique Device ID (from the
        Capacitor Device plugin when running as the built Android app).
    2. The buyer sends you that Device ID (text/chat/etc — no internet needed
        inside the app itself).
    3. You run the separate "keygen" tool (kept privately, NOT shipped inside
        this app) to turn that Device ID into an Activation Code.
    4. The buyer types the code in. It's checked using the exact same formula
        that generated it. If it matches, the app unlocks and remembers it.
    5. If someone copies the APK/app data to a different phone (e.g. via
        Share It / Quick Share), that phone has a DIFFERENT Device ID, so the
        old activation code will not work there. They'd need to contact you
        and pay for their own code.

    IMPORTANT: Change LICENSE_SALT below to your own private secret before
    you build/sell this app, and keep it out of anything you share publicly.
    The GitHub Actions workflow obfuscates this file during the build so the
    salt/algorithm isn't sitting around in plain, readable text inside the
    APK — but a determined person could still eventually extract it. This is
    a deterrent against casual sharing, not an unbreakable lock.
    ========================================================================= */

  const LICENSE_SALT = "CHANGE-THIS-TO-YOUR-OWN-SECRET-2026";
  const PIN_SALT = "CHANGE-THIS-PIN-SALT-TOO-2026";

  function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash * 33) ^ str.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16).toUpperCase().padStart(8, "0");
  }

  function generateActivationCode(deviceId) {
    return simpleHash(deviceId + LICENSE_SALT);
  }

  function hashPin(pin) {
    return simpleHash(pin + PIN_SALT);
  }

  function isAndroidApp() {
    return !!(window.Capacitor && window.Capacitor.getPlatform() === "android");
  }

  async function getDeviceId() {
    if (isAndroidApp() && window.Capacitor.Plugins.Device) {
      try {
        const info = await window.Capacitor.Plugins.Device.getId();
        return info.identifier;
      } catch (e) {
        console.error("Device ID error:", e);
      }
    }
    // Fallback used only when testing in a regular PC browser (not the built app)
    let fallback = localStorage.getItem("dev_fallback_device_id");
    if (!fallback) {
      fallback = "DEV-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem("dev_fallback_device_id", fallback);
    }
    return fallback;
  }

  async function checkActivation() {
    const overlay = document.getElementById("activation-overlay");
    const androidApp = isAndroidApp();
    const deviceId = await getDeviceId();
    document.getElementById("device-id-display").innerText = deviceId;

    // Skip the lock while you're developing/testing in a regular browser.
    // The lock only activates inside the actual built Android app.
    if (!androidApp) {
      overlay.classList.add("hidden");
      checkPinLock();
      return;
    }

    const activatedFlag = localStorage.getItem("app_activated");
    const activatedDeviceId = localStorage.getItem("activated_device_id");

    if (activatedFlag === "true" && activatedDeviceId === deviceId) {
      overlay.classList.add("hidden");
      checkPinLock();
      return;
    }

    overlay.classList.remove("hidden");
    // checkPinLock() runs after a successful submitActivationCode() instead
  }

  function submitActivationCode() {
    const input = document.getElementById("activation-code-input").value.trim().toUpperCase();
    const deviceId = document.getElementById("device-id-display").innerText.trim();
    const errorEl = document.getElementById("activation-error");
    const expected = generateActivationCode(deviceId);

    if (!input) {
      errorEl.innerText = "Please enter the activation code.";
      return;
    }

    if (input === expected) {
      localStorage.setItem("app_activated", "true");
      localStorage.setItem("activated_device_id", deviceId);
      errorEl.innerText = "";
      document.getElementById("activation-overlay").classList.add("hidden");
      checkPinLock();
    } else {
      errorEl.innerText = "Invalid code for this device. Double-check with the seller.";
    }
  }

  /* =========================================================================
    PIN LOCK — a second, lighter-weight lock that guards the app every time
    it's opened (protects the treasurer's records from anyone who picks up
    the phone, separate from the one-time device activation above).
    ========================================================================= */

  async function checkPinLock() {
    if (!isAndroidApp()) return; // only enforced in the real built app

    const overlay = document.getElementById("pin-overlay");
    const storedHash = localStorage.getItem("treasurer_pin_hash");
    const titleEl = document.getElementById("pin-title");
    const subEl = document.getElementById("pin-subtext");

    if (!storedHash) {
      titleEl.innerText = "SET UP A PIN";
      subEl.innerText = "Create a 4-digit PIN to protect your records. You'll need it every time you open the app.";
      overlay.dataset.mode = "create";
    } else {
      titleEl.innerText = "ENTER PIN";
      subEl.innerText = "Enter your 4-digit PIN to continue.";
      overlay.dataset.mode = "verify";
    }
    overlay.classList.remove("hidden");
  }

  function submitPin() {
    const overlay = document.getElementById("pin-overlay");
    const inputEl = document.getElementById("pin-input");
    const input = inputEl.value.trim();
    const errorEl = document.getElementById("pin-error");

    if (!/^\d{4}$/.test(input)) {
      errorEl.innerText = "PIN must be exactly 4 digits.";
      return;
    }

    if (overlay.dataset.mode === "create") {
      localStorage.setItem("treasurer_pin_hash", hashPin(input));
      overlay.classList.add("hidden");
      inputEl.value = "";
      errorEl.innerText = "";
      return;
    }

    const storedHash = localStorage.getItem("treasurer_pin_hash");
    if (hashPin(input) === storedHash) {
      overlay.classList.add("hidden");
      inputEl.value = "";
      errorEl.innerText = "";
    } else {
      errorEl.innerText = "Incorrect PIN.";
      inputEl.value = "";
    }
  }

  function forgotPin() {
    const deviceId = document.getElementById("device-id-display").innerText.trim();
    const code = prompt("Forgot PIN — enter this device's Activation Code to reset it:");
    if (!code) return;
    const expected = generateActivationCode(deviceId);
    if (code.trim().toUpperCase() === expected) {
      localStorage.removeItem("treasurer_pin_hash");
      eveAlert("PIN reset. Please set a new PIN now.");
      checkPinLock();
    } else {
      eveAlert("That code doesn't match this device's activation code.");
    }
  }

  window.addEventListener("DOMContentLoaded", checkActivation);

  /* =========================================================================
    THEME + STYLE TOGGLES
    -------------------------------------------------------------------------
    Two independent preferences, each remembered in localStorage:
    - uiTheme: "light" | "dark"       → toggled by the moon/sun button
    - uiStyle: "default" | "cyberpunk" → toggled by the diamond/bolt button

    Cyberpunk mode overrides the palette to a fixed neon-on-dark look
    regardless of the light/dark choice, since the aesthetic depends on
    high-contrast glow effects.
    ========================================================================= */

  function applyThemeAndStyle() {
    const theme = localStorage.getItem("uiTheme") || "light";
    const style = localStorage.getItem("uiStyle") || "default";

    document.body.classList.toggle("theme-dark", theme === "dark");
    document.body.classList.toggle("style-cyberpunk", style === "cyberpunk");

    const themeBtn = document.getElementById("theme-toggle");
    const styleBtn = document.getElementById("style-toggle");
    if (themeBtn) {
      themeBtn.innerText = theme === "dark" ? "☀️" : "🌙";
      themeBtn.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    }
    if (styleBtn) {
      styleBtn.innerText = style === "cyberpunk" ? "⚡" : "◈";
      styleBtn.title = style === "cyberpunk" ? "Switch to default style" : "Switch to cyberpunk style";
    }
  }

     function toggleTheme() {
    const current = localStorage.getItem("uiTheme") || "light";
    const next = current === "light" ? "dark" : "light";
    localStorage.setItem("uiTheme", next);
    applyThemeAndStyle();

    if (window.EveAssistant && typeof EveAssistant.showMsg === 'function') {
      const reaction = next === 'dark'
        ? "Did the lights turn off?"
        : "Oh, nevermind";
      EveAssistant.showMsg(reaction);
    }
    if (window.EveAssistant && typeof EveAssistant.react === 'function') {
      // smile for light, look up for dark
      EveAssistant.react(next === 'light' ? 'smile' : 'lookup');
    }
  }
  window.addEventListener("DOMContentLoaded", applyThemeAndStyle);

  /* =========================================================================
    MAIN APP
    ========================================================================= */


  /* =========================================================================
   MODE SYSTEM — Org Treasurer vs Class Treasurer
   ========================================================================= */
const MODE_KEY = "treasurerMode";

function getMode()  { return localStorage.getItem(MODE_KEY) || ""; }
function isOrg()    { return getMode() === "org"; }
function isClass()  { return getMode() === "class"; }

function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
  location.reload();
}

function switchMode() {
  if (!confirm("Switching modes will reload the app. Continue?")) return;
  setMode(isOrg() ? "class" : "org");
}

function checkMode() {
  const overlay = document.getElementById("mode-overlay");
  const btn = document.getElementById("mode-toggle");
  if (!getMode()) {
    overlay.classList.remove("hidden");
    if (btn) btn.style.display = "none";
    return;
  }
  overlay.classList.add("hidden");
  if (btn) {
    btn.style.display = "flex";
    btn.innerText = isOrg() ? "ORG" : "CLASS";
  }
  applyMode();
}

/* Label helper: pass the org-mode text, get back the correct text */
function lbl(orgText) {
  if (isOrg()) return orgText;
  // Class-mode dictionary
  const map = {
    "Program Year Level": "Student",
    "Program Year Levels": "Students",
    "program year level": "student",
    "program year levels": "students",
    "Year Level": "Student",
    "Year Levels": "Students",
    "year level": "student",
    "year levels": "students",
    "Add Program & Year Level (Permanent)": "Add Student (Permanent)",
    "Search Year Level...": "Search Student...",
    "Search year level in this collection...": "Search student in this collection...",
    "Tap a program year level to view their balance across all collections": "Tap a student to view their balance across all collections",
    "Tap program year level to add a payment or edit": "Tap student to add a payment or edit",
    "Add All Year Level": "Add All Students",
    "Add Year Levels": "Add Students",
    "Select which year levels to enroll": "Select which students to enroll",
    "No year level added to this collection yet.": "No student added to this collection yet.",
    "No year levels in the database yet.": "No students in the database yet.",
    "No remaining year levels match your search.": "No remaining students match your search.",
    "Organization Info": "Class Info",
    "Organization Name": "Class/Section Name",
    "Treasurer Name": "Class Treasurer Name",
    "President / Adviser Name": "Adviser Name",
    "Save Organization Info": "Save Class Info",
    "Digital Ledger": "Class Ledger",
    "This copy of the app is not activated on this device yet.": "This copy of the app is not activated on this device yet.",
    "0 program year level in the database": "0 student in the database",
    "1 program year level in the database": "1 student in the database",
    "They will also be removed from all collections.": "They will also be removed from all collections.",
    "Payment from": "Payment from",
    "Cash Book": "Class Fund",
    "Projects & Events": "Class Activities"
  };
  return map[orgText] || orgText;
}

function applyMode() {
  // Nav label
const navStudents = document.querySelector('#nav-students');
if (navStudents) navStudents.innerHTML = `<span>🎓</span>${lbl("Year Level")}`;

// Modal title & description
const addAllTitle = document.querySelector('#add-all-modal h3');
if (addAllTitle) addAllTitle.innerText = lbl("Add Year Levels");
const addAllDesc = document.querySelector('#add-all-modal .note');
if (addAllDesc) addAllDesc.innerHTML = `Select which ${lbl("year levels").toLowerCase()} to enroll in <b id="add-all-cat-name">this collection</b>. Search to filter the list.`;

// Student input placeholder
const newStudentInput = document.getElementById('new-student-name');
if (newStudentInput) newStudentInput.placeholder = isOrg() ? "e.g. BSIT 2" : "e.g. Juan Dela Cruz";
    // Nav visibility
  const cashbookNav = document.getElementById("nav-cashbook");
  const classfundNav = document.getElementById("nav-classfund");
  if (cashbookNav) cashbookNav.classList.toggle("hidden", isClass());
  if (classfundNav) classfundNav.classList.toggle("hidden", isOrg());
  
  // Static header relabeling
  const dbAdd = document.getElementById("db-add-header");
  if (dbAdd) dbAdd.innerText = lbl("Add Program & Year Level (Permanent)");

  const dbList = document.getElementById("db-list-header");
  if (dbList) dbList.innerText = lbl("Student Database"); // same text, but keeps pattern

  // Placeholders
  const sSearch = document.getElementById("search-students-db");
  if (sSearch) sSearch.placeholder = lbl("Search Year Level...");

  const iSearch = document.getElementById("item-search");
  if (iSearch) iSearch.placeholder = lbl("Search year level in this collection...");

  const stSearch = document.getElementById("student-search");
  if (stSearch) stSearch.placeholder = lbl("Search or Select Year Level...");

  // Add-tab tip
  const tip = document.querySelector(".add-tab-note");
  if (tip) {
    tip.innerHTML = `<b>💡 Tip:</b> ${lbl("Year Levels")} must be added permanently in the <b>${lbl("Year Level")}</b> tab before they appear in dropdowns. Payments recorded here automatically sync to your ${isOrg() ? 'Cash Book ledger' : 'class record'}.`;
  }

  // Add-all button text
  const addAllBtn = document.querySelector(".mode-add-all-btn");
  if (addAllBtn) addAllBtn.innerText = lbl("Add All Year Level");

  // Org-only sections in Summary
  const summarySection = document.getElementById("summary-section");
  if (summarySection) {
    const headers = summarySection.querySelectorAll("h3");
    headers.forEach(h => {
      if (h.innerText.includes("Organization Info")) h.innerText = lbl("Organization Info");
      if (h.innerText.includes("Financial Statement") && isClass()) {
        h.style.display = "none";
        let el = h.nextElementSibling;
        while (el && el.tagName !== "H3") {
          if (el.tagName === "DIV" || el.tagName === "P" || el.tagName === "BUTTON") el.style.display = "none";
          el = el.nextElementSibling;
        }
      }
    });
  }

  // Input placeholders in Summary / Org Info
  const orgName = document.getElementById("org-name");
  if (orgName) orgName.placeholder = lbl("Organization Name") + " (e.g. BSIT 2A)";
  const orgTreas = document.getElementById("org-treasurer");
  if (orgTreas) orgTreas.placeholder = lbl("Treasurer Name");
  const orgPres = document.getElementById("org-president");
  if (orgPres) orgPres.placeholder = lbl("President / Adviser Name");

  // Re-render dynamic views so labels update
  renderStudents();
  renderCategories();
  renderSummary();
}

  const STORAGE_KEY = "treasurerRecorderEzekiel";
  let db = JSON.parse(localStorage.getItem(STORAGE_KEY)) || { students: [], categories: {} };

  // Bring any old or new-format backup up to the current data shape.
  // Safe to call repeatedly (on load and after importing a backup).
    function migrateDb() {
    db.students = (db.students || []).map(s =>
      typeof s === "string" ? { name: s } : { name: s.name || "Unknown" }
    );
    db.categories = db.categories || {};

    db.cashbook = db.cashbook || { openingBalance: 0, transactions: [] };
    db.cashbook.openingBalance = db.cashbook.openingBalance || 0;
    db.cashbook.transactions = db.cashbook.transactions || [];

    db.projects = db.projects || [];
    db.orgSettings = db.orgSettings || { orgName: "", treasurerName: "", presidentName: "", schoolYear: "" };

        db.classFund = db.classFund || { weeklyDue: 20, startDate: new Date().toISOString().slice(0, 10), records: {}, transactions: [] };
    db.classFund.weeklyDue = db.classFund.weeklyDue || 20;
    db.classFund.startDate = db.classFund.startDate || new Date().toISOString().slice(0, 10);
    db.classFund.records = db.classFund.records || {};
    db.classFund.transactions = db.classFund.transactions || [];
  }

    function recordClassFundExpense() {
    const date = document.getElementById("cf-expense-date").value || new Date().toISOString().slice(0, 10);
    const desc = document.getElementById("cf-expense-desc").value.trim();
    const amount = round2(parseFloat(document.getElementById("cf-expense-amount").value) || 0);
    const note = document.getElementById("cf-expense-note").value.trim();

    if (!desc) return eveAlert("Please enter what the expense was for.");
    if (amount <= 0) return eveAlert("Please enter a valid amount.");

    db.classFund.transactions.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      type: "expense",
      date,
      description: desc,
      amount,
      note
    });

    saveData();
    renderClassFund();
    eveAlert(`Expense of ${peso(amount)} recorded.`);
  }

  function deleteClassFundTxn(id) {
    if (!confirm("Delete this expense?")) return;
    db.classFund.transactions = db.classFund.transactions.filter(t => String(t.id) !== String(id));
    saveData();
    renderClassFund();
  }

  migrateDb();

  let currentCategory = "";
  let editingIndex = null;
  let addAllSelected = new Set();

  // ---------- HELPERS ----------

  /**
   * Escape a string for safe insertion into HTML text content and attributes.
   * Handles &, <, >, ", and ' to prevent XSS and broken markup.
   */
  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  function peso(n) {
    return `₱${(n || 0).toFixed(2)}`;
  }

  // Rounds to 2 decimal places to avoid floating-point drift from repeated
  // addition (e.g. 0.1 + 0.2 style errors) building up over many payments.
  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // Finds an existing category name case-insensitively (so "Field Trip" and
  // "field trip" are treated as the same collection instead of duplicates).
  function findCategoryKeyCI(name) {
    const lower = name.toLowerCase();
    return Object.keys(db.categories).find(k => k.toLowerCase() === lower) || null;
  }

  // ---------- PAGE SWITCH ----------
  function switchTab(id, btn) {
  if (id === 'cashbook-section' && isClass()) return;
  if (id === 'classfund-section' && isOrg()) return;

  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (id === 'inventory-section') {
    backToCategories();
  } else if (id === 'database-section') {
    backToStudentList();
    renderStudents();
  } else if (id === 'cashbook-section') {
    document.getElementById('project-detail-view').classList.add('hidden');
    document.getElementById('projects-view').classList.add('hidden');
    document.getElementById('cashbook-main-view').classList.remove('hidden');
    renderCashbookSummary();
    renderCashbookList();
    renderProjects();
  } else if (id === 'classfund-section') {
    renderClassFund();
  } else if (id === 'summary-section') {
    loadOrgSettingsForm();
    renderSummary();
  }
}
  

  // ================= STUDENTS (PERMANENT DATABASE) =================

  function addStudent() {
  const input = document.getElementById("new-student-name");
  const name = input.value.trim();
  if (!name) return eveAlert("Please enter a " + lbl("year level").toLowerCase() + " name");
  if (db.students.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    return eveAlert("This " + lbl("year level").toLowerCase() + " is already in the database");
  }
  db.students.push({ name });
  saveData();
  renderStudents();
  input.value = "";
}

  /* =========================================================================
    CLASS FUND — Independent Weekly Tracker (Class Mode)
    ========================================================================= */

  function getExpectedWeeks(startDateStr) {
    if (!startDateStr) return 0;
    const start = new Date(startDateStr + "T00:00:00");
    const now = new Date();
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    if (now < start) return 0;
    const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7) + 1;
  }

  function getClassFundExpected(studentName) {
    const cf = db.classFund;
    if (!cf.weeklyDue || !cf.startDate) return 0;
    return round2(getExpectedWeeks(cf.startDate) * cf.weeklyDue);
  }

  function getMissedWeeks(studentName) {
    const cf = db.classFund;
    const expected = getClassFundExpected(studentName);
    const paid = cf.records[studentName] ? cf.records[studentName].paid : 0;
    if (paid >= expected) return 0;
    return Math.ceil((expected - paid) / cf.weeklyDue);
  }

  function getLastPaymentDate(studentName) {
    const rec = db.classFund.records[studentName];
    if (!rec || !rec.history || rec.history.length === 0) return null;
    return rec.history[rec.history.length - 1].date;
  }

  function saveClassFundSettings() {
    const weekly = round2(parseFloat(document.getElementById("cf-weekly-due").value) || 0);
    const startDate = document.getElementById("cf-start-date").value;
    if (weekly <= 0) return eveAlert("Please enter a valid weekly amount.");
    if (!startDate) return eveAlert("Please select a collection start date.");
    db.classFund.weeklyDue = weekly;
    db.classFund.startDate = startDate;
    saveData();
    renderClassFund();
    eveAlert("Class Fund settings saved.");
  }

  function addAllToClassFund() {
    const cf = db.classFund;
    let added = 0, skipped = 0;
    db.students.forEach(s => {
      if (!cf.records[s.name]) {
        cf.records[s.name] = { paid: 0, history: [] };
        added++;
      } else {
        skipped++;
      }
    });
    if (added === 0) return eveAlert(skipped > 0 ? "All students are already enrolled." : "No students in the database. Add them in the Students tab first.");
    saveData();
    renderClassFund();
    eveAlert(`${added} student(s) enrolled.${skipped > 0 ? ' (' + skipped + ' already enrolled)' : ''}`);
  }

    function resetClassFundData() {
    if (!confirm("Reset all Class Fund records? This clears every payment, expense, and student enrollment.")) return;
    db.classFund.records = {};
    db.classFund.transactions = [];
    saveData();
    renderClassFund();
  }

  function recordClassFundPayment(studentName) {
  const safeId = studentName.replace(/\s+/g, '-');
  const dateVal = document.getElementById(`cf-date-${safeId}`).value;
  const amount = round2(parseFloat(document.getElementById(`cf-pay-${safeId}`).value) || 0);
  const note = document.getElementById(`cf-note-${safeId}`).value.trim();
  if (amount <= 0) return eveAlert("Please enter a valid amount.");

  const cf = db.classFund;
  if (!cf.records[studentName]) cf.records[studentName] = { paid: 0, history: [] };
  const rec = cf.records[studentName];

  rec.paid = round2(rec.paid + amount);
  rec.history.push({
    amount,
    date: dateVal || new Date().toISOString().slice(0, 10),
    note: note || "Class Fund",
    time: new Date().toLocaleTimeString()
  });

  saveData();
  renderClassFund();
}

  function deleteClassFundPayment(studentName, idx) {
    const rec = db.classFund.records[studentName];
    if (!rec || !rec.history[idx]) return;
    if (!confirm("Delete this payment entry?")) return;
    const removed = rec.history.splice(idx, 1)[0];
    rec.paid = round2(Math.max(0, rec.paid - removed.amount));
    saveData();
    renderClassFund();
  }

  function deleteClassFundStudent(name) {
    if (!confirm(`Remove ${name} from Class Fund tracking? Their history will be deleted.`)) return;
    delete db.classFund.records[name];
    saveData();
    renderClassFund();
  }

  function editClassFundPayment(studentName, histIdx) {
  const rec = db.classFund.records[studentName];
  if (!rec || !rec.history[histIdx]) return;
  const entry = rec.history[histIdx];

  const newAmountStr = prompt(`Edit payment amount (was ${peso(entry.amount)}):`, entry.amount);
  if (newAmountStr === null) return;
  const newAmount = parseFloat(newAmountStr);
  if (isNaN(newAmount) || newAmount < 0) return eveAlert("Please enter a valid amount.");

  const newDate = prompt(`Edit payment date (YYYY-MM-DD) (was ${entry.date}):`, entry.date);
  if (newDate === null) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return eveAlert("Invalid date format. Use YYYY-MM-DD.");

  const newNote = prompt(`Edit note (was ${entry.note || 'Class Fund'}):`, entry.note || 'Class Fund');
  if (newNote === null) return;

  rec.paid = round2(rec.paid - entry.amount + newAmount);
  if (rec.paid < 0) rec.paid = 0;

  entry.amount = round2(newAmount);
  entry.date = newDate;
  entry.note = newNote || "Class Fund";

  saveData();
  renderClassFund();
}

  /* -------------------------------------------------------------------------
   WEEKLY BREAKDOWN — derives per-week payment status from history
   ------------------------------------------------------------------------- */
function getWeeklyBreakdown(history, weeklyDue) {
  const sorted = [...(history || [])].sort((a, b) =>
    (a.date || "").localeCompare(b.date || "")
  );
  const weeks = [];
  let currentWeek = 0;
  let weekPaid = 0;
  let weekDate = null;

  for (const entry of sorted) {
    let remaining = entry.amount;
    while (remaining > 0) {
      const space = weeklyDue - weekPaid;
      const alloc = Math.min(remaining, space);
      weekPaid += alloc;
      if (!weekDate) weekDate = entry.date;
      remaining -= alloc;

      if (weekPaid >= weeklyDue) {
        weeks[currentWeek] = { amount: weekPaid, date: weekDate, status: "full" };
        currentWeek++;
        weekPaid = 0;
        weekDate = null;
      }
    }
  }

  if (weekPaid > 0) {
    weeks[currentWeek] = { amount: weekPaid, date: weekDate, status: "partial" };
  }
  return weeks;
}

function getWeekRangeLabel(startDateStr, weekIndex) {
  const start = new Date(startDateStr + "T00:00:00");
  start.setDate(start.getDate() + (weekIndex * 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const day = start.toLocaleDateString('en-US', { weekday: 'long' });
  return {
    label: `Week ${weekIndex + 1} (${fmt(start)} - ${fmt(end)})`,
    startFmt: fmt(start),
    endFmt: fmt(end),
    dayName: day
  };
}

async function exportClassFundWeeklyCSV() {
  const cf = db.classFund;
  if (!cf.startDate || !cf.weeklyDue) {
    return eveAlert("Please set the weekly due amount and start date first.");
  }

  const totalWeeks = getExpectedWeeks(cf.startDate);
  if (totalWeeks === 0) return eveAlert("No collection weeks to export yet.");

  let csv = "";

  for (let w = 0; w < totalWeeks; w++) {
    const range = getWeekRangeLabel(cf.startDate, w);
    csv += `\n${range.label}\n`;
    csv += `Name,Date / Day,Payment Status\n`;

    const students = Object.keys(cf.records).sort();
    for (const name of students) {
      const rec = cf.records[name];
      const breakdown = getWeeklyBreakdown(rec.history || [], cf.weeklyDue);
      const weekInfo = breakdown[w] || { amount: 0, date: null, status: "unpaid" };

      let dateStr = "-";
      if (weekInfo.date) {
        const d = new Date(weekInfo.date + "T00:00:00");
        dateStr = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${d.toLocaleDateString('en-US', { weekday: 'long' })})`;
      }

      let statusStr = "Not Paid";
      if (weekInfo.status === "full") {
        statusStr = "Fully Paid";
      } else if (weekInfo.status === "partial") {
        const short = round2(cf.weeklyDue - weekInfo.amount);
        statusStr = `Short by ${peso(short)}`;
      }

      csv += `"${name}","${dateStr}","${statusStr}"\n`;
    }
  }

  // Optional trailing summary sheet
  csv += `\n\nSUMMARY\nName,Total Paid,Total Expected,Overall Status\n`;
  for (const name of Object.keys(cf.records).sort()) {
    const rec = cf.records[name];
    const expected = getClassFundExpected(name);
    const paid = rec.paid || 0;
    const balance = round2(expected - paid);
    let status = "Fully Paid";
    if (balance > 0) status = `Short by ${peso(balance)}`;
    else if (balance < 0) status = `Overpaid by ${peso(Math.abs(balance))}`;
    csv += `"${name}",${paid.toFixed(2)},${expected.toFixed(2)},"${status}"\n`;
  }

  const fileName = `class-fund-weekly-${new Date().toISOString().slice(0, 10)}.csv`;
  await exportFileCrossPlatform(csv, fileName, "text/csv", "Export Weekly Class Fund");
}

     function renderClassFund() {
    const box = document.getElementById("classfund-list");
    const summary = document.getElementById("classfund-summary");
   const alertBox = document.getElementById("cf-missed-alert");
    const weekInfo = document.getElementById("cf-week-info");
    const txnBox = document.getElementById("cf-txn-log");
    if (!box || !summary) return;

    // Remember expanded cards
    const expandedIds = new Set();
    document.querySelectorAll('.cf-student-card.expanded').forEach(el => expandedIds.add(el.id));

    const cf = db.classFund;
    const weekly = cf.weeklyDue || 0;

    // Sync settings inputs
    const wInput = document.getElementById("cf-weekly-due");
    const sInput = document.getElementById("cf-start-date");
    if (wInput && (!wInput.value || wInput.value == "0")) wInput.value = weekly > 0 ? weekly : "";
    if (sInput && !sInput.value && cf.startDate) sInput.value = cf.startDate;

    const currentWeek = getExpectedWeeks(cf.startDate);
    if (weekInfo) {
      weekInfo.innerText = cf.startDate
        ? `Current Collection Week: Week ${currentWeek} • Weekly Due: ${peso(weekly)}`
        : "Set your weekly due and start date above to begin tracking.";
      weekInfo.style.color = cf.startDate ? "var(--accent)" : "var(--muted)";
    }

    let students = Object.keys(cf.records).sort();
    const searchTerm = (document.getElementById("cf-search").value || "").toLowerCase();
    if (searchTerm) students = students.filter(n => n.toLowerCase().includes(searchTerm));

    let totalExpected = 0, totalPaid = 0, missedCount = 0;
    students.forEach(name => {
      totalExpected += getClassFundExpected(name);
      totalPaid += cf.records[name].paid;
      missedCount += getMissedWeeks(name);
    });
    const totalUnpaid = round2(totalExpected - totalPaid);

    // Expenses from class fund transactions
    const totalExpenses = round2((cf.transactions || [])
      .filter(t => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0));
    const netBalance = round2(totalPaid - totalExpenses);

    // Summary cards: Collected | Expenses | Net Balance | Enrolled
    summary.innerHTML = `
      <div class="summary-card"><h4>Total Collected</h4><p style="color:var(--success)">${peso(totalPaid)}</p></div>
      <div class="summary-card"><h4>Total Expenses</h4><p style="color:var(--danger)">${peso(totalExpenses)}</p></div>
      <div class="summary-card"><h4>Net Balance</h4><p style="color:${netBalance < 0 ? 'var(--danger)' : 'var(--accent-dark)'}">${peso(netBalance)}</p></div>
      <div class="summary-card"><h4>Enrolled</h4><p>${students.length}</p></div>
    `;

    if (missedCount > 0 && totalUnpaid > 0) {
      alertBox.innerHTML = `
        <div class="missed-box">
          <h4>⚠ Collection Alert</h4>
          <p>${missedCount} total missed week(s) across all students</p>
          <span class="note">Unpaid student balance: ${peso(totalUnpaid)}</span>
        </div>
      `;
    } else {
      alertBox.innerHTML = "";
    }

    document.getElementById("cf-count").innerText = `${students.length} student(s) enrolled in Class Fund`;

    // --- Student Cards (collapsed by default) ---
    if (students.length === 0) {
      box.innerHTML = `<p class="note">No students enrolled yet. Tap <b>+ Add All Students</b> above, or make sure students exist in the <b>Students</b> tab.</p>`;
    } else {
      box.innerHTML = students.map(name => {
        const rec = cf.records[name];
        const expected = getClassFundExpected(name);
        const missed = getMissedWeeks(name);
        const balance = round2(expected - rec.paid);
        const lastPay = getLastPaymentDate(name);
        const isActiveStudent = db.students.some(s => s.name === name);
        const safeId = name.replace(/\s+/g, '-');
        const isExpanded = expandedIds.has(`cf-card-${safeId}`);

        let statusBadge = "";
        if (missed > 2) statusBadge = `<span class="cf-badge cf-badge-danger">${missed} weeks missed</span>`;
        else if (missed > 0) statusBadge = `<span class="cf-badge cf-badge-warn">${missed} week${missed > 1 ? 's' : ''} missed</span>`;
        else if (balance < 0) statusBadge = `<span class="cf-badge cf-badge-info">Overpaid</span>`;
        else statusBadge = `<span class="cf-badge cf-badge-success">All Paid</span>`;

        const lastPayText = lastPay ? `Last paid: ${formatDisplayDate(lastPay)}` : "Never paid";
        const progressPct = expected > 0 ? Math.min(100, (rec.paid / expected) * 100) : 0;
        const progressColor = balance > 0
          ? 'linear-gradient(90deg, var(--warning), var(--danger))'
          : 'linear-gradient(90deg, var(--success), var(--accent))';

        return `
          <div class="cf-student-card ${isExpanded ? 'expanded' : ''}" id="cf-card-${safeId}" onclick="toggleClassFundDetail('${safeId}')">
            <div class="cf-student-header">
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:4px;">
                  <b>${esc(name)}</b>
                  ${!isActiveStudent ? '<span class="cf-badge cf-badge-info">Not in DB</span>' : ''}
                  ${statusBadge}
                </div>
                <div class="note">${lastPayText}</div>
              </div>
              <div style="display:flex; align-items:center; margin-left:auto;">
                <div style="text-align:right; flex-shrink:0; margin-left:12px;">
                  <div style="font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:18px; color:${balance > 0 ? 'var(--danger)' : 'var(--success)'}">${peso(rec.paid)}</div>
                  <div class="note">of ${peso(expected)}</div>
                  ${balance > 0 ? `<div style="color:var(--danger); font-size:12px; font-weight:600;">-${peso(balance)}</div>` : ''}
                </div>
                <div class="cf-chevron">▼</div>
              </div>
            </div>

            <div class="cf-details" id="cf-details-${safeId}" onclick="event.stopPropagation()">
              
              <div class="progress-bar">
                <div class="progress-fill" style="width:${progressPct}%; background: ${progressColor};"></div>
              </div>
              <div class="cf-payment-row" style="flex-wrap:wrap;">
  <input type="date" id="cf-date-${safeId}" value="${new Date().toISOString().slice(0, 10)}" style="flex:1 1 110px; margin-bottom:0;">
  <input type="number" id="cf-pay-${safeId}" placeholder="Amount" step="0.01" style="flex:1 1 110px; margin-bottom:0;">
  <input type="text" id="cf-note-${safeId}" placeholder="Note (optional)" style="flex:2 1 150px; margin-bottom:0;">
  <button onclick="recordClassFundPayment('${esc(name)}')" style="width:auto; padding:0 18px; white-space:nowrap; flex:0 0 auto;">Record</button>
</div>
                              ${rec.history.length > 0 ? `
                <div class="cf-history">
                  <p class="note" style="margin-bottom:8px;"><b>Payment History</b></p>
                  ${rec.history.slice().reverse().map((h, idx) => {
                    const realIdx = rec.history.length - 1 - idx;
                    return `
                      <div class="history-entry">
                        <span>${peso(h.amount)} — ${esc(h.date)}${h.note ? ' • ' + esc(h.note) : ''}</span>
                        <div class="history-actions">
                          <button class="mini-btn mini-delete" onclick="deleteClassFundPayment('${esc(name)}', ${realIdx})">DEL</button>
                        </div>
                      </div>
                    `;
                  }).join("")}
                </div>
              ` : ''}
              <button class="del-btn" onclick="deleteClassFundStudent('${esc(name)}')" style="margin-top:10px; width:100%;">Remove from Class Fund</button>
            </div>
          </div>
        `;
      }).join("");
    }

    // --- Class Fund Ledger (running balance) ---
    if (txnBox) {
      // Build income entries from student histories
      const incomeEntries = [];
      Object.entries(cf.records).forEach(([name, rec]) => {
        rec.history.forEach((h, idx) => {
          incomeEntries.push({
            sortKey: `${h.date || "0000-00-00"}-INC-${String(idx).padStart(4, '0')}`,
            type: "income",
            date: h.date,
            description: `Payment from ${name}`,
            amount: h.amount,
            note: h.note || "",
            deletable: false
          });
        });
      });

      // Expense entries
      const expenseEntries = (cf.transactions || [])
        .filter(t => t.type === "expense")
        .map(t => ({
          sortKey: `${t.date || "0000-00-00"}-EXP-${t.id}`,
          ...t,
          deletable: true
        }));

      const allTxns = [...incomeEntries, ...expenseEntries].sort((a, b) =>
        a.sortKey.localeCompare(b.sortKey)
      );

      // Compute running balance chronologically, then reverse for display
      let running = 0;
      const withBal = allTxns.map(t => {
        running = round2(running + (t.type === "income" ? t.amount : -t.amount));
        return { ...t, balance: running };
      }).reverse();

      if (withBal.length === 0) {
        txnBox.innerHTML = `<p class="note">No transactions yet. Record student payments or expenses above.</p>`;
      } else {
        txnBox.innerHTML = withBal.map(t => {
          const sign = t.type === "income" ? "+" : "−";
          const color = t.type === "income" ? "var(--success)" : "var(--danger)";
          const typeLabel = `<span style="font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted); margin-left:6px;">${t.type}</span>`;
          const deleteBtn = t.deletable
            ? `<button class="mini-btn mini-delete" onclick="deleteClassFundTxn('${esc(t.id)}')" style="margin-top:4px;">DEL</button>`
            : '';

          return `
            <div class="item-row" style="cursor:default;">
              <div>
                <b>${esc(t.description)}</b>${typeLabel}<br>
                <span class="note">${esc(t.date)}${t.note ? ' • ' + esc(t.note) : ''}</span>
              </div>
              <div style="text-align:right;">
                <span style="color:${color}; font-weight:900;">${sign}${peso(t.amount)}</span><br>
                <span class="note">Bal: ${peso(t.balance)}</span>
                ${deleteBtn}
              </div>
            </div>
          `;
        }).join("");
      }
    }

    // Default expense date to today
    const expDateInput = document.getElementById("cf-expense-date");
    if (expDateInput && !expDateInput.value) {
      expDateInput.value = new Date().toISOString().slice(0, 10);
    }
  }

  function toggleClassFundDetail(safeId) {
  const card = document.getElementById(`cf-card-${safeId}`);
  if (card) card.classList.toggle('expanded');
}

  function deleteStudent(name) {
  const label = lbl("year level").toLowerCase();
  if (!confirm(`Remove "${name}" from the database? They will also be removed from all collections.`)) return;
  Object.keys(db.categories).forEach(cat => {
    db.categories[cat].records = db.categories[cat].records.filter(r => r.name !== name);
  });
  db.students = db.students.filter(s => s.name !== name);
  saveData();
  renderStudents();
  renderSummary();
}

  function renderStudents() {
    const list = document.getElementById("student-db-list");
    const searchTerm = (document.getElementById("search-students-db").value || "").toLowerCase();
    const matches = [...db.students]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter(s => s.name.toLowerCase().includes(searchTerm));

      const countLabel = db.students.length === 1
    ? `1 ${lbl("year level").toLowerCase()} in the database`
    : `${db.students.length} ${lbl("year levels").toLowerCase()} in the database`;
  document.getElementById("student-count").innerText = countLabel;

  // ... inside the if (matches.length === 0) block:
  if (matches.length === 0) {
    list.innerHTML = `<p class="note">${db.students.length === 0 ? 'No ' + lbl("year level").toLowerCase() + ' added yet.' : 'No matching ' + lbl("year level").toLowerCase() + '.'}</p>`;
    return;
  }

    list.innerHTML = matches.map(s => `
      <div class="card" data-student-name="${esc(s.name)}">
        <span>${esc(s.name)}</span>
        <button class="del-btn" data-action="delete-student" data-name="${esc(s.name)}">X</button>
      </div>`
    ).join("");

    // Attach event listeners instead of inline onclick
    list.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="delete-student"]')) return;
        showStudentProfile(card.dataset.studentName);
      });
    });
    list.querySelectorAll('[data-action="delete-student"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteStudent(btn.dataset.name);
      });
    });
  }

  // ================= STUDENT PROFILE (BALANCE ACROSS ALL COLLECTIONS) =================
  function showStudentProfile(name) {
    const student = db.students.find(s => s.name === name);
      if (!student) {
    eveAlert(lbl("Year Level") + " not found. They may have been deleted.");
    return;
  }

    document.getElementById("student-list-view").classList.add("hidden");
    document.getElementById("student-profile-view").classList.remove("hidden");
    document.getElementById("profile-student-name").innerText = esc(name);
    renderStudentProfile(name);
  }

  function backToStudentList() {
    document.getElementById("student-profile-view").classList.add("hidden");
    document.getElementById("student-list-view").classList.remove("hidden");
  }

  function renderStudentProfile(name) {
    const cats = Object.keys(db.categories).sort((a, b) => a.localeCompare(b));
    let totalDue = 0, totalPaid = 0;

    const rows = cats.map(cat => {
      const c = db.categories[cat];
      const rec = c.records.find(r => r.name === name);
      if (!rec) return "";
      totalDue += rec.due;
      totalPaid += rec.paid;
      const balance = round2(rec.due - rec.paid);

      let statusLabel, statusColor;
      if (balance < 0) { statusLabel = "OVERPAID"; statusColor = "#3B6E8F"; }
      else if (balance === 0) { statusLabel = "PAID"; statusColor = "#2F7D53"; }
      else if (rec.paid > 0) { statusLabel = "PARTIAL"; statusColor = "#B8872F"; }
      else { statusLabel = "UNPAID"; statusColor = "#B3423B"; }

      return `
        <div class="breakdown-card">
          <div class="breakdown-top"><b>${esc(cat)}</b><span style="color:${statusColor};">${peso(rec.paid)} / ${peso(rec.due)} — ${statusLabel}</span></div>
        </div>`;
    }).filter(Boolean).join("");

    const overallBalance = round2(totalDue - totalPaid);

    document.getElementById("profile-summary").innerHTML = `
      <div class="summary-card"><h4>Total Due</h4><p>${peso(totalDue)}</p></div>
      <div class="summary-card"><h4>Total Paid</h4><p>${peso(totalPaid)}</p></div>
      <div class="summary-card" style="grid-column: span 2;"><h4>Overall Balance</h4><p style="color:${overallBalance > 0 ? '#B3423B' : '#2F7D53'}">${peso(overallBalance)}</p></div>
    `;

     document.getElementById("profile-breakdown").innerHTML = rows || `<p class="note">This ${lbl("year level").toLowerCase()} isn't part of any collection yet.</p>`;
  }

  // ================= CATEGORY (COLLECTION) PICKER — used in ADD tab =================
  function addCategory() {
    const catInput = document.getElementById("new-category");
    const dueInput = document.getElementById("new-category-due");
    const cat = catInput.value.trim();
    const due = round2(parseFloat(dueInput.value) || 0);

    if (!cat) return eveAlert("Please enter a collection name (e.g. Newsette Fee)");
    if (findCategoryKeyCI(cat)) return eveAlert("This collection already exists (names are not case-sensitive).");
    if (due <= 0) return eveAlert("Please enter the default amount due per student");

    db.categories[cat] = { amountDue: due, records: [] };
    catInput.value = "";
    dueInput.value = "";
    saveData();
    eveAlert("Collection Added!");
  }

  function renameCategory() {
    const newNameRaw = prompt(`Rename "${currentCategory}" to:`, currentCategory);
    if (newNameRaw === null) return;
    const newName = newNameRaw.trim();

    if (!newName) return eveAlert("Name cannot be empty.");
    if (newName === currentCategory) return;

    if (newName.toLowerCase() !== currentCategory.toLowerCase() && findCategoryKeyCI(newName)) {
      return eveAlert("A collection with that name already exists.");
    }

    db.categories[newName] = db.categories[currentCategory];
    delete db.categories[currentCategory];
    currentCategory = newName;
    saveData();
    document.getElementById("item-view-title").innerText = newName.toUpperCase();
    renderItemList();
  }

  function filterCategories() {
    const input = document.getElementById("category-search").value.toLowerCase();
    const dropdown = document.getElementById("category-list-dropdown");
    const cats = Object.keys(db.categories).filter(c => c.toLowerCase().includes(input));
    dropdown.innerHTML = "";

    if (Object.keys(db.categories).length === 0) {
      dropdown.innerHTML = `<div style="color:#6E7A72; cursor:default;">No collections yet — add one above first.</div>`;
    } else if (cats.length === 0) {
      dropdown.innerHTML = `<div style="color:#6E7A72; cursor:default;">No collection found</div>`;
    } else {
      cats.forEach(c => {
        dropdown.innerHTML += `<div data-cat="${esc(c)}">${esc(c)} <span class="note">(Due: ${peso(db.categories[c].amountDue)})</span></div>`;
      });
      // Attach listeners
      dropdown.querySelectorAll('div[data-cat]').forEach(div => {
        div.addEventListener('click', () => selectCategory(div.dataset.cat));
      });
    }
    dropdown.classList.add("show");
  }

  function selectCategory(cat) {
    document.getElementById("category-search").value = cat;
    document.getElementById("category-select").value = cat;
    document.getElementById("category-list-dropdown").classList.remove("show");
  }

  // ================= STUDENT PICKER — used in ADD tab =================
  function filterStudentPicker() {
    const input = document.getElementById("student-search").value.toLowerCase();
    const dropdown = document.getElementById("student-list-dropdown");
    const matches = db.students.filter(s => s.name.toLowerCase().includes(input));
    dropdown.innerHTML = "";

    if (db.students.length === 0) {
      dropdown.innerHTML = `<div style="color:#6E7A72; cursor:default;">No students yet — add them in the Students tab first.</div>`;
    } else if (matches.length === 0) {
      dropdown.innerHTML = `<div style="color:#6E7A72; cursor:default;">No match found</div>`;
    } else {
      matches.forEach(s => {
        dropdown.innerHTML += `<div data-student="${esc(s.name)}">${esc(s.name)}</div>`;
      });
      dropdown.querySelectorAll('div[data-student]').forEach(div => {
        div.addEventListener('click', () => selectStudent(div.dataset.student));
      });
    }
    dropdown.classList.add("show");
  }

  function selectStudent(name) {
    document.getElementById("student-search").value = name;
    document.getElementById("student-select").value = name;
    document.getElementById("student-list-dropdown").classList.remove("show");
  }

  // ================= PROJECT PICKER — used in Cashbook tab =================
  function filterProjectPicker() {
    const input = document.getElementById("txn-project-search").value.toLowerCase();
    const dropdown = document.getElementById("txn-project-dropdown");
    const matches = db.projects.filter(p => p.name.toLowerCase().includes(input));
    dropdown.innerHTML = "";

    dropdown.innerHTML += `<div data-project-id="" data-project-name="">— No Project (General Fund) —</div>`;
    if (db.projects.length === 0) {
      dropdown.innerHTML += `<div style="color:#6E7A72; cursor:default;">No projects yet — add one from "Projects &amp; Events".</div>`;
    } else {
      matches.forEach(p => {
        dropdown.innerHTML += `<div data-project-id="${esc(p.id)}" data-project-name="${esc(p.name)}">${esc(p.name)}</div>`;
      });
    }
    dropdown.querySelectorAll('div[data-project-id]').forEach(div => {
      div.addEventListener('click', () => selectProjectForTxn(div.dataset.projectId, div.dataset.projectName));
    });
    dropdown.classList.add("show");
  }

  function selectProjectForTxn(id, name) {
    document.getElementById("txn-project-search").value = id ? name : "";
    document.getElementById("txn-project-select").value = id || "";
    document.getElementById("txn-project-dropdown").classList.remove("show");
  }

  window.onclick = function (event) {
    if (!event.target.closest('#category-search')) {
      document.getElementById("category-list-dropdown").classList.remove("show");
    }
    if (!event.target.closest('#student-search')) {
      document.getElementById("student-list-dropdown").classList.remove("show");
    }
    if (!event.target.closest('#txn-project-search')) {
      const d = document.getElementById("txn-project-dropdown");
      if (d) d.classList.remove("show");
    }
  };

  // ================= RECORD A PAYMENT =================
 function recordPayment() {
  
  
    const cat = document.getElementById("category-select").value;
    const student = document.getElementById("student-select").value;
    const amountPaying = round2(parseFloat(document.getElementById("amount-paying").value) || 0);
    const note = document.getElementById("payment-note").value.trim();

    if (!cat || !db.categories[cat]) return eveAlert("Please pick a valid collection from the list");
    if (!student || !db.students.some(s => s.name === student)) return eveAlert("Please pick a valid student from the database");
    if (amountPaying <= 0) return eveAlert("Please enter a positive amount");

    const catObj = db.categories[cat];
    let record = catObj.records.find(r => r.name === student);

    if (!record) {
      record = { name: student, due: catObj.amountDue, paid: 0, history: [] };
      catObj.records.push(record);
    }

    record.paid = round2(record.paid + amountPaying);
    record.history.push({ amount: amountPaying, date: new Date().toLocaleDateString(), note: note || "" });

    if (isOrg()) {
    db.cashbook.transactions.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      type: "income",
      date: new Date().toISOString().slice(0, 10),
      orNumber: "",
      category: "Student Payment",
      description: `Payment from ${student}`,
      amount: amountPaying,
      projectId: null,
      notes: note || ""
    });
  }

    saveData();
    generateStatement();

    document.getElementById("payment-note").value = "";
      eveAlert(`Payment of ${peso(amountPaying)} from ${esc(student)} recorded!`);
  document.getElementById("payment-note").value = "";
  }
  // ================= RECORDS TAB (BROWSE COLLECTIONS) =================
  function renderCategories() {
    const list = document.getElementById("category-list");
    const alphaIndex = document.getElementById("alpha-index");
    list.innerHTML = "";
    alphaIndex.innerHTML = "";

    const categories = Object.keys(db.categories).sort((a, b) => a.localeCompare(b));
    if (categories.length === 0) {
      list.innerHTML = `<p class="note">No collections yet. Add one in the ADD tab.</p>`;
      return;
    }

    const grouped = {};
    categories.forEach(cat => {
      const letter = cat[0].toUpperCase();
      (grouped[letter] = grouped[letter] || []).push(cat);
    });

    Object.keys(grouped).sort().forEach(letter => {
      list.innerHTML += `<div class="alpha-group" id="group-${letter}"><div class="alpha-header">${letter}</div>`;
      grouped[letter].forEach(cat => {
        const c = db.categories[cat];
        const totalDue = c.records.reduce((s, r) => s + r.due, 0);
        const totalPaid = c.records.reduce((s, r) => s + r.paid, 0);
                list.innerHTML += `
          <div class="card" data-cat="${esc(cat)}">
            <span>${esc(cat)} (${c.records.length} ${lbl("Year Level")})<br>
            <span class="note">Collected ${peso(totalPaid)} / ${peso(totalDue)}</span></span>
            <button class="del-btn" data-action="delete-cat" data-cat="${esc(cat)}">X</button>
          </div>`;
      });
      list.innerHTML += `</div>`;
      alphaIndex.innerHTML += `<div data-letter="${letter}">${letter}</div>`;
    });

    // Attach event listeners
    list.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="delete-cat"]')) return;
        showItems(card.dataset.cat);
      });
    });
    list.querySelectorAll('[data-action="delete-cat"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCat(btn.dataset.cat);
      });
    });
    alphaIndex.querySelectorAll('div[data-letter]').forEach(div => {
      div.addEventListener('click', () => scrollToLetter(div.dataset.letter));
    });
  }

  function scrollToLetter(letter) {
    const element = document.getElementById(`group-${letter}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelectorAll('.alpha-index div').forEach(el => el.classList.remove('active'));
      const clicked = document.querySelector(`.alpha-index div[data-letter="${letter}"]`);
      if (clicked) clicked.classList.add('active');
    }
  }

  function deleteCat(cat) {
    if (confirm(`Delete collection "${cat}" and ALL its payment records? This cannot be undone.`)) {
      delete db.categories[cat];
      saveData();
      renderCategories();
    }
  }

  // ---------- ITEM (STUDENT RECORD) VIEW ----------
  function showItems(cat) {
    currentCategory = cat;
    editingIndex = null;
    document.getElementById("category-view").classList.add("hidden");
    document.getElementById("item-view").classList.remove("hidden");
    document.getElementById("item-view-title").innerText = cat.toUpperCase();
    document.getElementById("item-search").value = "";
    renderItemList();
  }

  function backToCategories() {
    editingIndex = null;
    document.getElementById("item-view").classList.add("hidden");
    document.getElementById("category-view").classList.remove("hidden");
    renderCategories();
  }

  function addAllStudents() {
    const catObj = db.categories[currentCategory];
    const existingNames = new Set(catObj.records.map(r => r.name));
    const available = db.students.filter(s => !existingNames.has(s.name));

      if (available.length === 0) return eveAlert("All " + lbl("year levels").toLowerCase() + " are already in this collection.");

    document.getElementById("add-all-cat-name").innerText = currentCategory;
    addAllSelected.clear();
    document.getElementById("add-all-search").value = "";
    document.getElementById("add-all-status").innerText = "";
    renderAddAllList();
    document.getElementById("add-all-modal").classList.remove("hidden");
  }

  function closeAddAllModal() {
    document.getElementById("add-all-modal").classList.add("hidden");
    addAllSelected.clear();
  }

  function selectAllAddAll() {
  const search = (document.getElementById("add-all-search").value || "").toLowerCase();
  const catObj = db.categories[currentCategory];
  const existingNames = new Set(catObj.records.map(r => r.name));
  const visible = db.students
    .filter(s => !existingNames.has(s.name) && s.name.toLowerCase().includes(search));

  visible.forEach(s => addAllSelected.add(s.name));
  renderAddAllList();
}

function deselectAllAddAll() {
  addAllSelected.clear();
  renderAddAllList();
}

  function renderAddAllList() {
    const search = (document.getElementById("add-all-search").value || "").toLowerCase();
    const catObj = db.categories[currentCategory];
    const existingNames = new Set(catObj.records.map(r => r.name));
    const available = db.students
      .filter(s => !existingNames.has(s.name) && s.name.toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name));

    const box = document.getElementById("add-all-list");

       if (available.length === 0) {
      box.innerHTML = `<p class="note">${db.students.length === 0 ? 'No ' + lbl("year levels").toLowerCase() + ' in the database yet.' : 'No remaining ' + lbl("year levels").toLowerCase() + ' match your search.'}</p>`;
      return;
    }

    box.innerHTML = available.map(s => `
      <div class="add-all-item ${addAllSelected.has(s.name) ? 'selected' : ''}" data-name="${esc(s.name)}">
        <span style="font-weight:500;">${esc(s.name)}</span>
        <div class="check-indicator">${addAllSelected.has(s.name) ? '✓' : ''}</div>
      </div>
    `).join("");

    box.querySelectorAll('.add-all-item').forEach(el => {
      el.addEventListener('click', () => toggleAddAllCheckbox(el.dataset.name));
    });

    const statusEl = document.getElementById("add-all-status");
    if (addAllSelected.size > 0) {
      statusEl.innerText = `${addAllSelected.size} selected`;
      statusEl.style.color = "var(--success)";
    } else {
      statusEl.innerText = "Tap an item to select it";
      statusEl.style.color = "var(--muted)";
    }
  }

  function toggleAddAllCheckbox(name) {
    if (addAllSelected.has(name)) {
      addAllSelected.delete(name);
    } else {
      addAllSelected.add(name);
    }
    renderAddAllList();
  }

  function confirmAddAll() {
    const catObj = db.categories[currentCategory];
    if (addAllSelected.size === 0) return eveAlert("Please select at least one year level.");

      if (!confirm(`Add ${addAllSelected.size} ${lbl("year level").toLowerCase()}(s) to "${currentCategory}" with default due of ${peso(catObj.amountDue)}?`)) return;
    addAllSelected.forEach(name => {
      catObj.records.push({ name, due: catObj.amountDue, paid: 0, history: [] });
    });

    saveData();
    closeAddAllModal();
    renderItemList();
  }

  async function exportCategoryCSV() {
    const catObj = db.categories[currentCategory];
    if (!catObj || catObj.records.length === 0) return eveAlert("No records to export yet.");

    let csv = "Name,Due,Paid,Balance,Status";
    [...catObj.records].sort((a, b) => a.name.localeCompare(b.name)).forEach(r => {
      const balance = round2(r.due - r.paid);
      const status = balance < 0 ? "OVERPAID" : balance === 0 ? "PAID" : r.paid > 0 ? "PARTIAL" : "UNPAID";
      // Escape quotes in names for proper CSV
      const safeName = r.name.replace(/"/g, '""');
      csv += `"${safeName}",${r.due.toFixed(2)},${r.paid.toFixed(2)},${balance.toFixed(2)},${status}
  `;
    });

    const cleanFileName = `${currentCategory.replace(/[^a-z0-9]/gi, "_")}-report.csv`;
    await exportFileCrossPlatform(csv, cleanFileName, "text/csv", `Export ${currentCategory} Report`);
  }

  async function exportBackup() {
    const jsonStr = JSON.stringify(db, null, 2);
    const fileName = `treasurer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const success = await exportFileCrossPlatform(jsonStr, fileName, "application/json", "Export Backup");
    if (success) {
      localStorage.setItem("lastBackupTime", String(Date.now()));
      renderSummary();
    }
  }

  // Shared export helper: works both in a regular PC browser (dev/testing)
  // and inside the built Android app (via Filesystem + Share plugins).
  // Returns true if the export completed without error.
  async function exportFileCrossPlatform(content, fileName, mimeType, shareTitle) {
    if (!isAndroidApp()) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    }

    try {
      const plugins = window.Capacitor.Plugins || {};
      const { Filesystem, Share } = plugins;

      if (!Filesystem || !Share) {
        eveAlert(
          "Export needs the Filesystem and Share plugins, but they aren't installed in this build." +
  "Make sure @capacitor/filesystem and @capacitor/share are installed and synced before building the APK."
        );
        return false;
      }

      const writeResult = await Filesystem.writeFile({
        path: fileName,
        data: content,
        directory: "CACHE",
        encoding: "utf8"
      });

      await Share.share({
        title: shareTitle,
        url: writeResult.uri,
        dialogTitle: "Save File"
      });
      return true;
    } catch (e) {
      eveAlert("Mobile Export Error: " + e.message);
      return false;
    }
  }

  function renderItemList() {
    const catObj = db.categories[currentCategory];
    const box = document.getElementById("item-list");
    const searchTerm = (document.getElementById("item-search").value || "").toLowerCase();

    const totalDue = catObj.records.reduce((s, r) => s + r.due, 0);
    const totalPaid = catObj.records.reduce((s, r) => s + r.paid, 0);
    const totalBalance = round2(totalDue - totalPaid);

    document.getElementById("item-summary").innerHTML = `
      Collected <b>${peso(totalPaid)}</b> &nbsp;|&nbsp;
      Expected <b>${peso(totalDue)}</b> &nbsp;|&nbsp;
      Balance <b style="color:${totalBalance > 0 ? '#B3423B' : '#2F7D53'}">${peso(totalBalance)}</b>
    `;

        if (catObj.records.length === 0) {
      box.innerHTML = `<p class="note">No ${lbl("year level").toLowerCase()} added to this collection yet. Use "${lbl("Add All Year Level")}" above, or record a payment from the ADD tab.</p>`;
      return;
    }
    const sorted = [...catObj.records]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter(r => r.name.toLowerCase().includes(searchTerm));

    if (sorted.length === 0) {
      box.innerHTML = `<p class="note">No matching student.</p>`;
      return;
    }

    box.innerHTML = sorted.map(rec => {
      const idx = catObj.records.indexOf(rec);
      const balance = round2(rec.due - rec.paid);
      let statusLabel, statusColor;
      if (balance < 0) { statusLabel = "OVERPAID"; statusColor = "#3B6E8F"; }
      else if (balance === 0) { statusLabel = "PAID"; statusColor = "#2F7D53"; }
      else if (rec.paid > 0) { statusLabel = "PARTIAL"; statusColor = "#B8872F"; }
      else { statusLabel = "UNPAID"; statusColor = "#B3423B"; }

      if (editingIndex === idx) {
        const historyHtml = rec.history.length
          ? rec.history.map((h, hIdx) => `
              <div class="history-entry">
                <span>${peso(h.amount)} on ${esc(h.date)}${h.note ? ' • ' + esc(h.note) : ''}</span>
                <div class="history-actions">
                  <button class="mini-btn" data-action="edit-hist" data-rec="${idx}" data-hist="${hIdx}">EDIT</button>
                  <button class="mini-btn mini-delete" data-action="del-hist" data-rec="${idx}" data-hist="${hIdx}">DEL</button>
                </div>
              </div>`).join("")
          : `<div class="note">No payments logged yet.</div>`;

              return `
          <div class="item-row editing" id="item-${idx}">
            <b>${esc(rec.name)}</b>
            <div class="edit-note">
              💡 <b>Tip:</b> You can edit <b>Amount Due</b> and <b>Total Paid</b> directly, or use <b>Add Payment</b> to log a new installment. Deleting a history entry recalculates the total automatically.
            </div>
            
            <input type="number" id="edit-due-${idx}" value="${rec.due}" step="0.01" placeholder="Amount Due">
            <input type="number" id="edit-paid-${idx}" value="${rec.paid}" step="0.01" placeholder="Total Paid">
            <input type="text" id="edit-note-${idx}" value="${esc(rec.note || '')}" placeholder="Note / remarks (optional)">
            <div class="row" style="margin-bottom:0;">
              <input type="number" id="quick-pay-${idx}" placeholder="Add new payment">
              <button class="btn-save" data-action="quick-pay" data-idx="${idx}">ADD PAYMENT</button>
            </div>
            <div class="history-box">
              <p class="note"><b>Payment History:</b> (editing/deleting an entry recalculates Total Paid)</p>
              ${historyHtml}
            </div>
            <div class="item-actions">
              <button class="btn-save" data-action="save-edit" data-idx="${idx}">SAVE</button>
              <button class="btn-delete-item" data-action="delete-item" data-idx="${idx}">REMOVE FROM LIST</button>
              <button class="btn-cancel" data-action="cancel-edit">CANCEL</button>
            </div>
          </div>`;
      }

      return `
        <div class="item-row" data-action="edit-item" data-idx="${idx}">
          <div><b>${esc(rec.name)}</b><br><span class="note">Paying: ${peso(rec.paid)}</span></div>
          <div style="text-align:right;">
            <span style="color:${statusColor}; font-weight:900;">${peso(balance)}</span><br>
            <span class="note" style="color:${statusColor};">${statusLabel}</span>
          </div>
        </div>`;
    }).join("");

    // Attach event listeners
    box.querySelectorAll('[data-action="edit-item"]').forEach(el => {
      el.addEventListener('click', () => editItem(parseInt(el.dataset.idx, 10)));
    });
    box.querySelectorAll('[data-action="quick-pay"]').forEach(el => {
      el.addEventListener('click', () => quickPay(parseInt(el.dataset.idx, 10)));
    });
    box.querySelectorAll('[data-action="save-edit"]').forEach(el => {
      el.addEventListener('click', () => saveItemEdit(parseInt(el.dataset.idx, 10)));
    });
    box.querySelectorAll('[data-action="delete-item"]').forEach(el => {
      el.addEventListener('click', () => deleteItem(parseInt(el.dataset.idx, 10)));
    });
    box.querySelectorAll('[data-action="cancel-edit"]').forEach(el => {
      el.addEventListener('click', cancelEdit);
    });
    box.querySelectorAll('[data-action="edit-hist"]').forEach(el => {
      el.addEventListener('click', () => editHistoryEntry(parseInt(el.dataset.rec, 10), parseInt(el.dataset.hist, 10)));
    });
    box.querySelectorAll('[data-action="del-hist"]').forEach(el => {
      el.addEventListener('click', () => deleteHistoryEntry(parseInt(el.dataset.rec, 10), parseInt(el.dataset.hist, 10)));
    });
  }

  function editItem(index) {
    editingIndex = index;
    renderItemList();
  }

  function cancelEdit() {
    editingIndex = null;
    renderItemList();
  }

  function quickPay(idx) {
    const val = round2(parseFloat(document.getElementById(`quick-pay-${idx}`).value));
    if (!val || val <= 0) return eveAlert("Enter a valid payment amount");
    const rec = db.categories[currentCategory].records[idx];
    rec.paid = round2(rec.paid + val);
    rec.history.push({ amount: val, date: new Date().toLocaleDateString(), note: "" });

    // Also log this payment in the Cash Book so the ledger stays in sync
    db.cashbook.transactions.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      type: "income",
      date: new Date().toISOString().slice(0, 10),
      orNumber: "",
      category: "Student Payment",
      description: `Payment from ${rec.name} — ${currentCategory}`,
      amount: val,
      projectId: null,
      notes: ""
    });

    saveData();
    renderItemList();
  }

  function saveItemEdit(idx) {
    const due = round2(parseFloat(document.getElementById(`edit-due-${idx}`).value) || 0);
    const paid = round2(parseFloat(document.getElementById(`edit-paid-${idx}`).value) || 0);
    const note = document.getElementById(`edit-note-${idx}`).value.trim();
    if (due < 0 || paid < 0) return eveAlert("Values cannot be negative");
    const rec = db.categories[currentCategory].records[idx];
    rec.due = due;
    rec.paid = paid;
    rec.note = note;
    editingIndex = null;
    saveData();
    renderItemList();
  }

  function editHistoryEntry(recIdx, histIdx) {
    const rec = db.categories[currentCategory].records[recIdx];
    const entry = rec.history[histIdx];
    const newAmountStr = prompt(`Edit payment amount (was ${peso(entry.amount)}):`, entry.amount);
    if (newAmountStr === null) return;
    const newAmount = parseFloat(newAmountStr);
    if (isNaN(newAmount) || newAmount < 0) return eveAlert("Please enter a valid amount.");

    entry.amount = round2(newAmount);
    rec.paid = round2(rec.history.reduce((s, h) => s + h.amount, 0));
    saveData();
    renderItemList();
  }

  function deleteHistoryEntry(recIdx, histIdx) {
    const rec = db.categories[currentCategory].records[recIdx];
    if (!confirm("Delete this payment entry? This will also reduce the student's Total Paid accordingly.")) return;

    rec.history.splice(histIdx, 1);
    rec.paid = round2(rec.history.reduce((s, h) => s + h.amount, 0));
    saveData();
    renderItemList();
  }

  function deleteItem(idx) {
    const rec = db.categories[currentCategory].records[idx];
    if (confirm(`Remove ${rec.name} from "${currentCategory}"? (They stay in the student database.)`)) {
      db.categories[currentCategory].records.splice(idx, 1);
      editingIndex = null;
      saveData();
      renderItemList();
    }
  }

  /* =========================================================================
    CASHBOOK (ORGANIZATION-WIDE INCOME & EXPENSE LEDGER)
    -------------------------------------------------------------------------
    Separate from the per-student fee Collections above. This is the core
    general ledger an org treasurer keeps: every peso in (dues, sponsorship,
    event income) and every peso out (supplies, food, printing, etc.), with
    a running balance, OR/Voucher numbers for accountability, and optional
    linking to a Project/Event for liquidation reporting.
    ========================================================================= */

  const INCOME_CATEGORIES = [
    "Membership Dues", "Event Income", "Sponsorship / Donation",
    "Fundraising", "Reimbursement", "Other Income"
  ];
  const EXPENSE_CATEGORIES = [
    "Supplies & Materials", "Food & Refreshments", "Printing & Documentation",
    "Transportation", "Permits & Fees", "Honorarium / Token",
    "Venue / Rentals", "Other Expense"
  ];

  function setTxnType(type) {
    document.getElementById("txn-type").value = type;
    document.getElementById("type-income-btn").classList.toggle("selected-income", type === "income");
    document.getElementById("type-expense-btn").classList.toggle("selected-expense", type === "expense");

    const catSelect = document.getElementById("txn-category");
    const prevValue = catSelect.value;
    const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    catSelect.innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    if (cats.includes(prevValue)) catSelect.value = prevValue;
  }

  function resetTxnForm() {
    document.getElementById("txn-edit-id").value = "";
    document.getElementById("txn-date").value = new Date().toISOString().slice(0, 10);
    document.getElementById("txn-or").value = "";
    document.getElementById("txn-description").value = "";
    document.getElementById("txn-amount").value = "";
    document.getElementById("txn-project-search").value = "";
    document.getElementById("txn-project-select").value = "";
    document.getElementById("txn-notes").value = "";
    document.getElementById("txn-cancel-btn").style.display = "none";
    document.getElementById("txn-delete-btn").style.display = "none";
    document.getElementById("txn-form-title").innerText = "Record Transaction";
    setTxnType("income");
  }

  function saveTransaction() {
    const type = document.getElementById("txn-type").value;
    const dateInput = document.getElementById("txn-date").value;
    const date = dateInput || new Date().toISOString().slice(0, 10);
    const orNumber = document.getElementById("txn-or").value.trim();
    const category = document.getElementById("txn-category").value;
    const description = document.getElementById("txn-description").value.trim();
    const amount = round2(parseFloat(document.getElementById("txn-amount").value) || 0);
    const projectId = document.getElementById("txn-project-select").value || null;
    const notes = document.getElementById("txn-notes").value.trim();
    const editId = document.getElementById("txn-edit-id").value;

    if (!description) return eveAlert("Please enter a description for this transaction.");
    if (!category) return eveAlert("Please select a category.");
    if (amount <= 0) return eveAlert("Please enter a valid amount greater than zero.");

    if (editId) {
      const txn = db.cashbook.transactions.find(t => String(t.id) === String(editId));
      if (txn) Object.assign(txn, { type, date, orNumber, category, description, amount, projectId, notes });
    } else {
      db.cashbook.transactions.push({
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        type, date, orNumber, category, description, amount, projectId, notes
      });
    }

    saveData();
    const wasEdit = !!editId;
    resetTxnForm();
    renderCashbookSummary();
    renderCashbookList();
    renderProjects();
    eveAlert(wasEdit ? "Transaction updated." : "Transaction recorded.");
  }

  function editTransactionRow(id) {
    const txn = db.cashbook.transactions.find(t => String(t.id) === String(id));
    if (!txn) return;

    setTxnType(txn.type);
    document.getElementById("txn-edit-id").value = txn.id;
    document.getElementById("txn-date").value = txn.date;
    document.getElementById("txn-or").value = txn.orNumber || "";
    document.getElementById("txn-category").value = txn.category;
    document.getElementById("txn-description").value = txn.description;
    document.getElementById("txn-amount").value = txn.amount;
    document.getElementById("txn-notes").value = txn.notes || "";

    if (txn.projectId) {
      const p = db.projects.find(pr => String(pr.id) === String(txn.projectId));
      if (p) {
        document.getElementById("txn-project-search").value = p.name;
        document.getElementById("txn-project-select").value = p.id;
      }
    } else {
      document.getElementById("txn-project-search").value = "";
      document.getElementById("txn-project-select").value = "";
    }

    document.getElementById("txn-cancel-btn").style.display = "block";
    document.getElementById("txn-delete-btn").style.display = "block";
    document.getElementById("txn-form-title").innerText = "Edit Transaction";
    document.getElementById("txn-form-title").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function cancelTxnEdit() {
    resetTxnForm();
  }

  function deleteCurrentTxn() {
    const id = document.getElementById("txn-edit-id").value;
    if (!id) return;
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    db.cashbook.transactions = db.cashbook.transactions.filter(t => String(t.id) !== String(id));
    saveData();
    resetTxnForm();
    renderCashbookSummary();
    renderCashbookList();
    renderProjects();
  }

  function openOpeningBalanceModal() {
    const current = db.cashbook.openingBalance || 0;
    const val = prompt("Set Opening / Beginning Cash Balance for the Cash Book:", current);
    if (val === null) return;
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return eveAlert("Please enter a valid non-negative amount.");
    db.cashbook.openingBalance = round2(num);
    saveData();
    renderCashbookSummary();
    renderCashbookList();
  }

  function computeCashbookTotals() {
    const opening = db.cashbook.openingBalance || 0;
    const totalIncome = round2(db.cashbook.transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0));
    const totalExpense = round2(db.cashbook.transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0));
    const cashOnHand = round2(opening + totalIncome - totalExpense);
    return { opening, totalIncome, totalExpense, cashOnHand };
  }

  function renderCashbookSummary() {
    const el = document.getElementById("cashbook-summary");
    if (!el) return;
    const { opening, totalIncome, totalExpense, cashOnHand } = computeCashbookTotals();
    el.innerHTML = `
      <div class="summary-card"><h4>Opening Balance</h4><p>${peso(opening)}</p></div>
      <div class="summary-card"><h4>Total Income</h4><p style="color:var(--success)">${peso(totalIncome)}</p></div>
      <div class="summary-card"><h4>Total Expenses</h4><p style="color:var(--danger)">${peso(totalExpense)}</p></div>
      <div class="summary-card"><h4>Cash On Hand</h4><p style="color:${cashOnHand < 0 ? 'var(--danger)' : 'var(--accent-dark)'}">${peso(cashOnHand)}</p></div>
    `;
  }

  function renderCashbookList() {
    const box = document.getElementById("cashbook-list");
    if (!box) return;
    const search = (document.getElementById("cashbook-search").value || "").toLowerCase();
    const typeFilter = document.getElementById("cashbook-filter-type").value;

    // Compute a running balance in chronological order first...
    const sortedAsc = [...db.cashbook.transactions].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "") || String(a.id).localeCompare(String(b.id))
    );
    let running = db.cashbook.openingBalance || 0;
    const withBalance = sortedAsc.map(t => {
      running = round2(running + (t.type === "income" ? t.amount : -t.amount));
      return { ...t, balance: running };
    });

    // ...then filter and show most-recent-first.
    let filtered = withBalance.filter(t => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (!search) return true;
      const projName = t.projectId ? ((db.projects.find(p => String(p.id) === String(t.projectId)) || {}).name || "") : "";
      return t.description.toLowerCase().includes(search) ||
            t.category.toLowerCase().includes(search) ||
            (t.orNumber || "").toLowerCase().includes(search) ||
            projName.toLowerCase().includes(search);
    }).reverse();

    document.getElementById("cashbook-count").innerText =
      `${filtered.length} of ${db.cashbook.transactions.length} transaction${db.cashbook.transactions.length !== 1 ? 's' : ''} shown`;

    if (filtered.length === 0) {
      box.innerHTML = `<p class="note">${db.cashbook.transactions.length === 0 ? 'No transactions recorded yet. Use the form above to log your first income or expense.' : 'No transaction matches your search/filter.'}</p>`;
      return;
    }

    box.innerHTML = filtered.map(t => {
      const projName = t.projectId ? (db.projects.find(p => String(p.id) === String(t.projectId)) || {}).name : null;
      const sign = t.type === "income" ? "+" : "−";
      const color = t.type === "income" ? "var(--success)" : "var(--danger)";
      return `
        <div class="item-row" data-action="edit-txn" data-id="${t.id}">
          <div>
            <b>${esc(t.description)}</b><br>
            <span class="note">${esc(t.category)}${t.orNumber ? ' • OR#' + esc(t.orNumber) : ''}${projName ? ' • 📁 ' + esc(projName) : ''} • ${esc(t.date)}</span>
          </div>
          <div style="text-align:right;">
            <span style="color:${color}; font-weight:900;">${sign}${peso(t.amount)}</span><br>
            <span class="note">Bal: ${peso(t.balance)}</span>
          </div>
        </div>`;
    }).join("");

    box.querySelectorAll('[data-action="edit-txn"]').forEach(el => {
      el.addEventListener('click', () => editTransactionRow(el.dataset.id));
    });
  }

  async function exportCashbookCSV() {
    if (db.cashbook.transactions.length === 0) return eveAlert("No transactions to export yet.");

    const sortedAsc = [...db.cashbook.transactions].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "") || String(a.id).localeCompare(String(b.id))
    );
    let running = db.cashbook.openingBalance || 0;

    let csv = "Date,Type,Category,Description,OR/Voucher No.,Project,Amount,Running Balance";
    sortedAsc.forEach(t => {
      running = round2(running + (t.type === "income" ? t.amount : -t.amount));
      const projName = t.projectId ? ((db.projects.find(p => String(p.id) === String(t.projectId)) || {}).name || "") : "";
      const safeDesc = t.description.replace(/"/g, '""');
      const safeProj = projName.replace(/"/g, '""');
      csv += `
  ${t.date},${t.type === "income" ? "Income" : "Expense"},"${t.category}","${safeDesc}","${t.orNumber || ""}","${safeProj}",${t.amount.toFixed(2)},${running.toFixed(2)}`;
    });

    await exportFileCrossPlatform(csv, `cashbook-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv", "Export Cash Book");
  }

  /* ---------------- PROJECTS / EVENTS (budget + liquidation) ---------------- */

  function addProject() {
    const nameInput = document.getElementById("new-project-name");
    const budgetInput = document.getElementById("new-project-budget");
    const name = nameInput.value.trim();
    const budget = round2(parseFloat(budgetInput.value) || 0);

    if (!name) return eveAlert("Please enter a project or event name.");
    if (db.projects.some(p => p.name.toLowerCase() === name.toLowerCase())) return eveAlert("A project with that name already exists.");

    db.projects.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), name, budget, status: "active" });
    saveData();
    nameInput.value = "";
    budgetInput.value = "";
    renderProjects();
  }

  function deleteProject(id) {
    const hasLinked = db.cashbook.transactions.some(t => String(t.projectId) === String(id));
    const msg = hasLinked
      ? "This project has linked transactions. They will stay in the Cash Book but will no longer be linked to a project. Continue?"
      : "Delete this project?";
    if (!confirm(msg)) return;

    db.cashbook.transactions.forEach(t => { if (String(t.projectId) === String(id)) t.projectId = null; });
    db.projects = db.projects.filter(p => String(p.id) !== String(id));
    saveData();
    renderProjects();
    renderCashbookList();
  }

  function renderProjects() {
    const box = document.getElementById("projects-list");
    if (!box) return;

    if (db.projects.length === 0) {
      box.innerHTML = `<p class="note">No projects/events yet. Add one above to track its budget, income raised, and expenses separately from the general fund.</p>`;
      return;
    }

    box.innerHTML = [...db.projects].sort((a, b) => a.name.localeCompare(b.name)).map(p => {
      const spent = round2(db.cashbook.transactions.filter(t => String(t.projectId) === String(p.id) && t.type === "expense").reduce((s, t) => s + t.amount, 0));
      const income = round2(db.cashbook.transactions.filter(t => String(t.projectId) === String(p.id) && t.type === "income").reduce((s, t) => s + t.amount, 0));
      const remaining = round2(p.budget - spent);
      const remainingStr = p.budget > 0 ? ` • Remaining: ${peso(remaining)}` : "";
      const incomeStr = income > 0 ? ` • Income: ${peso(income)}` : "";
      return `
        <div class="card" data-action="view-project" data-id="${p.id}">
          <span>${esc(p.name)}<br>
          <span class="note">Budget: ${peso(p.budget)} • Spent: ${peso(spent)}${incomeStr}${remainingStr}</span></span>
          <button class="del-btn" data-action="delete-project" data-id="${p.id}">X</button>
        </div>`;
    }).join("");

    box.querySelectorAll('[data-action="view-project"]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="delete-project"]')) return;
        showProjectDetail(el.dataset.id);
      });
    });
    box.querySelectorAll('[data-action="delete-project"]').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); deleteProject(el.dataset.id); });
    });
  }

  function showProjectsView() {
    document.getElementById("cashbook-main-view").classList.add("hidden");
    document.getElementById("project-detail-view").classList.add("hidden");
    document.getElementById("projects-view").classList.remove("hidden");
    renderProjects();
  }

  function hideProjectsView() {
    document.getElementById("projects-view").classList.add("hidden");
    document.getElementById("project-detail-view").classList.add("hidden");
    document.getElementById("cashbook-main-view").classList.remove("hidden");
  }

  function backToProjectsList() {
    document.getElementById("project-detail-view").classList.add("hidden");
    document.getElementById("projects-view").classList.remove("hidden");
  }

  function showProjectDetail(id) {
    const p = db.projects.find(pr => String(pr.id) === String(id));
    if (!p) return;

    document.getElementById("projects-view").classList.add("hidden");
    document.getElementById("project-detail-view").classList.remove("hidden");
    document.getElementById("project-detail-name").innerText = p.name.toUpperCase();

    const txns = db.cashbook.transactions
      .filter(t => String(t.projectId) === String(id))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const spent = round2(txns.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0));
    const income = round2(txns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0));
    const remaining = round2(p.budget - spent);

    document.getElementById("project-detail-summary").innerHTML = `
      <div class="summary-card"><h4>Budget</h4><p>${peso(p.budget)}</p></div>
      <div class="summary-card"><h4>Spent</h4><p style="color:var(--danger)">${peso(spent)}</p></div>
      <div class="summary-card"><h4>Income Raised</h4><p style="color:var(--success)">${peso(income)}</p></div>
      <div class="summary-card"><h4>Remaining Budget</h4><p style="color:${remaining < 0 ? 'var(--danger)' : 'var(--accent-dark)'}">${peso(remaining)}</p></div>
    `;

    document.getElementById("project-detail-txns").innerHTML = txns.length ? txns.map(t => {
      const sign = t.type === "income" ? "+" : "−";
      const color = t.type === "income" ? "var(--success)" : "var(--danger)";
      return `<div class="breakdown-card">
        <div class="breakdown-top"><b>${esc(t.description)}</b><span style="color:${color};">${sign}${peso(t.amount)}</span></div>
        <span class="note">${esc(t.category)} • ${esc(t.date)}${t.orNumber ? ' • OR#' + esc(t.orNumber) : ''}</span>
      </div>`;
    }).join("") : `<p class="note">No transactions linked to this project yet. Link one by picking it in the Cash Book form.</p>`;
  }

  /* =========================================================================
    ORGANIZATION INFO
    ========================================================================= */

  function saveOrgSettings() {
    db.orgSettings.orgName = document.getElementById("org-name").value.trim();
    db.orgSettings.treasurerName = document.getElementById("org-treasurer").value.trim();
    db.orgSettings.presidentName = document.getElementById("org-president").value.trim();
    db.orgSettings.schoolYear = document.getElementById("org-sy").value.trim();
    saveData();
    updateAppHeader();
    eveAlert("Organization info saved.");
  }

  function loadOrgSettingsForm() {
    document.getElementById("org-name").value = db.orgSettings.orgName || "";
    document.getElementById("org-treasurer").value = db.orgSettings.treasurerName || "";
    document.getElementById("org-president").value = db.orgSettings.presidentName || "";
    document.getElementById("org-sy").value = db.orgSettings.schoolYear || "";
  }

  function updateAppHeader() {
    const eyebrow = document.querySelector(".eyebrow");
    if (eyebrow) eyebrow.innerText = db.orgSettings.orgName ? db.orgSettings.orgName : "Digital Ledger";
  }

  /* =========================================================================
    FINANCIAL STATEMENT (Statement of Receipts and Disbursements)
    ========================================================================= */

  function formatDisplayDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function formatStatement(htmlContent) {
      // Create a temporary div to parse HTML
      const div = document.createElement('div');
      div.innerHTML = htmlContent;

      // Replace <br> tags with newlines
      div.innerHTML = div.innerHTML.replace(/<br\s*\/?>/gi, '\n');

      // Get the plain text
      let text = div.innerText;

      // Optional: further formatting (e.g., aligning values)
      // For simplicity, you can process 'text' as needed here

      return text;
  }


  function generateStatement() {
    const startVal = document.getElementById("stmt-start").value;
    const endVal = document.getElementById("stmt-end").value;

    const all = [...db.cashbook.transactions].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "") || String(a.id).localeCompare(String(b.id))
    );
    const before = startVal ? all.filter(t => t.date < startVal) : [];
    const beginningBalance = round2(
      (db.cashbook.openingBalance || 0) +
      before.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0) -
      before.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0)
    );

    const inRange = all.filter(t => {
      if (startVal && t.date < startVal) return false;
      if (endVal && t.date > endVal) return false;
      return true;
    });

    const incomeTxns = inRange.filter(t => t.type === "income");
    const expenseTxns = inRange.filter(t => t.type === "expense");

    const incomeByCategory = {};
    incomeTxns.forEach(t => { incomeByCategory[t.category] = round2((incomeByCategory[t.category] || 0) + t.amount); });
    const expenseByCategory = {};
    expenseTxns.forEach(t => { expenseByCategory[t.category] = round2((expenseByCategory[t.category] || 0) + t.amount); });

    const totalReceipts = round2(incomeTxns.reduce((s, t) => s + t.amount, 0));
    const totalDisbursements = round2(expenseTxns.reduce((s, t) => s + t.amount, 0));
    const endingBalance = round2(beginningBalance + totalReceipts - totalDisbursements);

    const periodLabel = (startVal || endVal)
      ? `${startVal ? formatDisplayDate(startVal) : 'Beginning'} to ${endVal ? formatDisplayDate(endVal) : 'Present'}`
      : "All Recorded Transactions";

    const org = db.orgSettings || {};

    // Helper function to replace category label
    function replaceCategoryLabel(category) {
      if (category === "Student Payment") return "All Year Level Payment";
      return category;
    }

    // Generate income rows with label replacement
    const incomeRows = Object.keys(incomeByCategory).sort().map(c => {
      const displayCat = replaceCategoryLabel(c);
      return `<div class="statement-row"><span>${esc(displayCat)}</span><span>${peso(incomeByCategory[c])}</span></div>`;
    }).join("") || '<p class="note">No receipts recorded for this period.</p>';

    // Generate expense rows (no label change needed)
    const expenseRows = Object.keys(expenseByCategory).sort().map(c =>
      `<div class="statement-row"><span>${esc(c)}</span><span>${peso(expenseByCategory[c])}</span></div>`
    ).join("") || '<p class="note">No disbursements recorded for this period.</p>';

    // ... rest of your generateStatement code remains unchanged ...
    document.getElementById("statement-output").innerHTML = `
      <div class="statement-print-area">
        <div class="statement-header">
          <h3>${esc(org.orgName || "Organization Name")}</h3>
          <p class="note">PUP Unisan Campus${org.schoolYear ? ' • S.Y. ' + esc(org.schoolYear) : ''}</p>
          <h4>STATEMENT OF RECEIPTS AND DISBURSEMENTS</h4>
          <p class="note">For the period: ${esc(periodLabel)}</p>
        </div>

        <div class="statement-row statement-subtotal"><span>Beginning Cash Balance</span><b>${peso(beginningBalance)}</b></div>

        <h4 style="margin-top:18px;">Receipts</h4>
        ${incomeRows}
        <div class="statement-row statement-subtotal"><span>Total Receipts</span><b style="color:var(--success)">${peso(totalReceipts)}</b></div>

        <h4 style="margin-top:18px;">Disbursements</h4>
        ${expenseRows}
        <div class="statement-row statement-subtotal"><span>Total Disbursements</span><b style="color:var(--danger)">${peso(totalDisbursements)}</b></div>

        <div class="statement-row statement-final"><span>Ending Cash Balance</span><b>${peso(endingBalance)}</b></div>

        <div class="statement-signatures">
          <div><p class="note">Prepared by:</p><p class="sig-line">${esc(org.treasurerName || '_______________________')}</p><p class="note">Treasurer</p></div>
          <div><p class="note">Noted by:</p><p class="sig-line">${esc(org.presidentName || '_______________________')}</p><p class="note">President / Adviser</p></div>
        </div>
        <p class="note" style="margin-top:16px; text-align:center;">Generated on ${new Date().toLocaleDateString()} via Treasurer Recorder</p>
      </div>
      <div class="row" style="margin-top:16px;">
        <button onclick="window.print()">🖨 Print Statement</button>
        <button onclick="exportStatementText()">Export as Text</button>
      </div>
    `;
    document.getElementById("statement-output").scrollIntoView({ behavior: "smooth" });
  }

  async function exportStatementText() {
    const area = document.querySelector(".statement-print-area");
    if (!area) return;
    const text = area.innerText;
    await exportFileCrossPlatform(text, `statement-${new Date().toISOString().slice(0, 10)}.txt`, "text/plain", "Export Statement");
  }

  // ================= SUMMARY TAB =================
  function renderSummary() {
  const cats = Object.keys(db.categories).sort((a, b) => a.localeCompare(b));
  let totalDue = 0, totalPaid = 0;

  const rows = cats.map(cat => {
    const c = db.categories[cat];
    const due = c.records.reduce((s, r) => s + r.due, 0);
    const paid = c.records.reduce((s, r) => s + r.paid, 0);
    totalDue += due;
    totalPaid += paid;
    const pct = due > 0 ? Math.min(100, (paid / due) * 100) : 0;
    return `
      <div class="breakdown-card">
        <div class="breakdown-top"><b>${esc(cat)}</b><span>${peso(paid)} / ${peso(due)}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;"></div></div>
      </div>`;
  }).join("");

  let cardsHtml = `
    <div class="summary-card"><h4>Total ${lbl("Year Levels")}</h4><p>${db.students.length}</p></div>
    <div class="summary-card"><h4>Collection Categories</h4><p>${cats.length}</p></div>
    <div class="summary-card"><h4>Total Collected</h4><p>${peso(totalPaid)}</p></div>
    <div class="summary-card"><h4>Total Unpaid Balances</h4><p>${peso(round2(totalDue - totalPaid))}</p></div>
  `;

  if (isOrg()) {
    const cb = computeCashbookTotals();
    cardsHtml += `
      <div class="summary-card"><h4>Cash Book Balance</h4><p style="color:${cb.cashOnHand < 0 ? 'var(--danger)' : 'var(--accent-dark)'}">${peso(cb.cashOnHand)}</p></div>
      <div class="summary-card"><h4>Active Projects</h4><p>${db.projects.length}</p></div>
    `;
  } else {
    cardsHtml += `
      <div class="summary-card" style="grid-column: span 2;"><h4>Class Fund Total</h4><p>${peso(totalPaid)}</p></div>
    `;
  }

  document.getElementById("summary-cards").innerHTML = cardsHtml;
  document.getElementById("summary-breakdown").innerHTML = rows || `<p class="note">No collections yet.</p>`;

  // Backup reminder
  const statusEl = document.getElementById("backup-status");
  const lastBackup = localStorage.getItem("lastBackupTime");
  if (!lastBackup) {
    statusEl.innerText = "⚠ You have never backed up your data yet.";
    statusEl.style.color = "#B3423B";
  } else {
    const days = Math.floor((Date.now() - parseInt(lastBackup, 10)) / (1000 * 60 * 60 * 24));
    if (days <= 0) {
      statusEl.innerText = "✓ Last backup: today";
      statusEl.style.color = "#2F7D53";
    } else if (days === 1) {
      statusEl.innerText = "Last backup: 1 day ago";
      statusEl.style.color = "#2F7D53";
    } else if (days <= 7) {
      statusEl.innerText = `Last backup: ${days} days ago`;
      statusEl.style.color = days <= 3 ? "#2F7D53" : "#B8872F";
    } else {
      statusEl.innerText = `⚠ Last backup: ${days} days ago — back up soon!`;
      statusEl.style.color = "#B3423B";
    }
  }
  }

  // ================= BACKUP / RESTORE =================
  function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported.students) || typeof imported.categories !== "object" || imported.categories === null) {
          throw new Error("Invalid file");
        }
        if (confirm("This will REPLACE all current data with this backup. Continue?")) {
          db = imported;
          migrateDb();
          saveData();
          renderStudents();
          renderSummary();
          renderCashbookSummary();
          renderCashbookList();
          renderProjects();
          loadOrgSettingsForm();
          updateAppHeader();
          eveAlert("Backup restored!");
        }
      } catch (err) {
        eveAlert("Invalid backup file.");
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  function resetAllData() {
    if (confirm("This will permanently erase ALL students, collections, cash book transactions, and projects. Continue?")) {
      if (confirm("Are you absolutely sure? This cannot be undone.")) {
        db = { students: [], categories: {} };
        migrateDb();
        saveData();
        renderStudents();
        renderSummary();
        renderCashbookSummary();
        renderCashbookList();
        renderProjects();
        loadOrgSettingsForm();
        updateAppHeader();
      }
    }
  }

  // Initial render on page load
  window.addEventListener("DOMContentLoaded", () => {
  checkMode();          // <-- NEW: mode must be checked first
  if (!getMode()) return; // Don't render until mode is chosen

  renderStudents();
  renderCategories();
  renderSummary();
  renderCashbookSummary();
  renderCashbookList();
  renderProjects();
  loadOrgSettingsForm();
  updateAppHeader();
  resetTxnForm();
});

/* =========================================================================
   EVE SMART ASSISTANT — Idle Toggle + Alert Replacement
   ========================================================================= */
(function() {
  const nativeAlert = window.alert.bind(window);

  const eveBot      = document.getElementById('eveBot');
  const eveHead     = document.getElementById('eveHead');
  const speechBubble= document.getElementById('speechBubble');
  const msgEl       = document.getElementById('eveMsg');
  const actionsEl   = document.getElementById('eveActions');
  const allEyes     = document.querySelectorAll('.eve-eye');

  let isInteracting = false;
  let ambientTimer  = null;
  let bubbleTimer   = null;
  let msgQueue      = [];
  let msgIndex      = 0;
  let hasShownUrgent= false;
  let idleCycleTimer= null;
  let idleTipIndex  = 0;
  let idleCycleActive = true;
  let lastBubbleShow = 0;          // ← NEW: grace-period tracker
  const BUBBLE_GRACE_MS = 300;     // ← NEW

  const IDLE_TIPS = [
    `💡 Try Dark mode or Cyberpunk style in the top bar!`,
    `💡 All data stays offline. Back it up regularly!`,
    `💡 Switch between Org and Class mode anytime.`,
    `💡 Export CSVs from any collection for easy reporting.`,
    `💡 Set an Opening Balance in Cashbook for accurate statements.`,
    `💡 Tap a student's card in Records to edit their due or paid amount directly.`,
    `💡 Use the search box in any tab to filter long lists instantly.`,
    `💡 Link Cash Book transactions to Projects for auto-generated liquidation reports.`,
    `💡 In Class mode, set the weekly due and start date before recording payments.`,
    `💡 The PIN lock only works in the built Android app — test in browser first!`,
    `💡 Forgot your PIN? Use your device's Activation Code to reset it safely.`,
    `💡 Add all students to a collection at once with the "Add All" button.`,
    `💡 Student payments recorded in the ADD tab automatically sync to the Cash Book.`,
    `💡 Generate a Financial Statement anytime from the Summary tab for GA or audit.`,
    `💡 Keep your backup JSON file safe — it contains all your records!`,
    `💡 Use OR / Voucher numbers in Cash Book for easier tracking during audits.`,
    `💡 Rename a collection anytime by opening it and tapping "Rename".`,
    `💡 Tap EVE's head to cycle through urgent reminders and helpful tips.`,
    `💡 Your data lives in this browser only — clearing cache will erase everything!`,
    `💡 The Activation Code locks this app to your device. It won't work on another phone.`,
    `💡 Switching from Org to Class mode relabels every button and header automatically.`,
    `💡 You can edit or delete any payment history entry — totals recalculate instantly.`,
    `💡 Projects let you track event budgets separately from your main Cash Book.`,
    `💡 The "Quick Pay" button inside a student's edit card logs payment without leaving the page.`,
    `💡 Class Fund tracks missed weeks automatically once you set a start date.`,
    `💡 You can print the Financial Statement directly — it hides the rest of the page automatically.`,
    `💡 The A-Z index on the right of Collections lets you jump to any letter instantly.`,
    `💡 Cyberpunk mode isn't just dark — it adds neon glows, mono fonts, and restyles everything.`,
    `💡 Collection names are case-insensitive, so "Field Trip" and "field trip" are treated as the same.`,
    `💡 Tap any student name in the Database tab to see their balance across every collection.`
  ];

  const extremeGlances = [
    { x: 0, y: 22 }, { x: 0, y: -22 }, { x: -18, y: 0 }, { x: 18, y: 0 },
    { x: -14, y: -15 }, { x: 14, y: 15 }, { x: -14, y: 15 }, { x: 14, y: -15 }, { x: 0, y: 0 }
  ];
  let currentTransform = "translate(0px, 0px)";

  function ambientBehavior() {
    if (isInteracting) return;
    if (Math.random() < 0.25) {
      allEyes.forEach(eye => { eye.style.transform = currentTransform; eye.classList.add('blink'); });
      setTimeout(() => allEyes.forEach(eye => eye.classList.remove('blink')), 150);
    } else {
      const p = extremeGlances[Math.floor(Math.random() * extremeGlances.length)];
      currentTransform = `translate(${p.x}px, ${p.y}px)`;
      allEyes.forEach(eye => { eye.style.transform = currentTransform; });
    }
    ambientTimer = setTimeout(ambientBehavior, Math.random() * 500 + 600);
  }

    function triggerJump(reactionType) {
    if (isInteracting) return;
    isInteracting = true;
    clearTimeout(ambientTimer);
    allEyes.forEach(eye => eye.classList.remove('blink'));
    eveHead.classList.add('is-stretching');

    // 'lookup' = eyes glide up and glow. anything else = default smile.
    const reactionClass = reactionType === 'lookup' ? 'is-looking-up' : 'is-smiling';

    setTimeout(() => { eveHead.classList.add(reactionClass); }, 250);
    setTimeout(() => {
      eveHead.classList.remove('is-stretching', reactionClass);
      setTimeout(() => {
        isInteracting = false;
        currentTransform = "translate(0px, 0px)";
        ambientBehavior();
      }, 200);
    }, 1200);
  }

  function buildQueue() {
    const queue = [];
    const mode = (typeof getMode === 'function') ? getMode() : '';
    const activePage = document.querySelector('.page:not(.hidden)');
    const tabId = activePage ? activePage.id : '';

    if (mode === 'class' && db.classFund && db.classFund.records && db.classFund.weeklyDue) {
      let missedCount = 0;
      Object.keys(db.classFund.records).forEach(name => {
        if (typeof getMissedWeeks === 'function' && getMissedWeeks(name) > 0) missedCount++;
      });
      if (missedCount > 0) {
        queue.push({ text: `⚠ ${missedCount} student(s) missed class fund payments!`, action: 'goClassFund', label: 'View' });
      }
    }

    if (mode === 'org' && typeof computeCashbookTotals === 'function') {
      const cb = computeCashbookTotals();
      if (cb.cashOnHand < 0) {
        queue.push({ text: `⚠ Cash balance is ${peso(cb.cashOnHand)}. Review expenses!`, action: 'goCashbook', label: 'Fix' });
      }
    }

    const lastBackup = localStorage.getItem('lastBackupTime');
    if (!lastBackup) {
      queue.push({ text: `💾 You haven't backed up yet. Protect your records!`, action: 'backup', label: 'Back Up' });
    } else {
      const days = Math.floor((Date.now() - parseInt(lastBackup)) / 86400000);
      if (days > 7) queue.push({ text: `💾 Last backup was ${days} days ago. Back up soon!`, action: 'backup', label: 'Back Up' });
    }

    if (tabId === 'add-section') {
      if (db.students.length === 0) queue.push({ text: `👋 Add students in the Year Level tab first!`, action: 'goDatabase', label: 'Go' });
      else if (Object.keys(db.categories).length === 0) queue.push({ text: `💡 Create a collection category first.` });
      else queue.push({ text: `💡 Use the dropdowns to quickly find students and collections.` });
    }
    else if (tabId === 'database-section') {
      if (db.students.length === 0) queue.push({ text: `👋 Start by adding your first student or year level here.` });
      else queue.push({ text: `💡 Tap any student to see their balance across all collections.` });
    }
    else if (tabId === 'inventory-section') queue.push({ text: `📁 Browse collections A-Z. Tap one to add students or export CSV.` });
    else if (tabId === 'cashbook-section') {
      if (!db.cashbook.transactions.length) queue.push({ text: `💵 Log income & expenses to generate Financial Statements.` });
      else queue.push({ text: `💡 Link transactions to Projects for easier liquidation reports.` });
    }
    else if (tabId === 'classfund-section') {
      if (!db.classFund.startDate || !db.classFund.weeklyDue) queue.push({ text: `⚙️ Set weekly due & start date to begin tracking.` });
      else queue.push({ text: `💡 Tap a student card to expand and record their payment.` });
    }
    else if (tabId === 'summary-section') queue.push({ text: `📊 Generate Statements and export backups from here.` });

    return queue;
  }

  const ACTIONS = {
    goClassFund: () => { dismiss(); if (typeof switchTab === 'function') switchTab('classfund-section', document.getElementById('nav-classfund')); },
    goCashbook:  () => { dismiss(); if (typeof switchTab === 'function') switchTab('cashbook-section', document.getElementById('nav-cashbook')); },
    goDatabase:  () => { dismiss(); if (typeof switchTab === 'function') switchTab('database-section', document.getElementById('nav-students')); },
    goSummary:   () => { dismiss(); if (typeof switchTab === 'function') switchTab('summary-section', document.getElementById('nav-summary')); },
    backup:      () => { dismiss(); if (typeof exportBackup === 'function') exportBackup(); },
    exportCSV:   () => { dismiss(); if (typeof exportClassFundWeeklyCSV === 'function') exportClassFundWeeklyCSV(); }
  };

  function renderBubble(item) {
    if (!item || !msgEl || !speechBubble) return;
    lastBubbleShow = Date.now();                       // ← NEW
    msgEl.textContent = item.text;
    let html = '';
    if (item.action && ACTIONS[item.action]) {
      html += `<button class="eve-action-btn" onclick="EveAssistant.act('${item.action}')">${esc(item.label || 'Go')}</button>`;
    }
    html += `<button class="eve-dismiss-btn" onclick="EveAssistant.dismiss()">Dismiss</button>`;
    if (actionsEl) actionsEl.innerHTML = html;
    speechBubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => dismiss(), 12000);
  }

  function show() {
    msgQueue = buildQueue();
    msgIndex = 0;
    if (msgQueue.length) renderBubble(msgQueue[0]);
  }

  function next() {
    if (!msgQueue.length) msgQueue = buildQueue();
    if (!msgQueue.length) return;
    msgIndex = (msgIndex + 1) % msgQueue.length;
    renderBubble(msgQueue[msgIndex]);
  }

  function dismiss() {
    if (speechBubble) speechBubble.classList.remove('show');
    clearTimeout(bubbleTimer);
    clearTimeout(idleCycleTimer);
    if (idleCycleActive) idleCycleTimer = setTimeout(runIdleCycle, 10000);
  }

  function checkUrgent() {
    msgQueue = buildQueue();
    const urgent = msgQueue.find(m => m.text && m.text.startsWith('⚠'));
    if (urgent && !hasShownUrgent) {
      msgIndex = msgQueue.indexOf(urgent);
      renderBubble(urgent);
      hasShownUrgent = true;
    }
  }

  function runIdleCycle() {
    idleCycleTimer = null;
    if (!idleCycleActive) return;
    if (isInteracting || (speechBubble && speechBubble.classList.contains('show'))) {
      idleCycleTimer = setTimeout(runIdleCycle, 5000);
      return;
    }
    const tip = IDLE_TIPS[idleTipIndex % IDLE_TIPS.length];
    idleTipIndex++;
    renderBubble({ text: tip });
    idleCycleTimer = setTimeout(() => dismiss(), 5000);
  }

  function pauseIdleCycle() {
    clearTimeout(idleCycleTimer);
    idleCycleTimer = null;
  }

  function toggleEveIdle() {
    idleCycleActive = !idleCycleActive;
    const btn = document.getElementById('eve-idle-toggle');
    if (btn) {
      btn.classList.toggle('stopped', !idleCycleActive);
      btn.classList.toggle('running', idleCycleActive);
      btn.title = idleCycleActive ? 'Idle tips running — tap to stop' : 'Idle tips paused — tap to resume';
    }
    if (idleCycleActive) {
      runIdleCycle();
    } else {
      clearTimeout(idleCycleTimer);
      idleCycleTimer = null;
      if (speechBubble && speechBubble.classList.contains('show') && !msgQueue[msgIndex]?.action) dismiss();
    }
  }

  /* --- showMsg: displays alerts through EVE's bubble --- */
  function showMsg(msg) {
    clearTimeout(idleCycleTimer);
    idleCycleTimer = null;
    lastBubbleShow = Date.now();                       // ← NEW
    if (msgEl) msgEl.textContent = msg;
    if (actionsEl) actionsEl.innerHTML = '<button class="eve-dismiss-btn" onclick="EveAssistant.dismiss()">Dismiss</button>';
    if (speechBubble) speechBubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => dismiss(), 4000);
  }

  /* --- eveAlert: replaces native eveAlert() --- */
  function eveAlert(msg) {
    if (speechBubble && msgEl) {
      showMsg(msg);
    } else {
      nativeAlert(msg);
    }
  }

  /* --- Attach toggle button listener --- */
  const idleToggleBtn = document.getElementById('eve-idle-toggle');
  if (idleToggleBtn) {
    idleToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEveIdle();
    });
  }

  /* --- Head tap --- */
  if (eveHead) {
    eveHead.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      pauseIdleCycle();
      if (speechBubble && speechBubble.classList.contains('show')) { next(); }
      else { triggerJump(); setTimeout(show, 300); }
    });
    eveHead.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      pauseIdleCycle();
      if (speechBubble && speechBubble.classList.contains('show')) { next(); }
      else { triggerJump(); setTimeout(show, 300); }
    }, { passive: false });
  }

  /* --- Click outside to dismiss --- */
  document.addEventListener('click', (e) => {
    if (speechBubble && speechBubble.classList.contains('show') && !speechBubble.contains(e.target) && !eveHead.contains(e.target) && !e.target.closest('#eve-idle-toggle')) {
      if (Date.now() - lastBubbleShow < BUBBLE_GRACE_MS) return;   // ← NEW
      dismiss();
    }
  });

  /* --- Hook tab switches --- */
  if (typeof switchTab === 'function') {
    const _origSwitchTab = switchTab;
    window.switchTab = function(id, btn) {
      _origSwitchTab(id, btn);
      setTimeout(() => { msgQueue = buildQueue(); }, 300);
    };
  }

      window.EveAssistant = {
    show, next, dismiss, checkUrgent, toggleEveIdle, showMsg,
    react: (mode) => triggerJump(mode),   // ← this line
    act: (key) => { if (ACTIONS[key]) ACTIONS[key](); }
  };

  /* --- Expose eveAlert globally --- */
  window.eveAlert = eveAlert;

  /* --- Ignition --- */
  function initEve() {
    if (eveHead && speechBubble) {
      ambientBehavior();
      setTimeout(checkUrgent, 2500);
      setTimeout(runIdleCycle, 10000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEve);
  } else {
    initEve();
  }
})();