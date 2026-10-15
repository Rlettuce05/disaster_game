/* M1 acceptance tests. Run: node --test tests/test_m1_sim.cjs */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {simulate,pointOnFault}=require('../js/m1-sim.js');
const base={faultPosition:.125,magnitude:6.5,seed:42,enableCityAI:true};
const run=(cfg={})=>simulate({...base,...cfg});
const find=(r,key)=>r.events.find(e=>e.key===key);

test('P-01: location changes losses and cascades with continuous input',()=>{
  const west=run(),east=run({faultPosition:.855});
  assert.equal(west.frames.length,361);
  assert.equal(east.frames.length,361);
  assert.ok(west.damages.water>east.damages.water);
  assert.ok(east.damages.power>west.damages.power);
  assert.notDeepEqual(west.frames.map(f=>f.values),east.frames.map(f=>f.values));
  assert.notDeepEqual(run({faultPosition:.120}).damages,run({faultPosition:.125}).damages);
  assert.notDeepEqual(pointOnFault(.2),pointOnFault(.3));
});
test('P-02: closing the primary road delays arrival',()=>{
  const open=run(),closed=run({mainRoadOpen:false});
  assert.ok(find(open,'fire-arrival'));
  assert.ok(find(closed,'fire-arrival'));
  assert.ok(find(closed,'fire-arrival').time>find(open,'fire-arrival').time);
  assert.ok(closed.metrics.meanLoss>=open.metrics.meanLoss);
});
test('P-03: AI observes then responds, reducing loss',()=>{
  const ai=run(),noai=run({enableCityAI:false});
  assert.ok(find(ai,'dispatch'));
  assert.match(find(ai,'dispatch').basis,/通報/);
  assert.equal(find(noai,'dispatch'),undefined);
  assert.ok(ai.metrics.meanLoss<noai.metrics.meanLoss);
});
test('P-04: seed reproducibility and input validation',()=>{
  assert.deepEqual(run(),run());
  assert.deepEqual(run({seed:5}),run({seed:5}));
  assert.notDeepEqual(run({seed:5}).damages,run({seed:6}).damages);
  assert.throws(()=>run({faultPosition:-.1}),RangeError);
  assert.throws(()=>run({faultPosition:1.1}),RangeError);
  assert.throws(()=>run({magnitude:8.2}),RangeError);
  assert.throws(()=>run({seed:1.5}),TypeError);
});
test('P-05: causal IDs refer only to preceding events',()=>{
  const result=run(),ids=new Set();
  for(const e of result.events){
    assert.ok(e.causes.every(id=>ids.has(id)));
    ids.add(e.id);
  }
  assert.ok(result.events.some(e=>e.kind==='cascade'));
  assert.ok(result.metrics.depthEdges>=2);
  const dispatch=find(result,'dispatch')?.id;
  assert.ok(result.events.filter(e=>e.kind==='cascade').every(e=>!e.causes.includes(dispatch)));
});
test('all values stay finite and in [0,100]',()=>{
  for(const faultPosition of [0,.125,.25,.49,.5,.75,.855,1]){
    for(const magnitude of [6,6.5,7]){
      const result=run({faultPosition,magnitude});
      assert.equal(result.frames.length,361);
      assert.ok(result.frames.every(f=>f.values.length===5&&f.values.every(v=>Number.isFinite(v)&&v>=0&&v<=100)));
    }
  }
});
