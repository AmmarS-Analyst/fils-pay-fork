// Run with NODE_PATH pointing at independently installed playwright and pg.
const { chromium } = require('playwright');
const { Pool } = require('pg');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const web = process.env.AUDIT_WEB_ORIGIN || 'http://localhost:5173';
const adminOrigin = process.env.AUDIT_ADMIN_ORIGIN || 'http://localhost:5174';
const api = process.env.AUDIT_API_ORIGIN || 'http://localhost:3000';
const output = process.env.AUDIT_EVIDENCE_DIR || 'docs/verification/evidence';
if (!process.env.DATABASE_URL?.includes('filspay_browser')) throw new Error('Use the isolated filspay_browser database, populated with dev fixtures.');

(async () => {
  await fs.mkdir(output, {recursive:true});
  const pool = new Pool({connectionString:process.env.DATABASE_URL});
  const browser = await chromium.launch({headless:true});
  const results = {checks:[], errors:[], serverErrors:[], overflow:[], screenshots:[]};
  function watch(page) {
    page.on('pageerror', e => results.errors.push(e.message));
    page.on('response', r => {if(r.status()>=500) results.serverErrors.push({url:r.url(),status:r.status()});});
  }
  async function check(name, fn) {await fn();results.checks.push(name);console.log('PASS',name);}
  async function shot(page,name) {
    await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true});
    results.screenshots.push(`${name}.png`);
    const overflow = await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
    if(overflow.document>overflow.width+1) results.overflow.push({name,...overflow});
  }
  async function login(page, isAdmin, email, password, merchantId) {
    await page.goto(isAdmin?`${adminOrigin}/login`:`${web}/dashboard/login`);
    if(!isAdmin) await page.getByLabel('Merchant ID',{exact:true}).fill(merchantId);
    await page.getByLabel('Email',{exact:true}).fill(email);
    await page.getByLabel('Password',{exact:true}).fill(password);
    const challengeResponse = page.waitForResponse(r=>r.url().endsWith('/auth/login')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    const challenge = await (await challengeResponse).json();
    assert.ok(challenge.devOtpCode,'dev OTP must only be enabled in local environment');
    const pending = await page.context().request.get(`${api}${isAdmin?'/v1/admin/auth/me':'/v1/auth/me'}`);
    assert.equal(pending.status(),401,'password-only session cannot authenticate');
    await page.getByLabel('One-time code',{exact:true}).fill(challenge.devOtpCode);
    await page.getByRole('button',{name:'Verify',exact:true}).click();
    await page.waitForURL(isAdmin?`${adminOrigin}/merchants`:`${web}/dashboard/transactions`);
    await page.getByRole('button',{name:'Log out',exact:true}).waitFor();
  }
  try {
    const identity = await pool.query(`SELECT m.id FROM merchants m JOIN merchant_users u ON u.merchant_id=m.id WHERE m.display_name='Alpha Retail Co' AND u.email='owner@alpharetail.example'`);
    const merchantId = identity.rows[0].id;
    const merchantContext = await browser.newContext({viewport:{width:1440,height:1000}});
    const merchant = await merchantContext.newPage(); watch(merchant);
    await check('merchant password + OTP login and pending-session rejection',()=>login(merchant,false,'owner@alpharetail.example','FilsPaySeed!2026',merchantId));
    await shot(merchant,'merchant-transactions-desktop');
    for(const [label,route] of [['Payment links','payment-links'],['Webhooks','webhooks'],['Settlement','settlement'],['Reconciliation','reconciliation'],['Overview','overview'],['Transactions','transactions']]) {
      await check(`merchant navigation: ${label}`,async()=>{await merchant.getByRole('link',{name:label,exact:true}).first().click();await merchant.waitForURL(`${web}/dashboard/${route}`);await merchant.locator('h1').waitFor();await merchant.waitForTimeout(200);await shot(merchant,`merchant-${route}-desktop`);await merchant.setViewportSize({width:390,height:844});await shot(merchant,`merchant-${route}-mobile`);await merchant.setViewportSize({width:1440,height:1000});});
    }
    await merchant.setViewportSize({width:390,height:844});
    await shot(merchant,'merchant-transactions-mobile');
    await merchant.setViewportSize({width:1440,height:1000});
    let checkoutUrl;
    await check('create payment link through merchant browser form',async()=>{
      await merchant.goto(`${web}/dashboard/payment-links/new`);await shot(merchant,'merchant-create-link-desktop');
      await merchant.getByLabel('Amount in fils',{exact:true}).fill('1000');
      await merchant.getByLabel('Reference (optional)',{exact:true}).fill(`browser-audit-${Date.now()}`);
      await merchant.getByLabel('Description (optional)',{exact:true}).fill('Local verification payment');
      await merchant.getByLabel('Expires at',{exact:true}).fill('2099-01-01T12:00');
      await merchant.getByRole('button',{name:'Create payment link',exact:true}).click();
      await merchant.waitForURL(/\/dashboard\/payment-links\/[0-9a-f-]+$/);
      const checkoutLink = merchant.locator('a[target="_blank"]').first();
      await checkoutLink.waitFor();checkoutUrl = await checkoutLink.getAttribute('href');
    });
    const buyerContext = await browser.newContext({viewport:{width:390,height:844}});
    const buyer = await buyerContext.newPage();watch(buyer);
    let transactionId;
    await check('public checkout charges a simulated card and shows success',async()=>{
      await buyer.goto(checkoutUrl);
      await buyer.getByLabel('Card number',{exact:true}).fill('4111111111111111');
      await buyer.getByLabel('Month',{exact:true}).fill('12');
      await buyer.getByLabel('Year',{exact:true}).fill('2099');
      await buyer.getByLabel(/CVV|Security code/i).fill('123');
      await shot(buyer,'checkout-mobile');
      const payResponse = buyer.waitForResponse(r=>r.url().includes('/payment-links/')&&r.url().endsWith('/pay')&&r.request().method()==='POST');
      await buyer.getByRole('button',{name:/Pay /}).click();
      const response = await payResponse;const body=await response.json();
      assert.equal(response.status(),200,JSON.stringify(body));transactionId=body.transactionId;
      await buyer.getByRole('heading',{name:'Payment successful',exact:true}).waitFor();
      await shot(buyer,'checkout-success-mobile');
      await buyer.reload();await buyer.getByRole('heading',{name:'Already paid',exact:true}).waitFor();
    });
    await check('partial then full refund through merchant browser and exact fee conservation',async()=>{
      await merchant.goto(`${web}/dashboard/transactions/${transactionId}`);
      merchant.on('dialog',d=>d.accept());
      for(const amount of ['0.500','']) {
        await merchant.getByRole('button',{name:'Refund',exact:true}).click();
        await merchant.getByLabel('Amount in BD (blank refunds everything still refundable)',{exact:true}).fill(amount);
        const responsePromise=merchant.waitForResponse(r=>r.url().endsWith('/refunds')&&r.request().method()==='POST');
        await merchant.getByRole('button',{name:'Refund',exact:true}).click();
        const response=await responsePromise;assert.equal(response.status(),200,await response.text());
        await merchant.getByRole('button',{name:'Cancel',exact:true}).waitFor({state:'hidden'});
      }
      await shot(merchant,'merchant-refunded-transaction-desktop');
      const state=await pool.query(`SELECT t.status,t.captured_fils,t.refunded_fils,
       (SELECT COALESCE(SUM(fee_reversed_fils),0) FROM refunds WHERE transaction_id=t.id) AS reversed,
       (SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount_fils ELSE -amount_fils END),0) FROM ledger_entries WHERE transaction_id=t.id AND account_id='platform_fee_revenue') AS retained_fee
       FROM transactions t WHERE t.id=$1`,[transactionId]);
      assert.equal(state.rows[0].status,'refunded');assert.equal(state.rows[0].refunded_fils,state.rows[0].captured_fils);assert.equal(Number(state.rows[0].retained_fee),0);
      results.refundState=state.rows[0];
    });
    const adminContext = await browser.newContext({viewport:{width:1440,height:1000}});
    const admin = await adminContext.newPage();watch(admin);
    await check('admin password + OTP login and pending-session rejection',()=>login(admin,true,'superadmin@filspay.test','FilsPayAdminSeed!2026'));
    await shot(admin,'admin-merchants-desktop');
    for(const [label,route] of [['Credits','credits'],['Settlement ops','settlement'],['Import adjustments','adjustment-imports'],['Webhook replay','webhooks'],['Merchants','merchants']]) {
      await check(`admin navigation: ${label}`,async()=>{await admin.getByRole('link',{name:label,exact:true}).click();await admin.waitForURL(`${adminOrigin}/${route}`);await admin.locator('h1').waitFor();await admin.waitForTimeout(200);await shot(admin,`admin-${route}-desktop`);await admin.setViewportSize({width:390,height:844});await shot(admin,`admin-${route}-mobile`);await admin.setViewportSize({width:1440,height:1000});});
    }
    await admin.setViewportSize({width:390,height:844});await shot(admin,'admin-merchants-mobile');
    await check('merchant logout revokes the session',async()=>{await merchant.getByRole('button',{name:'Log out',exact:true}).click();await merchant.waitForURL(`${web}/dashboard/login`);assert.equal((await merchantContext.request.get(`${api}/v1/auth/me`)).status(),401);});
    await check('admin logout revokes the session',async()=>{await admin.getByRole('button',{name:'Log out',exact:true}).click();await admin.waitForURL(`${adminOrigin}/login`);assert.equal((await adminContext.request.get(`${api}/v1/admin/auth/me`)).status(),401);});
    assert.deepEqual(results.overflow,[],'no page may overflow the viewport');
    assert.deepEqual(results.errors,[],'browser must have no uncaught exceptions');
    assert.deepEqual(results.serverErrors,[],'browser flows must have no 5xx responses');
  } finally {
    await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify(results,null,2)+'\n');
    await browser.close();await pool.end();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
