const {PRODUCT_ID,noStore,price,verifyToken,signToken,mpFetch}=require("./_payment");

module.exports=async function handler(req,res){
  noStore(res);
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método não permitido."});}
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const data=verifyToken(body.checkoutToken);
    if(!data || data.typ!=="checkout" || data.product!==PRODUCT_ID) return res.status(401).json({error:"Checkout inválido ou expirado."});

    const mpRes=await mpFetch("/v1/payments/"+encodeURIComponent(data.paymentId),{method:"GET"});
    if(!mpRes.ok) return res.status(502).json({error:"Não foi possível confirmar o pagamento agora."});
    const payment=await mpRes.json();

    const expectedRef="sesau_"+data.orderId;
    const amountOk=Math.round(Number(payment.transaction_amount||0)*100)===Math.round(price()*100);
    const currencyOk=!payment.currency_id || String(payment.currency_id).toUpperCase()==="BRL";
    const referenceOk=String(payment.external_reference||"")===expectedRef;
    const payerEmail=String(payment?.payer?.email||"").trim().toLowerCase();
    const emailOk=!payerEmail || payerEmail===String(data.email).toLowerCase();
    if(!amountOk || !currencyOk || !referenceOk || !emailOk) return res.status(409).json({error:"Os dados do pagamento não conferem."});

    const approved=String(payment.status||"").toLowerCase()==="approved";
    if(!approved) return res.status(200).json({ok:true,approved:false,status:String(payment.status||"pending")});

    const accessToken=signToken({
      typ:"sesau-access",
      product:PRODUCT_ID,
      email:data.email,
      paymentId:String(payment.id),
      exp:Date.now()+10*60*1000
    });

    return res.status(200).json({
      ok:true,
      approved:true,
      status:"approved",
      accessToken,
      platformUrl:String(process.env.SESAU_PLATFORM_URL||"https://sesau-certo.vercel.app").replace(/\/$/,"")
    });
  }catch(err){
    console.error("Status SESAU:",err?.message||err);
    return res.status(500).json({error:"Não foi possível confirmar o pagamento agora."});
  }
};
