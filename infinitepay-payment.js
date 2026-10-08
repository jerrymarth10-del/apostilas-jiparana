(function () {
  "use strict";
  const KIND = "sesau";
  const KEY = "jr_" + KIND + "_infinitepay_v1";
  const MP_KEY = "jr_" + KIND + "_card_return_v2";
  let checking = false;
  let timer;
  function save(value) { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch {} }
  function saved() {
    try { const value = JSON.parse(localStorage.getItem(KEY) || "null");
      return value && Date.now() - Number(value.createdAt || 0) < 24 * 60 * 60 * 1000 ? value : null;
    } catch { return null; }
  }
  function removeKeys() { try { localStorage.removeItem(KEY); localStorage.removeItem(MP_KEY); } catch {} }
  async function post(path, body) {
    const response = await fetch(path, { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível continuar o pagamento agora.");
    return data;
  }
  function panel(title, message, buttonText, action) {
    let box = document.getElementById("infinitePayAlternative");
    if (!box) {
      box = document.createElement("div"); box.id = "infinitePayAlternative";
      box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite");
      box.style.cssText = "border:1px solid #c9dfcd;border-radius:14px;padding:18px;margin:16px 0;background:#f4faf5;color:#172b20;text-align:center";
      (document.getElementById("checkoutCard") || document.body).prepend(box);
    }
    box.replaceChildren();
    const strong = document.createElement("strong"); strong.textContent = title;
    const text = document.createElement("p"); text.textContent = message;
    text.style.cssText = "font-size:.9rem;line-height:1.5;margin:10px 0";
    box.append(strong, text);
    if (action) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = buttonText;
      button.className = "btn btn-primary submit";
      button.style.cssText = "width:100%;background:#286b34;color:#fff;border:0;cursor:pointer";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await action(); }
        catch (error) { text.textContent = error.message; button.disabled = false; }
      }); box.append(button);
    }
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function openAccess(data) {
    if (!data.accessToken || data.platformUrl !== "https://sesau-certo.vercel.app") throw new Error("Não foi possível recuperar o acesso.");
    removeKeys(); clearTimeout(timer);
    const u = new URL(location.href);
    ["infinite_return", "it", "t", "card_return", "order_nsu", "slug", "transaction_nsu", "capture_method", "receipt_url",
      "payment_id", "collection_id", "status", "collection_status", "external_reference", "preference_id", "merchant_order_id", "payment_type"].forEach(k => u.searchParams.delete(k));
    history.replaceState(null, "", u.pathname + u.search + u.hash);
    const form = document.createElement("form"); form.method = "POST";
    form.action = data.platformUrl + "/api/purchase-entry"; form.style.display = "none";
    const token = document.createElement("input"); token.type = "hidden"; token.name = "token"; token.value = data.accessToken;
    form.append(token); document.body.append(form); form.submit();
  }
  async function checkInfinite(attempt, remaining = 6) {
    if (checking) return;
    checking = true;
    try {
      const data = await post("/api/infinitepay-status", attempt);
      if (data.approved) return openAccess(data);
      panel("Aguardando confirmação da InfinitePay", "Seu acesso será liberado após a confirmação. Se já pagou, aguarde; você não precisa pagar novamente.",
        "VERIFICAR PAGAMENTO", () => checkInfinite(attempt));
      if (!attempt.transaction_nsu && attempt.checkoutUrl) {
        const box = document.getElementById("infinitePayAlternative");
        const resume = document.createElement("a"); resume.href = attempt.checkoutUrl;
        resume.textContent = "Continuar meu checkout na InfinitePay";
        resume.style.cssText = "display:block;margin-top:12px;text-decoration:underline"; box.append(resume);
      }
      if (remaining > 0) timer = setTimeout(() => checkInfinite(attempt, remaining - 1), 5000);
    } catch (error) {
      panel("Confirme seu pagamento", error.message, "VERIFICAR NOVAMENTE", () => checkInfinite(attempt));
    } finally { checking = false; }
  }
  function onCardStatus(event) {
    const data = event.detail;
    if (!data || saved()) return;
    clearTimeout(timer);
    if (data.status === "rejected" && data.fallbackAvailable === true) {
      panel("Seu cartão não foi aprovado pelo Mercado Pago", "Você pode tentar pagar pela InfinitePay, mantendo o mesmo preparatório, cargo e valor.",
        "TENTAR PAGAR COM INFINITEPAY", async () => {
          const result = await post("/api/infinitepay-checkout", { checkoutToken: data.checkoutToken });
          if (result.approved) return openAccess(result);
          const url = new URL(result.checkoutUrl);
          if (url.protocol !== "https:" || !["checkout.infinitepay.io", "buy.infinitepay.io"].includes(url.hostname)) throw new Error("Checkout inválido.");
          save({ checkoutToken: result.checkoutToken, checkoutUrl: url.href, createdAt: Date.now() });
          try { localStorage.removeItem(MP_KEY); } catch {}
          location.assign(url.href);
        });
    }
  }
  window.addEventListener("jr:card-status", onCardStatus);
  function install() {
    const u = new URL(location.href);
    let attempt = saved();
    if (u.searchParams.get("infinite_return") === "1" && u.searchParams.get("it")) {
      attempt = { ...(attempt || {}), checkoutToken: u.searchParams.get("it"),
        order_nsu: u.searchParams.get("order_nsu") || "", slug: u.searchParams.get("slug") || "",
        transaction_nsu: u.searchParams.get("transaction_nsu") || "", createdAt: Date.now() };
      save(attempt);
    }
    if (attempt) checkInfinite(attempt);
    const recover = document.getElementById("recoverToggle");
    if (recover) recover.addEventListener("click", event => {
      const attempt = saved(); if (!attempt) return;
      event.stopImmediatePropagation(); event.preventDefault(); clearTimeout(timer); checkInfinite(attempt);
    }, true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
})();
