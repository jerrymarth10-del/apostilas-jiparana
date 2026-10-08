module.exports = function proxy(action, kind) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Método não permitido." }); }
    if (Number(req.headers["content-length"] || 0) > 16384) return res.status(413).json({ error: "Requisição muito grande." });
    if (!String(req.headers["content-type"] || "").startsWith("application/json")) return res.status(415).json({ error: "Formato inválido." });
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const oidc = String(req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN || "").trim();
      if (!oidc) throw new Error("Identidade interna indisponível.");
      const rawIp = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
      const ip = rawIp.length <= 64 && /^[0-9a-fA-F:.]+$/.test(rawIp) ? rawIp : "unknown";
      // Only the webhook endpoint can send a notification; no client action override.
      const payload = action === "webhook"
        ? { order_nsu: body.order_nsu, invoice_slug: body.invoice_slug, transaction_nsu: body.transaction_nsu }
        : { checkoutToken: String(body.checkoutToken || "").slice(0, 8192),
          order_nsu: body.order_nsu, slug: body.slug, transaction_nsu: body.transaction_nsu };
      const response = await fetch("https://vendiro.com.br/api/" + kind + "/status", {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(50000),
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + oidc, "X-JR-Client-IP": ip },
        body: JSON.stringify({ ...payload, infinitepayAction: action }),
      });
      const data = await response.json().catch(() => {
        console.error("InfinitePay upstream response:", response.status, response.headers.get("content-type"), response.headers.get("x-vercel-mitigated"));
        return { error: "Não foi possível confirmar a InfinitePay agora. Tente novamente em alguns instantes." };
      });
      // InfinitePay retries unsuccessful notifications on 400.
      return res.status(action === "webhook" && !response.ok ? 400 : response.status).json(data);
    } catch (error) {
      console.error("InfinitePay proxy:", error.message);
      return res.status(action === "webhook" ? 400 : 502).json({ error: "Não foi possível processar a InfinitePay agora. Tente novamente." });
    }
  };
};
