async function exportStatementImage() {
  const startVal = document.getElementById("stmt-start").value;
  const endVal = document.getElementById("stmt-end").value;
  const org = db.orgSettings || {};

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

  const incomeRows = Object.keys(incomeByCategory).sort().map(c => {
    const displayCat = c === "Year Levels Payment" ? "All Year Levels Payment" : c;
    return `<div class="statement-row"><span>${esc(displayCat)}</span><span>${peso(incomeByCategory[c])}</span></div>`;
  }).join("") || '<p class="note">No receipts recorded for this period.</p>';

  const expenseRows = Object.keys(expenseByCategory).sort().map(c =>
    `<div class="statement-row"><span>${esc(c)}</span><span>${peso(expenseByCategory[c])}</span></div>`
  ).join("") || '<p class="note">No disbursements recorded for this period.</p>';

  const html = `
    <div style="background:#fff; padding:32px 24px; max-width:720px; margin:0 auto; font-family:Inter,sans-serif; color:#1F2A24; min-height:100vh; box-sizing:border-box;">
      <div style="text-align:center; margin-bottom:18px; padding-bottom:12px; border-bottom:1.5px dashed #ddd;">
        <h3 style="font-size:17px; margin-bottom:4px; font-weight:bold;">${esc(org.orgName || "Organization Name")}</h3>
        <p style="font-size:12px; color:#6E7A72; margin-bottom:4px;">PUP Unisan Campus${org.schoolYear ? ' • S.Y. ' + esc(org.schoolYear) : ''}</p>
        <h4 style="font-size:14px; margin-bottom:4px; font-weight:bold;">STATEMENT OF RECEIPTS AND DISBURSEMENTS</h4>
        <p style="font-size:12px; color:#6E7A72;">For the period: ${esc(periodLabel)}</p>
      </div>

      <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:14px; font-family:'IBM Plex Mono',monospace; border-top:1px solid #ddd; margin-top:2px; padding-top:10px; font-weight:600;">
        <span>Beginning Cash Balance</span><b>${peso(beginningBalance)}</b>
      </div>

      <h4 style="margin-top:20px; font-size:13px; font-weight:bold; color:#163F2D;">Receipts</h4>
      ${incomeRows}
      <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:14px; font-family:'IBM Plex Mono',monospace; border-top:1px solid #ddd; margin-top:2px; padding-top:10px; font-weight:600;">
        <span>Total Receipts</span><b style="color:#2F7D53;">${peso(totalReceipts)}</b>
      </div>

      <h4 style="margin-top:20px; font-size:13px; font-weight:bold; color:#163F2D;">Disbursements</h4>
      ${expenseRows}
      <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:14px; font-family:'IBM Plex Mono',monospace; border-top:1px solid #ddd; margin-top:2px; padding-top:10px; font-weight:600;">
        <span>Total Disbursements</span><b style="color:#B3423B;">${peso(totalDisbursements)}</b>
      </div>

      <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:15px; font-family:'IBM Plex Mono',monospace; border-top:2px solid #1F5D42; margin-top:12px; padding-top:12px; font-weight:700;">
        <span>Ending Cash Balance</span><b>${peso(endingBalance)}</b>
      </div>

      <div style="display:flex; justify-content:space-between; margin-top:32px; gap:16px; text-align:center;">
        <div style="flex:1; min-width:0;">
          <p style="font-size:12px; color:#6E7A72; margin-bottom:4px;">Prepared by:</p>
          <p style="margin-top:24px; border-top:1px solid #1F2A24; padding-top:4px; font-weight:600; font-size:12px;">${esc(org.treasurerName || '_______________________')}</p>
          <p style="font-size:11px; color:#6E7A72;">Treasurer</p>
        </div>
        <div style="flex:1; min-width:0;">
          <p style="font-size:12px; color:#6E7A72; margin-bottom:4px;">Noted by:</p>
          <p style="margin-top:24px; border-top:1px solid #1F2A24; padding-top:4px; font-weight:600; font-size:12px;">${esc(org.presidentName || '_______________________')}</p>
          <p style="font-size:11px; color:#6E7A72;">President / Adviser</p>
        </div>
      </div>
      <p style="margin-top:18px; text-align:center; font-size:11px; color:#6E7A72;">Generated on ${new Date().toLocaleDateString()} via Treasurer Recorder</p>
    </div>
  `;

  // ── NATIVE SCREENSHOT PATH (Android) ──
  if (isAndroidApp()) {
    try {
      const plugins = window.Capacitor.Plugins || {};
      const { Screenshot, Share } = plugins;

      if (!Screenshot) {
        eveAlert("Screenshot plugin not found. Make sure @capawesome/capacitor-screenshot is installed and synced.", true);
        return;
      }

      // Create fullscreen overlay
      let overlay = document.getElementById('screenshot-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'screenshot-overlay';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.zIndex = '99999';
        overlay.style.background = '#ffffff';
        overlay.style.overflow = 'auto';
        overlay.style.display = 'none';
        document.body.appendChild(overlay);
      }
      overlay.innerHTML = html;
      overlay.style.display = 'block';

      // Let the WebView render it
      await new Promise(r => setTimeout(r, 600));

      // Take native screenshot of the visible screen
      const result = await Screenshot.take();

      // Hide overlay immediately
      overlay.style.display = 'none';
      overlay.innerHTML = '';

      if (!result || !result.uri) {
        throw new Error("Screenshot returned no image");
      }

      // Share the captured image file
      if (Share) {
        await Share.share({
          title: "Financial Statement",
          text: `Statement for ${org.orgName || 'Organization'} (${periodLabel})`,
          url: result.uri,
          dialogTitle: "Share Statement"
        });
      } else {
        eveAlert("Image saved. Share plugin not available.", true);
      }
    } catch (e) {
      eveAlert("Screenshot export failed: " + e.message, true);
    }
    return;
  }

  // ── DESKTOP FALLBACK (html2canvas via script tag) ──
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '720px';
  document.body.appendChild(container);

  try {
    if (!window.html2canvas) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    const canvas = await window.html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false
    });

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `statement-${new Date().toISOString().slice(0,10)}.png`;
    link.click();
  } catch (e) {
    eveAlert("Desktop export failed: " + e.message, true);
  } finally {
    document.body.removeChild(container);
  }
}
