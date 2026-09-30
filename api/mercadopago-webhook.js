const crypto=require("crypto");
const {noStore,mpFetch}=require("./_payment");

function verifySignature(req,dataId){
  const secret=String(process.env.MERCADOPAGO_WEBHOOK_SECRET||"");
  if(!secret) return String(process.env.VERCEL_ENV||"").toLowerCase()!=="production";
  const raw=String(req.headers["x-signature"]||"");
  const requestId=String(req.headers["x-request-id"]||"");
  let ts="",received="";
  raw.split(",").forEach(part=>{const [k,...r]=part.split("=");const v=r.join("=").trim();if(k?.trim()==="ts")ts=v;if(k?.trim()==="v1")received=v;});
  if(!ts||!received) return false;
  let manifest="";
  if(dataId) manifest+="id:"+String(dataId).toLowerCase()+";";
  if(requestId) manifest+="request-id:"+requestId+";";
  manifest+="ts:"+ts+";";
  const expected=crypto.createHmac("sha256",secret).update(manifest).digest("hex");
  try{const a=Buffer.from(expected,"hex"),b=Buffer.from(received,"hex");return a.length===b.length&&crypto.timingSafeEqual(a,b);}catch{return false;}
}

module.exports=async function handler(req,res){
  noStore(res);
  if(req.method!=="POST") return res.status(200).json({ok:true});
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const queryId=req.query?.["data.id"]||req.query?.id||"";
    const id=String(queryId||body?.data?.id||body?.id||"").trim();
    if(!id || !/^[A-Za-z0-9._:-]{1,160}$/.test(id)) return res.status(200).json({ok:true});
    if(!verifySignature(req,queryId||id)) return res.status(401).json({error:"Assinatura inválida."});
    // Reconsulta autenticada: nunca confia apenas no payload recebido.
    const mp=await mpFetch("/v1/payments/"+encodeURIComponent(id),{method:"GET"});
    if(mp.ok) await mp.json().catch(()=>null);
    return res.status(200).json({ok:true});
  }catch(err){
    console.error("Webhook SESAU:",err?.message||err);
    return res.status(200).json({ok:true});
  }
};
