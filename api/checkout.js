const crypto = require("crypto");
const {PRODUCT_ID,PRODUCT_NAME,noStore,onlyDigits,validCpf,cleanEmail,cleanName,price,signToken,mpFetch,siteUrl}=require("./_payment");

module.exports=async function handler(req,res){
  noStore(res);
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método não permitido."});}
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const name=cleanName(body.name);
    const email=cleanEmail(body.email);
    const cpf=onlyDigits(body.cpf).slice(0,11);
    if(name.length<2) return res.status(400).json({error:"Informe seu nome."});
    if(!email) return res.status(400).json({error:"Informe um e-mail válido."});
    if(!validCpf(cpf)) return res.status(400).json({error:"Informe um CPF válido."});

    const orderId=crypto.randomUUID();
    const amount=price();
    const names=name.split(/\s+/).filter(Boolean);
    const firstName=names.shift()||"Aluno";
    const lastName=names.join(" ")||"SESAU";
    const base=siteUrl(req);

    const mpRes=await mpFetch("/v1/payments",{
      method:"POST",
      headers:{"X-Idempotency-Key":orderId},
      body:JSON.stringify({
        transaction_amount:amount,
        description:PRODUCT_NAME,
        payment_method_id:"pix",
        external_reference:"sesau_"+orderId,
        payer:{
          email,
          first_name:firstName,
          last_name:lastName,
          identification:{type:"CPF",number:cpf}
        },
        ...(base?{notification_url:base+"/api/mercadopago-webhook"}:{})
      })
    });
    const payment=await mpRes.json().catch(()=>({}));
    if(!mpRes.ok || !payment?.id){
      console.error("Mercado Pago checkout:",mpRes.status,payment?.message||payment?.error||"erro");
      return res.status(502).json({error:"Não foi possível gerar o Pix agora. Tente novamente."});
    }
    const tx=payment?.point_of_interaction?.transaction_data||{};
    if(!tx.qr_code && !tx.qr_code_base64){
      return res.status(502).json({error:"O pagamento foi criado, mas o QR Code Pix não foi retornado."});
    }

    const checkoutToken=signToken({
      typ:"checkout",
      product:PRODUCT_ID,
      orderId,
      paymentId:String(payment.id),
      email,
      amount,
      exp:Date.now()+30*60*1000
    });

    return res.status(200).json({
      ok:true,
      paymentId:String(payment.id),
      status:String(payment.status||"pending"),
      amount,
      qrCode:tx.qr_code||"",
      qrCodeBase64:tx.qr_code_base64||"",
      checkoutToken
    });
  }catch(err){
    console.error("Checkout SESAU:",err?.message||err);
    return res.status(500).json({error:"Checkout temporariamente indisponível."});
  }
};
