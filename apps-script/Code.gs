/**
 * Menorah at the Falls 2026 - registration backend.
 * Google Apps Script web app (project in rabbi@jewishchagrinfalls.com) linked to the registration Google Sheet (SHEET_ID below). See README.md.
 *
 * Secret: Project Settings > Script Properties > STRIPE_SECRET_KEY (live restricted key "Menorah form").
 * Everything else is edited on the "Settings" tab of the sheet.
 */

var SHEET_ID = '1aZVuxBNrEI9_SZ6mTBnAIoep2cfCv5IqmstS30eT2G4'; // the registration Google Sheet
var book = function () { return SpreadsheetApp.openById(SHEET_ID); };
var LOGO = 'https://images.squarespace-cdn.com/content/v1/6a6f9b91b690e708b15d6c6f/1785699222426-Z5OSPRAW818GCLBNWMBX/transparent+square.png?format=300w';
var EMAIL_TOP = '<div style="text-align:right;font-size:12px;color:#666">BH</div>' +
  '<div style="text-align:center;margin:0 0 12px"><img src="' + LOGO + '" alt="Chabad at the Falls" width="110" style="width:110px;height:auto"></div>';
var REG = 'Registrations';
var SET = 'Settings';
var HEAD = ['Submitted', 'Name', 'Email', 'Phone', 'Participants', 'Riverside Park', 'Chabad party',
  'Donation items', 'Donation total', 'Payment status', 'Amount paid', 'Receipt #', 'Stripe session',
  'Added to DAAS', 'ID'];
var C = {}; HEAD.forEach(function (h, i) { C[h] = i + 1; });

var ITEMS = {
  dreidel:   { name: 'DREIDEL', amount: 36 },
  candle:    { name: 'CANDLE', amount: 54 },
  menorah:   { name: 'MENORAH', amount: 180 },
  flame:     { name: 'FLAME', amount: 360 },
  nightly:   { name: 'ONE NIGHT OF NIGHTLY LIGHTINGS', amount: 540 },
  cosponsor: { name: 'MENORAH AT THE FALLS CO-SPONSOR', amount: 1800 }
};

/* ---------- one-time setup: run this once from the editor ---------- */
function setup() {
  var ss = book();
  var reg = ss.getSheetByName(REG) || ss.insertSheet(REG, 0);
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0) ss.deleteSheet(blank);
  reg.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
  reg.setFrozenRows(1);
  reg.getRange(2, C['Donation total'], 999, 2).setNumberFormat('$#,##0.00');

  var set = ss.getSheetByName(SET) || ss.insertSheet(SET);
  if (set.getLastRow() < 2) {
    set.getRange(1, 1, 8, 2).setValues([
      ['Setting', 'Value'],
      ['Chabad party open', true],
      ['Chabad party capacity (people, blank = no limit)', ''],
      ['Organizer email (gets every submission)', 'simi@jewishchagrinfalls.com, rabbi@jewishchagrinfalls.com'],
      ['Organization name on receipts', 'Chabad at the Falls'],
      ['EIN on receipts', '87-4668165'],
      ['Website', 'https://menorahatthefalls.com'],
      ['Email sender name', 'Chabad at the Falls']
    ]);
    set.getRange('B2').insertCheckboxes();
    set.getRange(1, 1, 1, 2).setFontWeight('bold');
    set.setColumnWidth(1, 360);
  }

  var sum = ss.getSheetByName('Summary') || ss.insertSheet('Summary');
  sum.getRange(1, 1, 7, 2).setValues([
    ['Registrations', '=COUNTA(Registrations!B2:B)'],
    ['Total participants', '=SUMPRODUCT(IF(Registrations!B2:B="",0,IF(Registrations!E2:E="",1,Registrations!E2:E)))'],
    ['Riverside Park participants', '=SUMPRODUCT((Registrations!F2:F="Yes")*IF(Registrations!E2:E="",1,Registrations!E2:E))'],
    ['Chabad party participants', '=SUMPRODUCT((Registrations!G2:G="Yes")*IF(Registrations!E2:E="",1,Registrations!E2:E))'],
    ['Donations paid', '=SUMIF(Registrations!J2:J,"Paid",Registrations!K2:K)'],
    ['Donations pending', '=COUNTIF(Registrations!J2:J,"Pending payment")'],
    ['Not yet added to DAAS', '=COUNTIFS(Registrations!B2:B,"<>",Registrations!N2:N,FALSE)']
  ]);
  sum.getRange('B5').setNumberFormat('$#,##0.00');
  sum.getRange('A1:A7').setFontWeight('bold');
  sum.setColumnWidth(1, 240);

  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkPendingPayments').timeBased().everyMinutes(10).create();
  // Touch the services once so Google asks for all permissions now.
  MailApp.getRemainingDailyQuota();
}

