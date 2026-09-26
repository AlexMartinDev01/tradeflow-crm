import {expect} from '@playwright/test';

export const DEMO_PASSWORD='Demo@TradeFlow2026!';

export async function loginApi(request,username='demo.manager'){
  const response=await request.post('/api/auth/login',{data:{username,password:DEMO_PASSWORD}});
  expect(response.ok(),`login failed for ${username}: ${response.status()} ${await response.text()}`).toBeTruthy();
  const data=await response.json();
  expect(data.two_factor_required).not.toBeTruthy();
  expect(data.token).toBeTruthy();
  return {token:data.token,user:data.user,headers:{Authorization:`Bearer ${data.token}`}};
}

export async function getJson(request,url,headers){
  const response=await request.get(url,{headers});
  expect(response.ok(),`GET ${url} failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json();
}

export async function postJson(request,url,data,headers,expected=[200,201]){
  const response=await request.post(url,{data,headers});
  expect(expected,`POST ${url} unexpected status: ${response.status()} ${await response.text()}`).toContain(response.status());
  return response.json();
}

export function plusDays(days){
  const d=new Date();d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
