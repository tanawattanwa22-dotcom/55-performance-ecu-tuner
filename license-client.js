const cfg=window.LICENSE_CONFIG;
const supabase=window.supabase.createClient(cfg.url,cfg.anonKey);
const $=id=>document.getElementById(id);
async function api(action,payload={}){const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('กรุณาเข้าสู่ระบบ');const r=await fetch(`${cfg.url}/functions/v1/${cfg.functionName}`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.anonKey,'Authorization':'Bearer '+session.access_token},body:JSON.stringify({action,...payload})});const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);return j;}
async function login(email,password){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;}
async function logout(){await supabase.auth.signOut();location.reload();}