/* ---------- web endpoints ---------- */
function ensureSetup() { if (!book().getSheetByName(SET)) setup(); }

function doGet(e) {
  ensureSetup();
  var p = (e && e.parameter) || {};
  if (p.action === 'confirm' && p.session) {
    var row = findRow(C['Stripe session'], p.session);
    if (!row) return json({ ok: false });
    var status = settle(row);
    return json({ ok: true, paid: status === 'Paid' });
  }
  return json({ ok: true, chabadOpen: chabadOpen() });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    ensureSetup();
    var d = JSON.parse(e.postData.contents);
    if (d.website) return json({ ok: true }); // bot trap
    var name = clean(d.fullName, 120), email = clean(d.email, 200), phone = clean(d.phone, 40);
    if (!name || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'Please fill in your name, email and phone number.' });
    var people = parseInt(d.participants, 10);
    if (!(people >= 1 && people <= 10)) people = '';
    var riverside = !!d.riverside, chabad = !!d.chabad;
    if (!riverside && !chabad) return json({ ok: false, error: 'Please choose where you will be joining.' });
    if (chabad && !chabadOpen(people || 1)) {
      return json({ ok: false, chabadFull: true, error: 'The Chanukah party at Chabad is full.' });
    }

    var picked = (d.donations || []).filter(function (k) { return ITEMS[k]; });
    var other = Math.round(Math.max(0, Number(d.other) || 0) * 100) / 100;
    if (other > 25000) other = 0;
    var lines = picked.map(function (k) { return { name: ITEMS[k].name, amount: ITEMS[k].amount }; });
    if (other > 0) lines.push({ name: 'OTHER DONATION', amount: other });
    var total = lines.reduce(function (s, l) { return s + l.amount; }, 0);

    var id = Utilities.getUuid().slice(0, 8);
    var row = [new Date(), name, email, phone, people, riverside ? 'Yes' : 'No', chabad ? 'Yes' : 'No',
      lines.map(function (l) { return l.name + ' $' + l.amount; }).join(', '), total,
      total > 0 ? 'Pending payment' : 'No donation', '', '', '', false, id];
    var sh = sheet(REG);
    sh.appendRow(row);
    var r = sh.getLastRow();
    sh.getRange(r, C['Added to DAAS']).insertCheckboxes();

    if (total > 0) {
      var session = createCheckout(lines, email, id);
      sh.getRange(r, C['Stripe session']).setValue(session.id);
      return json({ ok: true, checkoutUrl: session.url });
    }
    sendEmails(r);
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Something went wrong. Please try again.' });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Stripe ---------- */
function stripe(method, path, payload) {
  var key = PropertiesService.getScriptProperties().getProperty('STRIPE_SECRET_KEY');
  var res = UrlFetchApp.fetch('https://api.stripe.com/v1/' + path, {
    method: method, payload: payload, muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + key }
  });
  var body = JSON.parse(res.getContentText());
  if (res.getResponseCode() >= 300) throw new Error('Stripe: ' + (body.error && body.error.message));
  return body;
}

