(function(){
"use strict";
function uuid(){
  if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
  const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const h=Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
}
function showError(msg){
  const box=document.getElementById("checkoutError");
  if(box){box.textContent=msg||"Não foi possível continuar agora.";box.hidden=false;box.scrollIntoView({behavior:"smooth",block:"center"});}
}
function selectedArea(){return document.querySelector('input[name="area"]:checked')?.value||"";}
function fields(){
  return {
    name:document.getElementById("checkoutName")?.value||"",
    email:document.getElementById("checkoutEmail")?.value||"",
    cpf:document.getElementById("checkoutCpf")?.value||"",
    area:selectedArea()
  };
}
function openPlatform(accessToken,platformUrl){
  if(!accessToken||!platformUrl)return;
  const f=document.createElement("form");f.method="POST";f.action=platformUrl.replace(/\/$/,"")+"/api/purchase-entry";f.style.display="none";
  const i=document.createElement("input");i.type="hidden";i.name="token";i.value=accessToken;f.appendChild(i);
  document.body.appendChild(f);f.submit();
}
async function confirmReturn(){
  const u=new URL(window.location.href);
  if(u.searchParams.get("card_return")!=="1")return;
  const paymentId=u.searchParams.get("payment_id")||u.searchParams.get("collection_id")||"";
  let saved={};
  try{saved=JSON.parse(sessionStorage.getItem("jr_sesau_card_checkout")||"{}");}catch{}
  if(!saved.checkoutToken||!paymentId){showError("Não foi possível localizar os dados do retorno do cartão. Se houve cobrança, fale com o suporte antes de tentar novamente.");return;}
  const form=document.getElementById("checkoutForm");
  const submit=document.getElementById("checkoutSubmit");
  if(form)form.hidden=false;
  if(submit){submit.disabled=true;submit.textContent="CONFIRMANDO CARTÃO...";}
  for(let attempt=0;attempt<5;attempt++){
    try{
      const r=await fetch("/api/card-status",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({checkoutToken:saved.checkoutToken,paymentId})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(typeof d.error==="string"?d.error:"Não foi possível confirmar o cartão.");
      if(d.approved){
        try{sessionStorage.removeItem("jr_sesau_card_checkout");}catch{}
        u.searchParams.delete("card_return");u.searchParams.delete("payment_id");u.searchParams.delete("collection_id");u.searchParams.delete("status");u.searchParams.delete("external_reference");u.searchParams.delete("preference_id");
        history.replaceState(null,"",u.pathname+(u.searchParams.toString()?"?"+u.searchParams.toString():"")+u.hash);
        openPlatform(d.accessToken,d.platformUrl);return;
      }
      if(d.status&&d.status!=="pending"){showError("O pagamento com cartão não foi aprovado. Você pode tentar novamente ou usar Pix.");break;}
    }catch(e){if(attempt===4){showError(e?.message||"Não foi possível confirmar o cartão agora.");break;}}
    await new Promise(resolve=>setTimeout(resolve,2500));
  }
  if(submit){submit.disabled=false;submit.textContent="GERAR PIX E GARANTIR ACESSO";}
}
function install(){
  const form=document.getElementById("checkoutForm"), pixButton=document.getElementById("checkoutSubmit");
  if(!form||!pixButton||document.getElementById("cardCheckoutButton")){confirmReturn();return;}
  const head=document.querySelector(".checkout-head strong");
  if(head&&/Pix/i.test(head.textContent||""))head.textContent="Pagamento seguro via Pix ou Cartão";
  const consentText=document.querySelector(".checkout-consent span, .consent span");
  if(consentText)consentText.textContent=String(consentText.textContent||"").replace(/quero gerar o Pix[^.]*\.?/i,"quero continuar para o pagamento.");
  const btn=document.createElement("button");
  btn.type="button";btn.id="cardCheckoutButton";btn.className=pixButton.className;
  btn.textContent="PAGAR COM CARTÃO • ATÉ 12X";
  btn.style.marginTop="10px";btn.style.background="linear-gradient(180deg,#1769aa,#0d4f86)";
  pixButton.insertAdjacentElement("afterend",btn);
  const note=document.createElement("p");note.style.cssText="margin:9px 0 0;text-align:center;font-size:.78rem;opacity:.78";note.textContent="Cartão processado com segurança pelo Mercado Pago.";
  btn.insertAdjacentElement("afterend",note);
  btn.addEventListener("click",async()=>{
    const area=selectedArea();
    if(!area)return showError("Escolha sua área de preparação antes de pagar.");
    const consent=document.getElementById("checkoutConsent");
    if(consent&&!consent.checked)return showError("Confirme seus dados antes de continuar.");
    const data=fields();
    const key=uuid();
    btn.disabled=true;btn.textContent="ABRINDO PAGAMENTO...";
    const err=document.getElementById("checkoutError");if(err)err.hidden=true;
    try{
      const r=await fetch("/api/card-checkout",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({...data,checkoutKey:key})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.checkoutUrl||!d.checkoutToken)throw new Error(typeof d.error==="string"?d.error:"Não foi possível abrir o pagamento com cartão.");
      sessionStorage.setItem("jr_sesau_card_checkout",JSON.stringify({checkoutToken:d.checkoutToken,area,createdAt:Date.now()}));
      window.location.assign(d.checkoutUrl);
    }catch(e){showError(e?.message||"Pagamento com cartão temporariamente indisponível.");btn.disabled=false;btn.textContent="PAGAR COM CARTÃO • ATÉ 12X";}
  });
  confirmReturn();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
})();