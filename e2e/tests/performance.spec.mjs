import {test,expect} from '@playwright/test';
import {DEMO_PASSWORD} from './helpers.mjs';

test('charting bundle is lazy-loaded only when analytics is opened',async({page})=>{
  const scripts=[];
  page.on('request',request=>{
    if(request.resourceType()==='script')scripts.push(request.url());
  });

  await page.goto('/#/login');
  await page.getByLabel('用户名').fill('demo.manager');
  await page.getByLabel('密码').fill(DEMO_PASSWORD);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await expect(page.getByRole('heading',{name:'经营概览'})).toBeVisible();

  expect(scripts.some(x=>x.includes('vendor-echarts')),'dashboard must not eagerly load ECharts').toBe(false);

  await page.goto('/#/analytics');
  await expect(page.getByRole('heading',{name:'统计分析中心'})).toBeVisible();
  await expect.poll(()=>scripts.some(x=>x.includes('vendor-echarts')),{message:'analytics must load the ECharts chunk on demand'}).toBe(true);
});


test('static frontend assets are never consumed by API rate limiting',async({request})=>{
  const root=await request.get('/');
  expect(root.status()).toBe(200);
  const html=await root.text();
  const match=html.match(/<script[^>]+src="([^"]+\.js)"/i);
  expect(match,'built frontend must expose a JavaScript entry asset').toBeTruthy();
  const asset=match[1];

  // 320 exceeds the old global 300 requests/minute limiter. Static assets must remain available.
  for(let i=0;i<320;i++){
    const response=await request.get(asset);
    expect(response.status(),`static asset request ${i+1} must not be rate-limited`).toBe(200);
  }
});
