const API_BASE = "https://vendiro.com.br/api/sesau";

function noStore(res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("Pragma","no-cache");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","no-referrer");
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

module.exports=async function handler(req,res){
  noStore(res);
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método não permitido."});}
  const length=Number(req.headers["content-length"]||0);
  if(length>12288) return res.status(413).json({error:"Requisição muito grande."});
  const contentType=String(req.headers["content-type"]||"").toLowerCase();
  if(contentType && !contentType.startsWith("application/json")) return res.status(415).json({error:"Formato de requisição inválido."});

  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const checkoutToken=String(body.checkoutToken||"");
    if(!checkoutToken || checkoutToken.length>8192) return res.status(400).json({error:"Checkout inválido."});

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const token=serviceToken(req);
      const response=await fetch(API_BASE+"/status",{
        method:"POST",
        cache:"no-store",
        signal:controller.signal,
        headers:{
          "Content-Type":"application/json",
          "Accept":"application/json",
          ...(token?{"Authorization":"Bearer "+token}:{}),
          "X-JR-Client-IP":clientIp(req)
        },
        body:JSON.stringify({checkoutToken})
      });
      const data=await response.json().catch(()=>({error:"Resposta inválida do servidor de pagamento."}));
      return res.status(response.status).json(data);
    }finally{clearTimeout(timer);}
  }catch(err){
    console.error("SESAU status proxy:",err?.message||err);
    return res.status(err?.name==="AbortError"?504:500).json({error:"Não foi possível confirmar o pagamento agora."});
  }
};
