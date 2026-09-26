import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {DEMO_PASSWORD,authenticatePage} from './helpers.mjs';

function formatViolations(violations){
  return violations.map(v=>({
    id:v.id,
    impact:v.impact,
    help:v.help,
    nodes:v.nodes.slice(0,5).map(n=>({target:n.target,summary:n.failureSummary}))
  }));
}
async function expectAccessible(page,label){
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
  const severe=result.violations.filter(v=>['critical','serious'].includes(String(v.impact||'')));
  expect(severe,`${label} has serious accessibility violations:\n${JSON.stringify(formatViolations(severe),null,2)}`).toEqual([]);
}

test.describe('TradeFlow accessibility and keyboard usability',()=>{
  test('login supports keyboard submit and has no serious WCAG violations',async({page})=>{
    await page.goto('/#/login');
    await expectAccessible(page,'login');

    await page.getByLabel('用户名').fill('demo.manager');
    await page.getByLabel('密码').fill(DEMO_PASSWORD);
    await page.getByLabel('密码').press('Enter');
    await expect(page.getByRole('heading',{name:'经营概览'})).toBeVisible();
  });

  test('dashboard and customer workbench have no serious WCAG violations',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');

    await page.goto('/#/');
    await expect(page.getByRole('heading',{name:'经营概览'})).toBeVisible();
    await expectAccessible(page,'dashboard');

    await page.goto('/#/customers');
    await expect(page.getByRole('heading',{name:'客户360°'})).toBeVisible();
    await expectAccessible(page,'customers');
  });

  test('customer dialog traps focus, is keyboard-dismissible and remains accessible',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/customers');
    await page.getByRole('button',{name:'新增客户'}).click();

    const dialog=page.getByRole('dialog',{name:'新增客户'});
    await expect(dialog).toBeVisible();
    await expectAccessible(page,'customer create dialog');

    const focusInside=await dialog.evaluate(el=>!!document.activeElement&&el.contains(document.activeElement));
    expect(focusInside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('critical pages do not emit uncaught browser errors',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e.message||e)));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});

    for(const route of ['/#/customers','/#/sales/quotations','/#/orders','/#/finance','/#/aftersales','/#/reports','/#/automation']){
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(150);
    }
    expect(errors,'critical workbenches must not emit uncaught browser errors').toEqual([]);
  });
});
