import {request} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DEMO_PASSWORD='Demo@TradeFlow2026!';
const USERS=['demo.admin','demo.manager','demo.sales01','demo.readonly','demo.finance'];

export default async function globalSetup(){
  const baseURL=process.env.E2E_BASE_URL||'http://127.0.0.1:18080';
  const context=await request.newContext({baseURL});
  const sessions={};
  try{
    for(const username of USERS){
      const response=await context.post('/api/auth/login',{data:{username,password:DEMO_PASSWORD}});
      if(!response.ok())throw new Error(`global auth bootstrap failed for ${username}: ${response.status()} ${await response.text()}`);
      const data=await response.json();
      if(data.two_factor_required||!data.token)throw new Error(`unexpected auth response for ${username}`);
      sessions[username]={token:data.token,user:data.user};
    }
    const dir=path.resolve('.auth');fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'sessions.json'),JSON.stringify(sessions,null,2),{mode:0o600});
  }finally{
    await context.dispose();
  }
}
