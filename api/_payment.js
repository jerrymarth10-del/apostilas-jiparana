const crypto = require("crypto");

const PRODUCT_ID = "sesau-ro-completo";
const PRODUCT_NAME = "Preparatório Completo SESAU Rondônia";
const DEFAULT_PRICE = 129.90;

function noStore(res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("Pragma","no-cache");
  res.setHeader("X-Content-Type-Options","nosniff");
}

function onlyDigits(v){ return String(v||"").replace(/\D/g,""); }

function validCpf(value){
  const cpf=onlyDigits(value);
  if(cpf.length!==11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum=0;
  for(let i=0;i<9;i++) sum+=Number(cpf[i])*(10-i);
  let d=(sum*10)%11; if(d===10)d=0;
  if(d!==Number(cpf[9])) return false;
  sum=0;
  for(let i=0;i<10;i++) sum+=Number(cpf[i])*(11-i);
  d=(sum*10)%11; if(d===10)d=0;
  return d===Number(cpf[10]);
}

function cleanEmail(v){
  const email=String(v||"").trim().toLowerCase().slice(0,254);
  return /^\S+@\S+\.\S+$/.test(email)?email:"";
}

function cleanName(v){
  return String(v||"").trim().replace(/[\u0000-\u001F\u007F]/g,"").slice(0,120);
}

function price(){
  const p=Number(process.env.SESAU_PRODUCT_PRICE || DEFAULT_PRICE);
  return Number.isFinite(p) && p>0 ? Number(p.toFixed(2)) : DEFAULT_PRICE;
}

function secret(){
  const s=String(process.env.JR_PURCHASE_BRIDGE_SECRET||"");
  if(s.length<32) throw new Error("JR_PURCHASE_BRIDGE_SECRET não configurado.");
  return s;
}

function signToken(payload){
  const body=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig=crypto.createHmac("sha256",secret()).update(body).digest("base64url");
  return body+"."+sig;
}

function verifyToken(token){
  try{
    const [body,sig]=String(token||"").split(".");
    if(!body||!sig) return null;
    const expected=crypto.createHmac("sha256",secret()).update(body).digest("base64url");
    const a=Buffer.from(sig), b=Buffer.from(expected);
    if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return null;
    const data=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
    if(!data.exp || Date.now()>Number(data.exp)) return null;
    return data;
  }catch{return null;}
}

function mpToken(){
  const token=String(process.env.MERCADOPAGO_ACCESS_TOKEN||"").trim();
  if(!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
  if(token.startsWith("TEST-") && String(process.env.VERCEL_ENV||"").toLowerCase()==="production"){
    throw new Error("Credencial de teste do Mercado Pago em produção.");
  }
  return token;
}

async function mpFetch(path, options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    return await fetch("https://api.mercadopago.com"+path,{
      ...options,
      cache:"no-store",
      signal:controller.signal,
      headers:{
        Accept:"application/json",
        ...(options.body?{"Content-Type":"application/json"}:{}),
        Authorization:"Bearer "+mpToken(),
        ...(options.headers||{})
      }
    });
  }finally{clearTimeout(timer);}
}

function siteUrl(req){
  const configured=String(process.env.NEXT_PUBLIC_SITE_URL||process.env.SITE_URL||"").replace(/\/$/,"");
  if(configured.startsWith("https://")) return configured;
  const host=req.headers["x-forwarded-host"]||req.headers.host;
  return host ? "https://"+host : "";
}

module.exports={PRODUCT_ID,PRODUCT_NAME,noStore,onlyDigits,validCpf,cleanEmail,cleanName,price,signToken,verifyToken,mpFetch,siteUrl};
