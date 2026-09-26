import {test,expect} from '@playwright/test';
import {createHmac} from 'node:crypto';
import {DEMO_PASSWORD,loginApi} from './helpers.mjs';

test.describe.configure({mode:'serial',retries:0});

const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(text){
  let bits=0,value=0,out=[];
  for(const ch of String(text||'').toUpperCase().replace(/=|\s/g,'')){
    const idx=B32.indexOf(ch);if(idx<0)continue;
    value=(value<<5)|idx;bits+=5;
    if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}
  }
  return Buffer.from(out);
}
function totp(secret,counter){
  const key=base32Decode(secret),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));
  const h=createHmac('sha1',key).update(buf).digest(),off=h[h.length-1]&15,num=(h.readUInt32BE(off)&0x7fffffff)%1_000_000;
  return String(num).padStart(6,'0');
}

test('forced password change, user-admin boundary, lockout and TOTP all work end to end',async({page,request})=>{
  const initialPassword='Admin@123456';
  const newAdminPassword='Secure#2026Root';

  await page.goto('/#/login');
  await page.getByLabel('用户名').fill('admin');
  await page.getByLabel('密码').fill(initialPassword);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await expect(page.getByRole('heading',{name:'账号安全'})).toBeVisible();

  const forcedToken=await page.evaluate(()=>localStorage.getItem('token'));
  expect(forcedToken).toBeTruthy();
  const blockedBusiness=await request.get('/api/customers',{headers:{Authorization:'Bearer '+forcedToken}});
  expect(blockedBusiness.status()).toBe(428);

  await page.goto('/#/customers');
  await expect(page.getByRole('heading',{name:'账号安全'})).toBeVisible();

  await page.getByLabel('当前密码').first().fill(initialPassword);
  await page.getByLabel('新密码').fill(newAdminPassword);
  await page.getByLabel('确认新密码').fill(newAdminPassword);
  await page.getByRole('button',{name:'修改密码'}).click();
  await expect(page.getByText('密码已修改，其他登录会话已失效')).toBeVisible();
  await page.goto('/#/customers');
  await expect(page.getByRole('heading',{name:'客户360°'})).toBeVisible();

  const adminLogin=await request.post('/api/auth/login',{data:{username:'admin',password:newAdminPassword}});
  expect(adminLogin.status()).toBe(200);
  const adminData=await adminLogin.json(),adminHeaders={Authorization:'Bearer '+adminData.token};

  const manager=await loginApi(request,'demo.manager');
  const managerCreateUser=await request.post('/api/users',{headers:manager.headers,data:{
    username:'manager.must.not.create.'+Date.now(),
    display_name:'Forbidden Manager User',
    role:'sales',
    password:'Forbidden#2026User'
  }});
  expect(managerCreateUser.status()).toBe(403);

  const suffix=Date.now().toString().slice(-8);
  const lockUsername='e2e.lock.'+suffix,lockPassword='LockTest#2026A';
  const lockUser=await request.post('/api/users',{headers:adminHeaders,data:{
    username:lockUsername,display_name:'E2E Lock User',role:'sales',password:lockPassword,data_scope:'self',enabled:1
  }});
  expect(lockUser.status()).toBe(201);

  for(let i=1;i<=4;i++){
    const bad=await request.post('/api/auth/login',{data:{username:lockUsername,password:'Wrong#2026Password'}});
    expect(bad.status(),`failed login attempt ${i}`).toBe(401);
  }
  const fifth=await request.post('/api/auth/login',{data:{username:lockUsername,password:'Wrong#2026Password'}});
  expect(fifth.status()).toBe(423);
  const lockedCorrect=await request.post('/api/auth/login',{data:{username:lockUsername,password:lockPassword}});
  expect(lockedCorrect.status()).toBe(423);

  const twoUsername='e2e.2fa.'+suffix,initialTwoPassword='TwoFactor#2026A',finalTwoPassword='TwoFactor#2026B';
  const twoUser=await request.post('/api/users',{headers:adminHeaders,data:{
    username:twoUsername,display_name:'E2E 2FA User',role:'sales',password:initialTwoPassword,data_scope:'self',enabled:1
  }});
  expect(twoUser.status()).toBe(201);

  const twoLogin=await request.post('/api/auth/login',{data:{username:twoUsername,password:initialTwoPassword}});
  expect(twoLogin.status()).toBe(200);
  const twoData=await twoLogin.json(),twoHeaders={Authorization:'Bearer '+twoData.token};
  expect(twoData.user.must_change_password).toBe(true);

  const change=await request.post('/api/auth/change-password',{headers:twoHeaders,data:{current_password:initialTwoPassword,new_password:finalTwoPassword}});
  expect(change.status()).toBe(200);

  const setup=await request.post('/api/auth/2fa/setup',{headers:twoHeaders,data:{current_password:finalTwoPassword}});
  expect(setup.status()).toBe(200);
  const setupData=await setup.json();
  expect(setupData.secret).toBeTruthy();

  const enableCounter=Math.floor(Date.now()/1000/30),enableCode=totp(setupData.secret,enableCounter);
  const enable=await request.post('/api/auth/2fa/enable',{headers:twoHeaders,data:{current_password:finalTwoPassword,code:enableCode}});
  expect(enable.status()).toBe(200);

  const challenge=await request.post('/api/auth/login',{data:{username:twoUsername,password:finalTwoPassword}});
  expect(challenge.status()).toBe(200);
  const challengeData=await challenge.json();
  expect(challengeData.two_factor_required).toBe(true);
  expect(challengeData.challenge_token).toBeTruthy();

  const currentCounter=Math.floor(Date.now()/1000/30),nextCounter=Math.max(enableCounter+1,currentCounter),loginCode=totp(setupData.secret,nextCounter);
  const verified=await request.post('/api/auth/2fa/verify',{data:{challenge_token:challengeData.challenge_token,code:loginCode}});
  expect(verified.status()).toBe(200);
  const verifiedData=await verified.json();
  expect(verifiedData.token).toBeTruthy();
  expect(verifiedData.user.two_factor_enabled).toBe(true);

  const replayChallenge=await request.post('/api/auth/login',{data:{username:twoUsername,password:finalTwoPassword}});
  const replayChallengeData=await replayChallenge.json();
  expect(replayChallengeData.two_factor_required).toBe(true);
  const replay=await request.post('/api/auth/2fa/verify',{data:{challenge_token:replayChallengeData.challenge_token,code:loginCode}});
  expect(replay.status()).toBe(401);
});
