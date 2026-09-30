const API_BASE = "https://vendiro.com.br/api/sesau";

function noStore(res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("Pragma","no-cache");
  res.setHeader("X-Content-Type-Options","nosniff");
}

function requestOrigin(req){
  const host=String(req.headers["x-forwarded-host"]||req.headers.host||"").trim();
  return host ? "https://"+host : "https://apostilas-jiparana-xrse.vercel.app";
}

module.exports=async function handler(req,res){
  noStore(res);
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método não permitido."});}
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(API_BASE+"/status",{
        method:"POST",
        cache:"no-store",
        signal:controller.signal,
        headers:{
          "Content-Type":"application/json",
          "Accept":"application/json",
          "Origin":requestOrigin(req)
        },
        body:JSON.stringify({checkoutToken:body.checkoutToken||""})
      });
      const data=await response.json().catch(()=>({error:"Resposta inválida do servidor de pagamento."}));
      return res.status(response.status).json(data);
    }finally{clearTimeout(timer);}
  }catch(err){
    console.error("SESAU status proxy:",err?.message||err);
    return res.status(err?.name==="AbortError"?504:500).json({error:"Não foi possível confirmar o pagamento agora."});
  }
};
