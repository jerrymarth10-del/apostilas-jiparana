const CANONICAL_CHECKOUT = "https://semusa-sesau-app.vercel.app/api/checkout";

function noStore(res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("Pragma","no-cache");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","no-referrer");
}

module.exports=async function handler(req,res){
  noStore(res);
  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return res.status(405).json({error:"Método não permitido."});
  }

  const length=Number(req.headers["content-length"]||0);
  if(length>8192)return res.status(413).json({error:"Requisição muito grande."});

  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(CANONICAL_CHECKOUT,{
        method:"POST",
        cache:"no-store",
        signal:controller.signal,
        headers:{
          "Content-Type":"application/json",
          "Accept":"application/json"
        },
        body:JSON.stringify(body)
      });
      const data=await response.json().catch(()=>({error:"Resposta inválida do servidor de pagamento."}));
      return res.status(response.status).json(data);
    }finally{
      clearTimeout(timer);
    }
  }catch(err){
    console.error("SEMUSA checkout legacy:",err?.message||err);
    return res.status(err?.name==="AbortError"?504:500).json({error:"Checkout temporariamente indisponível."});
  }
};
