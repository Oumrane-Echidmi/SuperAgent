const { chromium } = require('../../frontend/node_modules/@playwright/test');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await require('node:fs/promises').mkdir('build/verification', {recursive:true});
  await page.goto(process.env.SUPERAGENT_WEB_URL || 'http://127.0.0.1:4179');
  await page.locator('flt-semantics-placeholder').dispatchEvent('click');
  await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  await page.screenshot({path:'build/verification/sign-in-current.png'});
  console.log(JSON.stringify({errors,title:await page.title()}));
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
