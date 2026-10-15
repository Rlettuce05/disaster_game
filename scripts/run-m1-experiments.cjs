/* P-01 / P-02 / P-03 reproducible comparisons; add --json for machine-readable output. */
'use strict';
const {simulate}=require('../js/m1-sim.js');
const base={magnitude:6.5,seed:42,faultPosition:.125,enableCityAI:true};
const cases=[
  ['P-01: western',{}],
  ['P-01: eastern',{faultPosition:.855}],
  ['P-02: road closed',{mainRoadOpen:false}],
  ['P-03: AI disabled',{enableCityAI:false}]
];
const results=cases.map(([name,cfg])=>{
  const r=simulate({...base,...cfg});
  return {case:name,position:r.faultPosition,meanLoss:r.metrics.meanLoss,
    finalLoss:r.metrics.finalLoss,depth:r.metrics.depthEdges,
    affected:r.metrics.affectedSystems.join(','),
    fireArrival:r.events.find(e=>e.key==='fire-arrival')?.time??null};
});
if(process.argv.includes('--json'))console.log(JSON.stringify(results,null,2));
else console.table(results);
