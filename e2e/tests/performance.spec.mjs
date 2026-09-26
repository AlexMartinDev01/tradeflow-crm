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
