const crypto = require("crypto");
const API_BASE = "https://vendiro.com.br/api/infinitepay";
function noStore(res) {
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("X-Content-Type-Options","nosniff");
}
function clientIp(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return ip.length <= 64 && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : "unknown";
}
function serviceToken(req) {
  const token = String(req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN || "").trim();
  if (!token && String(process.env.VERCEL_ENV || "").toLowerCase() === "production")
    throw new Error("Identidade interna da Vercel indisponível.");
  return token;
}
async function proxy(path, body, req) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const token = serviceToken(req);
    const response = await fetch(API_BASE + path, {
      method: "POST", cache: "no-store", signal: controller.signal,
      headers: {
        "Content-Type":"application/json", "Accept":"application/json",
        ...(token ? {Authorization:"Bearer " + token} : {}),
        "X-JR-Client-IP":clientIp(req),
        "X-JR-User-Agent":String(req.headers["user-agent"] || "").slice(0,512),
      }, body:JSON.stringify(body),
    });
    return {status:response.status, data:await response.json().catch(() => ({error:"Resposta inválida do servidor."}))};
  } finally { clearTimeout(timer); }
}
module.exports = async function handler(req,res) {
  noStore(res);
  if (req.method !== "POST") return res.status(405).json({error:"Método não permitido."});
  if (Number(req.headers["content-length"] || 0) > 8192) return res.status(413).json({error:"Requisição grande demais."});
  const type = String(req.headers["content-type"] || "").toLowerCase();
  if (type && !type.startsWith("application/json")) return res.status(415).json({error:"Formato inválido."});
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const out = await proxy("/status", {
      kind:"sesau", checkoutToken:body.checkoutToken,
      transactionNsu:body.transactionNsu, slug:body.slug
    }, req);
    return res.status(out.status).json(out.data);
  } catch (err) {
    console.error("InfinitePay proxy:", err?.message || err);
    return res.status(err?.name === "AbortError" ? 504 : 500)
      .json({error:"Pagamento InfinitePay temporariamente indisponível."});
  }
};
