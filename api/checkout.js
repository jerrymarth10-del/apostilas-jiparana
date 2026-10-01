const crypto = require("crypto");

const API_BASE = "https://vendiro.com.br/api/sesau";

function noStore(res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("Pragma","no-cache");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","no-referrer");
}

function validUuid(value){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||""));
}

function clientIp(req){
  const raw=String(req.headers["x-forwarded-for"]||"").split(",")[0].trim() || String(req.headers["x-real-ip"]||"").trim();
  return raw.length<=64 && /^[0-9a-fA-F:.]+$/.test(raw) ? raw : "unknown";
}

function serviceToken(req){
  const token=String(req.headers["x-vercel-oidc-token"]||process.env.VERCEL_OIDC_TOKEN||"").trim();
  if(!token && String(process.env.VERCEL_ENV||"").toLowerCase()==="production"){
    throw new Error("Identidade interna da Vercel indisponível.");
  }
  return token;
}

async function proxyPost(path,payload,req){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const token=serviceToken(req);
    const response=await fetch(API_BASE+path,{
      method:"POST",
      cache:"no-store",
      signal:controller.signal,
      headers:{
        "Content-Type":"application/json",
        "Accept":"application/json",
        ...(token?{"Authorization":"Bearer "+token}:{}),
        "X-JR-Client-IP":clientIp(req)
      },
      body:JSON.stringify(payload)
    });
    const data=await response.json().catch(()=>({error:"Resposta inválida do servidor de pagamento."}));
    return {status:response.status,data};
  }finally{clearTimeout(timer);}
}

module.exports=async function handler(req,res){
  noStore(res);
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método não permitido."});}
  const length=Number(req.headers["content-length"]||0);
  if(length>8192) return res.status(413).json({error:"Requisição muito grande."});
  const contentType=String(req.headers["content-type"]||"").toLowerCase();
  if(contentType && !contentType.startsWith("application/json")) return res.status(415).json({error:"Formato de requisição inválido."});

  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const checkoutKey=validUuid(body.checkoutKey)?String(body.checkoutKey):crypto.randomUUID();
    const out=await proxyPost("/checkout",{
      name:body.name,
      email:body.email,
      cpf:body.cpf,
      area:body.area,
      paymentMethod:body.paymentMethod,
      checkoutKey
    },req);
    return res.status(out.status).json(out.data);
  }catch(err){
    console.error("SESAU checkout proxy:",err?.message||err);
    return res.status(err?.name==="AbortError"?504:500).json({error:"Checkout temporariamente indisponível."});
  }
};