function createCheckout(lines, email, id) {
  var site = setting('Website').replace(/\/$/, '');
  var p = {
    mode: 'payment',
    submit_type: 'donate',
    customer_email: email,
    client_reference_id: id,
    'metadata[registration_id]': id,
    success_url: site + '/?paid={CHECKOUT_SESSION_ID}',
    cancel_url: site + '/?canceled=1',
    expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60)
  };
  lines.forEach(function (l, i) {
    p['line_items[' + i + '][quantity]'] = '1';
    p['line_items[' + i + '][price_data][currency]'] = 'usd';
    p['line_items[' + i + '][price_data][unit_amount]'] = String(Math.round(l.amount * 100));
    p['line_items[' + i + '][price_data][product_data][name]'] = l.name;
  });
  return stripe('post', 'checkout/sessions', p);
}

/** Looks up a pending row's Stripe session and finishes it (marks paid, sends emails). Returns the status. */
function settle(r) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet(REG);
    var status = sh.getRange(r, C['Payment status']).getValue();
    if (status !== 'Pending payment') return status;
    var s = stripe('get', 'checkout/sessions/' + sh.getRange(r, C['Stripe session']).getValue());
    if (s.payment_status === 'paid') {
      var n = 1 + sh.getRange(2, C['Receipt #'], Math.max(1, sh.getLastRow() - 1), 1).getValues()
        .filter(function (v) { return v[0]; }).length;
      sh.getRange(r, C['Payment status'], 1, 3).setValues([['Paid', s.amount_total / 100, '2026-' + ('000' + n).slice(-4)]]);
      SpreadsheetApp.flush();
      sendEmails(r);
      return 'Paid';
    }
    if (s.status === 'expired') {
      sh.getRange(r, C['Payment status']).setValue('Donation not completed');
      SpreadsheetApp.flush();
      sendEmails(r);
      return 'Donation not completed';
    }
    return status;
  } finally {
    lock.releaseLock();
  }
}

/** Runs every 10 minutes: finishes any registration whose payment page was left open or closed. */
function checkPendingPayments() {
  var sh = sheet(REG);
  if (sh.getLastRow() < 2) return;
  var st = sh.getRange(2, C['Payment status'], sh.getLastRow() - 1, 1).getValues();
  st.forEach(function (v, i) {
    if (v[0] === 'Pending payment') { try { settle(i + 2); } catch (e) { console.error(e); } }
  });
}

