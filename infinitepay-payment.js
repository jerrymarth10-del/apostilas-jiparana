(function(){
"use strict";
const STORE_KEY="jr_infinitepay_checkout_v1";
function uuid(){
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  const b=new Uint8Array(16);window.crypto.getRandomValues(b);
  b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const h=Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
}
function showError(message){
  const box=document.getElementById("checkoutError");
  if(box){box.textContent=message;box.hidden=false;box.scrollIntoView({behavior:"smooth",block:"center"});}
}
function platform(accessToken,platformUrl){
  if(!accessToken || !/^https:\/\/sesau-certo\.vercel\.app\/?$/.test(String(platformUrl||""))){
    return showError("Não foi possível liberar o acesso. Aguarde o e-mail de confirmação.");
  }
  const form=document.createElement("form");
  form.method="POST";form.action=platformUrl.replace(/\/$/,"")+"/api/purchase-entry";
  form.style.display="none";
  const input=document.createElement("input");input.type="hidden";input.name="token";input.value=accessToken;
  form.appendChild(input);document.body.appendChild(form);form.submit();
}
function area(){return document.querySelector('input[name="area"]:checked')?.value || "";}
function variant(){return document.querySelector('input[name="area"]:checked')?.dataset.variant || "";}
async function status(token,transactionNsu,slug){
  const res=await fetch("/api/infinitepay-status",{
    method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({checkoutToken:token,transactionNsu,slug}),
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error || "Falha ao consultar a InfinitePay.");
  return data;
}
function clearReturn(){
  const url=new URL(location.href);
  ["jr_ip","receipt_url","order_nsu","slug","transaction_nsu","capture_method","paid_amount"].forEach(k=>url.searchParams.delete(k));
  history.replaceState(null,"",url.pathname+(url.search?url.search:"")+url.hash);
}
async function verifyReturn(){
  const params=new URLSearchParams(location.search);
  if(params.get("jr_ip")!=="1")return;
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(STORE_KEY)||"null");}catch{}
  if(!saved?.checkoutToken || Date.now()-Number(saved.createdAt||0)>24*60*60*1000){
    showError("Confira seu e-mail: se o pagamento foi aprovado, você receberá o acesso. Não faça outra compra antes de verificar.");
    return;
  }
  if(params.get("order_nsu") && params.get("order_nsu")!==saved.checkoutKey){
    showError("O retorno não corresponde à compra iniciada neste aparelho.");return;
  }
  let retry=document.getElementById("infinitePayRetry");
  if(!retry){
    retry=document.createElement("button");retry.type="button";retry.id="infinitePayRetry";
    retry.className="recover-toggle";retry.textContent="VERIFICAR PAGAMENTO INFINITEPAY";
    document.getElementById("checkoutForm")?.insertAdjacentElement("afterend",retry);
  }
  const check=async()=>{
    retry.disabled=true;retry.textContent="VERIFICANDO PAGAMENTO...";
    try{
      const result=await status(saved.checkoutToken,params.get("transaction_nsu")||"",params.get("slug")||"");
      if(result.approved){
        try{localStorage.removeItem(STORE_KEY);}catch{}
        clearReturn();return platform(result.accessToken,result.platformUrl);
      }
      showError("A InfinitePay ainda não confirmou este pagamento. Aguarde e toque em verificar novamente, ou consulte seu e-mail.");
    }catch(e){showError(e?.message||"Não foi possível consultar o pagamento agora.");}
    finally{retry.disabled=false;retry.textContent="VERIFICAR PAGAMENTO INFINITEPAY";}
  };
  retry.addEventListener("click",check);
  check();
}
function install(){
  const form=document.getElementById("checkoutForm");
  const anchor=document.getElementById("cardCheckoutNote")||document.getElementById("cardCheckoutButton");
  if(!form||!anchor)return;
  if(document.getElementById("infinitePayCheckoutButton"))return verifyReturn();
  const button=document.createElement("button");
  button.type="button";button.id="infinitePayCheckoutButton";
  button.className=document.getElementById("cardCheckoutButton")?.className || "btn btn-primary submit";
  button.style.cssText="width:100%;margin-top:12px;background:#143d32;color:#fff;border:0;cursor:pointer";
  button.textContent="OUTRA FORMA DE PAGAR • INFINITEPAY";
  anchor.insertAdjacentElement("afterend",button);
  const note=document.createElement("p");
  note.style.cssText="font-size:.76rem;opacity:.8;text-align:center;margin:8px 0 0;line-height:1.45";
  note.textContent="Alternativa segura para cartão de crédito ou Pix. Acesso liberado somente após confirmação.";
  button.insertAdjacentElement("afterend",note);
  button.addEventListener("click",async()=>{
    const consent=document.getElementById("checkoutConsent");
    if(!form.reportValidity())return;
    if(!area())return showError("Escolha seu cargo antes de continuar.");
    if(!consent?.checked)return showError("É necessário aceitar os termos antes de continuar.");
    const payload={
      name:document.getElementById("checkoutName")?.value||"",
      email:document.getElementById("checkoutEmail")?.value||"",
      cpf:document.getElementById("checkoutCpf")?.value||"",
      area:area(),variant:variant(),checkoutKey:uuid(),termsAccepted:true,
    };
    button.disabled=true;button.textContent="ABRINDO INFINITEPAY...";
    const error=document.getElementById("checkoutError");if(error)error.hidden=true;
    try{
      const response=await fetch("/api/infinitepay-checkout",{
        method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.checkoutUrl||!data.checkoutToken){
        throw new Error(data.error||"Não foi possível abrir a InfinitePay.");
      }
      const u=new URL(data.checkoutUrl);
      if(u.protocol!=="https:" || !/(^|\.)infinitepay\.(com\.br|io)$/.test(u.hostname)){
        throw new Error("Endereço de pagamento inesperado.");
      }
      try{localStorage.setItem(STORE_KEY,JSON.stringify({
        checkoutToken:data.checkoutToken,checkoutKey:payload.checkoutKey,createdAt:Date.now(),
      }));}catch{throw new Error("Ative armazenamento local no navegador para confirmar o pagamento automaticamente.");}
      location.assign(u.href);
    }catch(e){
      showError(e?.message||"Pagamento temporariamente indisponível.");
      button.disabled=false;button.textContent="OUTRA FORMA DE PAGAR • INFINITEPAY";
    }
  });
  verifyReturn();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);
else install();
})();