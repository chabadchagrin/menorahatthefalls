(function () {
  var API = window.MENORAH_API || "";
  var form = document.getElementById("rsvp");
  var totalEl = document.getElementById("total");
  var otherEl = document.getElementById("other");
  var errEl = document.getElementById("form-error");
  var btn = document.getElementById("submit");
  var thanks = document.getElementById("thanks");
  var chabadBox = document.getElementById("loc-chabad");
  var chabadCard = document.getElementById("chabad-card");

  function money(n) { return "$" + n.toFixed(2); }
  function otherAmount() {
    var v = parseFloat(String(otherEl.value).replace(/[^0-9.]/g, ""));
    return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
  }
  function total() {
    var t = 0;
    form.querySelectorAll('input[name="donation"]:checked').forEach(function (c) { t += Number(c.dataset.amount); });
    return t + otherAmount();
  }
  function refreshTotal() { totalEl.textContent = money(total()); }
  form.addEventListener("change", refreshTotal);
  otherEl.addEventListener("input", refreshTotal);

  function showError(msg) { errEl.textContent = msg; errEl.hidden = !msg; }
  function showThanks(html) {
    thanks.innerHTML = html; thanks.hidden = false; form.hidden = true;
    thanks.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function setChabadFull(full) {
    document.querySelectorAll(".chabad-full-note").forEach(function (p) { p.hidden = !full; });
    chabadBox.disabled = full;
    if (full) chabadBox.checked = false;
    chabadCard.classList.toggle("is-full", full);
  }

  function get(params) {
    var q = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    return fetch(API + "?" + q).then(function (r) { return r.json(); });
  }

  if (API) {
    get({ action: "status" }).then(function (s) { setChabadFull(!s.chabadOpen); }).catch(function () {});
  }

  // Returning from Stripe
  var qs = new URLSearchParams(location.search);
  if (qs.get("paid") && API) {
    get({ action: "confirm", session: qs.get("paid") }).then(function (r) {
      if (r.ok && r.paid) {
        showThanks("<h3>Thank you!</h3><p>Your registration and donation have been received. A confirmation email with your receipt is on its way.</p>");
      }
    }).catch(function () {});
    history.replaceState(null, "", location.pathname);
  } else if (qs.get("canceled")) {
    showError("Your registration was saved, but the donation was not completed. You can submit the form again to donate.");
    history.replaceState(null, "", location.pathname);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    showError("");
    var data = {
      fullName: form.fullName.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      participants: form.participants.value,
      riverside: form.riverside.checked,
      chabad: form.chabad.checked,
      donations: Array.prototype.map.call(form.querySelectorAll('input[name="donation"]:checked'), function (c) { return c.value; }),
      other: otherAmount(),
      website: form.website.value
    };
    if (!data.fullName || !data.email || !data.phone) return showError("Please fill in your name, email and phone number.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return showError("Please enter a valid email address.");
    if (!data.riverside && !data.chabad) return showError("Please choose where you will be joining.");
    if (!API) return showError("Registration is not open yet.");

    btn.disabled = true; btn.firstElementChild.textContent = "Submitting...";
    fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(data) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (r.chabadFull) setChabadFull(true);
        if (!r.ok) throw new Error(r.error || "Something went wrong. Please try again.");
        if (r.checkoutUrl) { location.href = r.checkoutUrl; return; }
        showThanks("<h3>Thank you!</h3><p>Your registration has been received. A confirmation email is on its way.</p>");
      })
      .catch(function (err) {
        showError(err.message || "Something went wrong. Please try again.");
        btn.disabled = false; btn.firstElementChild.textContent = "Submit Entry";
      });
  });
})();
