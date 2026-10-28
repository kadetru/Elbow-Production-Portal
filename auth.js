/* Sign-in gate: the portal only loads after a Firebase sign-in. Also stands in for
   claude.ai's "downloads" so CSV export saves as a normal browser download. */
(function () {
  firebase.initializeApp(window.CFI_FIREBASE);
  const auth = firebase.auth(), $ = q => document.querySelector(q);
  let started = false, onReady = null;
  window.claude = { use: async name => {
    if (name !== "downloads") throw Object.assign(new Error("unavailable"), { code: "unavailable" });
    return { save: async ({ filename, data }) => {
      const url = URL.createObjectURL(new Blob([data], { type: /\.csv$/i.test(filename) ? "text/csv" : "application/octet-stream" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: filename }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } };
  } };
  function gate(show) { $("#authgate").classList.toggle("hidden", !show); document.body.classList.toggle("signed-out", show); }
  function msg(t, ok) { const m = $("#auth-msg"); m.textContent = t || ""; m.className = "auth-msg" + (ok ? " ok" : ""); }
  async function signIn(e) {
    e.preventDefault(); const b = $("#auth-go"); b.disabled = true; msg("");
    try { await auth.signInWithEmailAndPassword($("#auth-email").value.trim(), $("#auth-pass").value); }
    catch (err) { msg(/wrong-password|invalid-credential|user-not-found|invalid-email/.test(err.code || "") ? "That email and password don't match an account." : err.code === "auth/too-many-requests" ? "Too many tries. Wait a minute and try again." : "Couldn't sign in. Check the connection and try again."); }
    b.disabled = false;
  }
  async function reset() {
    const em = $("#auth-email").value.trim(); if (!em) return msg("Type your email first, then click Forgot password.");
    try { await auth.sendPasswordResetEmail(em); msg("If that email has an account, a reset link is on its way.", true); } catch { msg("Couldn't send the reset email. Check the address."); }
  }
  window.CFIAuth = {
    whenSignedIn(fn) { onReady = fn; if (started) fn(); },
    signOut: () => auth.signOut().then(() => location.reload()),
  };
  document.addEventListener("DOMContentLoaded", () => {
    $("#auth-form").addEventListener("submit", signIn); $("#auth-reset").addEventListener("click", reset);
    $("#signout").addEventListener("click", () => window.CFIAuth.signOut());
  });
  auth.onAuthStateChanged(u => {
    if (!u) { gate(true); return; }
    gate(false); const who = $("#whoami"); if (who) who.textContent = u.email;
    if (!started) { started = true; if (onReady) onReady(); }
  });
})();
