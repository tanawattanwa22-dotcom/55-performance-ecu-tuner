// 55 PERFORMANCE ECU TUNER — Supabase Auth REST client (public keys only)
const cfg = window.LICENSE_CONFIG;
const storageKey = '55_performance_tuner_session';
function getSession(){try{return JSON.parse(localStorage.getItem(storageKey)||'null')}catch{return null}}
async function request(url,body,token){
 let r;
 try {
  r=await fetch(url,{method:'POST',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json','apikey':cfg.anonKey,...(token?{'Authorization':'Bearer '+token}:{})},body:JSON.stringify(body)});
 } catch(e) {
  throw Error('เชื่อมต่อ Supabase ไม่ได้: '+e.message+' ('+new URL(url).host+')');
 }
 let data;try{data=await r.json()}catch{throw Error('เซิร์ฟเวอร์ไม่ตอบ JSON (HTTP '+r.status+')')}
 if(!r.ok)throw Error((data.msg||data.error_description||data.error||'HTTP '+r.status)+' (HTTP '+r.status+')');
 return data;
}
function saveSession(j){
 if(!j.access_token)throw Error('การล็อกอินไม่ส่ง access token');
 localStorage.setItem(storageKey,JSON.stringify({access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+(j.expires_in||3600)*1000}));
}

async function signup(email,password){
 const normalized=String(email||'').trim();
 if(!/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(normalized))throw Error('กรุณากรอกอีเมลที่ถูกต้อง');
 if(typeof password!=='string'||password.length<8)throw Error('ตั้งรหัสผ่านอย่างน้อย 8 ตัวอักษร');
 // New users sign up with their own account, separate from the shop's admin.
 const result=await request(cfg.url+'/auth/v1/signup',{email:normalized,password});
 if(result.access_token){saveSession(result);return {signedIn:true}}
 return {signedIn:false};
}

async function login(email,password){
 const j=await request(cfg.url+'/auth/v1/token?grant_type=password',{email:email.trim(),password});
 saveSession(j);
}
async function token(){
 const s=getSession();if(!s)throw Error('กรุณาเข้าสู่ระบบ');
 if(Date.now()<(s.expires_at||0)-60000)return s.access_token;
 if(!s.refresh_token){localStorage.removeItem(storageKey);throw Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')}
 try{const j=await request(cfg.url+'/auth/v1/token?grant_type=refresh_token',{refresh_token:s.refresh_token});saveSession(j);return j.access_token}
 catch(e){localStorage.removeItem(storageKey);throw Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่: '+e.message)}
}
async function api(action,payload={}){return request(cfg.url+'/functions/v1/'+cfg.functionName,{action,...payload},await token())}
async function logout(){localStorage.removeItem(storageKey);location.reload()}
