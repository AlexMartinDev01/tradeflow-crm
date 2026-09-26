const base=process.env.API_URL||'http://127.0.0.1:8787/api';
const j=async(path,opt={})=>{const r=await fetch(base+path,{...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});const x=await r.json();if(!r.ok)throw new Error(`${r.status} ${JSON.stringify(x)}`);return x};
const login=await j('/auth/login',{method:'POST',body:JSON.stringify({username:'admin',password:'Admin@123456'})});const h={authorization:`Bearer ${login.token}`};
const health=await j('/health');const me=await j('/auth/me',{headers:h});const list=await j('/customers?size=5',{headers:h});const dashboard=await j('/dashboard',{headers:h});const funnel=await j('/analytics/funnel',{headers:h});
console.log(JSON.stringify({health,me,customers:list.total,dashboard,funnel},null,2));
