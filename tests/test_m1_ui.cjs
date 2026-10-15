/* DOM-stub smoke test of M0 backward compatibility and M1 end-to-end flow. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const file=path=>fs.readFileSync(require('node:path').join(__dirname,'..',path),'utf8');
function load(mode){
  const listeners={};
  const app={innerHTML:'',addEventListener(name,handler){listeners[name]=handler},
    querySelector(){return null},querySelectorAll(){return []}};
  const win={scrollTo(){}};
  const doc={getElementById(){return app},addEventListener(){}};
  const context={window:win,document:doc,setInterval(){return 1},clearInterval(){}};
  vm.runInNewContext(file('js/data.js'),context);
  if(mode==='M1')vm.runInNewContext(file('js/m1-sim.js'),context);
  vm.runInNewContext(file('js/app.js'),context);
  return {app,
    click(action,page){listeners.click({target:{closest(){return {disabled:false,dataset:{action,page}}}}})},
    seek(t){listeners.change({target:{id:'time-slider',value:String(t)}})}
  };
}
test('M0 index remains a separate fixed mock',()=>{
  const {app}=load('M0');
  assert.match(app.innerHTML,/M0 MOCK/);
  assert.match(app.innerHTML,/NO SIMULATION/);
});
test('M1 setup, simulated observation, causal result and retry',()=>{
  const ui=load('M1');
  assert.match(ui.app.innerHTML,/都市を調べる/);
  ui.click('unlock','setup');
  assert.match(ui.app.innerHTML,/シミュレーションを実行する/);
  ui.click('simulate');
  assert.match(ui.app.innerHTML,/計算結果を再生中/);
  assert.doesNotMatch(ui.app.innerHTML,/火災が周辺地区へ拡大/);
  ui.seek(360);
  ui.click('unlock','result');
  assert.match(ui.app.innerHTML,/時間平均機能損失/);
  assert.match(ui.app.innerHTML,/イベントとその原因/);
  ui.click('retry');
  assert.match(ui.app.innerHTML,/シミュレーションを実行する/);
});
