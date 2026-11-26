import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const URL=Deno.env.get("SUPABASE_URL")!;
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(URL,KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const allowed=new Set(["https://smart-money-navy.vercel.app","https://smart-money-swrang120.vercel.app","https://smart-money-git-main-swrang120.vercel.app","https://smart-money.wasmer.app","https://smart-money-learning-platform.web.app"]);
function headers(origin:string|null){return {"Access-Control-Allow-Origin":origin&&allowed.has(origin)?origin:"https://smart-money.wasmer.app","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Content-Type":"application/json","Cache-Control":"no-store"}}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin"),h=headers(origin);
 if(req.method==="OPTIONS")return new Response("ok",{headers:h});
 if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"Method not allowed"}),{status:405,headers:h});
 try{
  const b=await req.json();
  const id=Number(b.payment_request_id),email=String(b.email||"").trim().toLowerCase(),utr=String(b.transaction_id||"").replace(/\D/g,"");
  if(!Number.isSafeInteger(id)||id<=0||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[0-9]{12}$/.test(utr))
   return new Response(JSON.stringify({ok:false,error:"Invalid payment tracking details."}),{status:400,headers:h});
  const {data,error}=await db.from("payment_requests").select("id,email,transaction_id,status,payment_status,package_name,amount,created_at,admin_note").eq("id",id).eq("email",email).eq("transaction_id",utr).eq("is_deleted",false).maybeSingle();
  if(error)throw error;
  if(!data)return new Response(JSON.stringify({ok:false,error:"Payment request not found. Check your tracking details or contact support."}),{status:404,headers:h});
  const raw=String(data.status||data.payment_status||"Pending").toLowerCase();
  const state=["approved","successful","success","paid"].includes(raw)?"approved":(["rejected","failed","declined"].includes(raw)?"rejected":"pending");
  return new Response(JSON.stringify({ok:true,status:state,package_name:data.package_name,amount:data.amount,created_at:data.created_at,admin_note:state==="rejected"?(data.admin_note||"Please contact Smart Money Support for assistance."):""}),{headers:h});
 }catch(e){console.error("check-payment-status:",e);return new Response(JSON.stringify({ok:false,error:"Unable to check payment status right now."}),{status:500,headers:h})}
});