/* ---------- email ---------- */
function sendEmails(r) {
  var sh = sheet(REG);
  var v = sh.getRange(r, 1, 1, HEAD.length).getValues()[0];
  var g = function (h) { return v[C[h] - 1]; };
  var org = setting('Organization name on receipts');
  var organizer = setting('Organizer email (gets every submission)');
  var sender = setting('Email sender name') || org;
  var paid = g('Payment status') === 'Paid';

  var chabadYes = g('Chabad party') === 'Yes';
  var pin = '&#128205; ';

  var html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px;line-height:1.5">' +
    EMAIL_TOP +
    '<h2 style="color:#7a4b00;margin:0 0 4px">Menorah at the Falls</h2>' +
    '<p style="margin:0 0 16px"><b>Sunday, December 6 · 5:00 PM</b></p>' +
    '<p>Dear ' + esc(g('Name')) + ',</p>' +
    '<p>Thank you for registering! See you on Sunday, December 6th, 3rd night of Chanukah.</p>' +
    '<p><b>Please note the event schedule:</b></p>' +
    '<p><b>Menorah lighting in Riverside Park</b><br>' +
    '<b>5pm:</b> Enjoy music and entertainment with Jesse Jukebox and hot drinks.<br>' +
    '<b>5:30pm:</b> Menorah lighting and a Gelt Drop, with Chanukah treats raining down from a fire truck!</p>' +
    '<p>' + pin + '<a href="https://maps.app.goo.gl/YZuhB8dhWwj8TaRt9" style="color:#7a4b00"><b>Riverside Park, Chagrin Falls Main Street</b></a></p>' +
    (chabadYes ? '<p>Followed by the <b>Chanukah party at Chabad</b><br>' + pin + '<a href="https://maps.app.goo.gl/dvTj5EaiTnVV9A2t8" style="color:#7a4b00">Chabad at the Falls | 100 N Main Street, Suite 100</a></p>' : '') +
    (g('Participants') ? '<p>Number of participants: ' + g('Participants') + '</p>' : '') +
    '<p>Chanukah begins on Friday, December 4th. Visit <a href="https://menorahatthefalls.com">menorahatthefalls.com</a> for the full schedule of nightly Menorah lightings in the Triangle in Chagrin Falls.</p>';

  if (paid) {
    html += '<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">' +
      '<p>Thank you so much for your contribution, and for spreading the light of Chanukah!</p>' +
      '<h3 style="margin:0 0 8px">Donation receipt</h3>' +
      '<table style="font-size:15px;border-collapse:collapse">' +
      tr('Receipt #', g('Receipt #')) +
      tr('Date', Utilities.formatDate(new Date(), 'America/New_York', 'MMMM d, yyyy')) +
      tr('Donor', esc(g('Name'))) +
      tr('Donation', esc(g('Donation items'))) +
      tr('Amount', '$' + Number(g('Amount paid')).toFixed(2)) +
      tr('Received by', esc(org) + '.') +
      '</table>' +
      '<p style="color:#555;font-size:13px">No goods or services were provided in exchange for this contribution.' +
      (setting('EIN on receipts') ? ' Tax ID EIN ' + esc(setting('EIN on receipts')) + '.' : '') + '</p>';
  } else if (g('Payment status') === 'Donation not completed') {
    html += '<p style="color:#555">Your registration is confirmed. The donation was not completed, so no payment was taken.</p>';
  }
  html += '<p style="margin-top:24px"><a href="https://jewishchagrinfalls.com">jewishchagrinfalls.com</a></p></div>';

  MailApp.sendEmail({
    to: g('Email'),
    subject: paid ? 'Menorah at the Falls: registration and donation receipt' : 'Menorah at the Falls: registration confirmed',
    htmlBody: html, name: sender
  });

  if (organizer) {
    var rows = HEAD.slice(1, 12).map(function (h) { return tr(h, esc(String(g(h)))); }).join('');
    MailApp.sendEmail({
      to: organizer,
      subject: 'New registration: ' + g('Name') + (paid ? ' ($' + Number(g('Amount paid')).toFixed(2) + ' donation)' : ''),
      htmlBody: '<div style="font-family:Arial,sans-serif;max-width:560px">' + EMAIL_TOP + '</div>' + '<table style="font-family:Arial,sans-serif;font-size:14px">' + rows + '</table>' +
        '<p><a href="' + book().getUrl() + '">Open the registration sheet</a></p>',
      name: sender, replyTo: g('Email')
    });
  }
}

/* ---------- helpers ---------- */
function chabadOpen(adding) {
  if (setting('Chabad party open') !== true) return false;
  var cap = Number(setting('Chabad party capacity (people, blank = no limit)'));
  if (!cap) return true;
  var sh = sheet(REG), n = sh.getLastRow() - 1, used = 0;
  if (n > 0) sh.getRange(2, 1, n, HEAD.length).getValues().forEach(function (v) {
    if (v[C['Chabad party'] - 1] === 'Yes') used += Number(v[C['Participants'] - 1]) || 1;
  });
  return used + (adding || 1) <= cap;
}
function setting(label) {
  var vals = sheet(SET).getRange(1, 1, sheet(SET).getLastRow(), 2).getValues();
  for (var i = 0; i < vals.length; i++) if (vals[i][0] === label) return vals[i][1];
  return '';
}
function sheet(n) { return book().getSheetByName(n); }
function findRow(col, val) {
  var sh = sheet(REG); if (sh.getLastRow() < 2) return 0;
  var vals = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (vals[i][0] === val) return i + 2;
  return 0;
}
function clean(s, max) {
  s = String(s || '').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s; // stop spreadsheet formulas
}
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function tr(k, v) { return '<tr><td style="padding:3px 12px 3px 0;color:#666">' + k + '</td><td style="padding:3px 0">' + v + '</td></tr>'; }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
