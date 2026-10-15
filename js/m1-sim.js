/* DISASTER CASCADE M1: deterministic fictional-city cascade model. */
/* No real-world hazard prediction is implied by these arbitrary calibrated rules. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DC_SIM = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const FAULT = [[90,365],[185,320],[325,290],[475,332],[650,347],[785,305],[875,255]];
  const POINTS = {
    'water-plant':[220,189], 'power-station':[733,178],
    'fire-station':[458,276], hospital:[715,399],
    'main-road':[463,420], residential:[255,377]
  };
  const SYSTEMS = ['power','water','traffic','fire','medical'];
  const clamp = (x,a=0,b=1) => Math.min(b,Math.max(a,x));
  const round = x => Math.round(x*10000)/10000;
  function pointOnFault(t) {
    const lens = FAULT.slice(1).map((p,i)=>Math.hypot(p[0]-FAULT[i][0],p[1]-FAULT[i][1]));
    let remain = clamp(t)*lens.reduce((a,b)=>a+b,0);
    for(let i=0;i<lens.length;i++){
      if(remain<=lens[i]){
        const f=remain/lens[i];
        return [FAULT[i][0]+f*(FAULT[i+1][0]-FAULT[i][0]),FAULT[i][1]+f*(FAULT[i+1][1]-FAULT[i][1])];
      }
      remain-=lens[i];
    }
    return FAULT[FAULT.length-1].slice();
  }
  function rngFor(seed) {
    let x=Number(seed)>>>0;
    return function () {
      x += 0x6D2B79F5;
      let z=x; z=Math.imul(z^(z>>>15),z|1);
      z^=z+Math.imul(z^(z>>>7),z|61);
      return ((z^(z>>>14))>>>0)/4294967296;
    };
  }
  function intensity(magnitude,source,point) {
    const distance=Math.hypot(source[0]-point[0],source[1]-point[1]);
    return clamp((0.92+0.28*(magnitude-6.0))*Math.exp(-distance/255));
  }
  function cascadeMetrics(events,frames) {
    const relevant=new Set(['hazard','damage','cascade']);
    const known=new Map(events.map(e=>[e.id,e]));
    const depth=new Map();
    function trace(id,stack=new Set()) {
      if(depth.has(id))return depth.get(id);
      const e=known.get(id);
      if(!e||!relevant.has(e.kind)||stack.has(id))return 0;
      stack.add(id);
      const parent=e.causes.filter(x=>known.has(x)&&relevant.has(known.get(x).kind));
      const d=parent.length?1+Math.max(...parent.map(x=>trace(x,stack))):0;
      stack.delete(id);depth.set(id,d);return d;
    }
    const depthEdges=Math.max(0,...events.filter(e=>relevant.has(e.kind)).map(e=>trace(e.id)));
    const affectedSystems=SYSTEMS.filter((_,i)=>frames.some(f=>f.values[i]<99.99));
    const avgLoss=frames.reduce((sum,f)=>sum+f.values.reduce((s,v)=>s+(100-v)/100,0)/SYSTEMS.length,0)/frames.length;
    const finalLoss=frames.at(-1).values.reduce((s,v)=>s+(100-v)/100,0)/SYSTEMS.length;
    return {depthEdges,affectedSystems,affectedCount:affectedSystems.length,
      meanLoss:round(avgLoss),finalLoss:round(finalLoss)};
  }
  function validate(cfg) {
    if(!cfg||!Number.isFinite(cfg.faultPosition)||cfg.faultPosition<0||cfg.faultPosition>1)
      throw new RangeError('faultPosition must be in [0, 1]');
    if(!Number.isFinite(cfg.magnitude)||cfg.magnitude<5.0||cfg.magnitude>7.5)
      throw new RangeError('magnitude is outside the fictional model [5.0, 7.5]');
    if(cfg.seed!==undefined&&!Number.isSafeInteger(cfg.seed))
      throw new TypeError('seed must be an integer');
  }
  function simulate(cfg) {
    validate(cfg);
    const tmax=360, step=1, random=rngFor(cfg.seed===undefined?42:cfg.seed);
    const source=pointOnFault(cfg.faultPosition);
    const values={};
    for(const [id,p] of Object.entries(POINTS))values[id]=intensity(cfg.magnitude,source,p);
    const damage={
      water:clamp((values['water-plant']-.38)*1.78*(.94+.12*random())),
      power:clamp((values['power-station']-.39)*1.85*(.94+.12*random())),
      road:clamp((values['main-road']-.83)*1.2*(.94+.12*random()))
    };
    const ignition=values.residential>.60;
    const events=[],frames=[],ids={};
    function emit(time,kind,key,title,place,causes=[],context=[],basis=''){
      const event={id:'m1-'+String(events.length+1).padStart(3,'0'),
        time,kind,key,title,detail:title,place,causes:causes.filter(Boolean),
        context:context.filter(Boolean),basis};
      if(event.causes.some(c=>!events.some(x=>x.id===c)))
        throw new Error('Unknown cause for '+key);
      events.push(event);ids[key]=event.id;return event.id;
    }
    const hazard=emit(0,'hazard','earthquake','地震が発生','residential');
    const baseline={time:0,values:[100,100,100,100,100],affected:[]};
    frames.push(baseline);
    let fireSize=0,fireStarted=false,dispatched=false,arrived=false,mainClosed=false,backup=false;
    let observedAt=Infinity,eta=Infinity,route='',fireResolved=false;
    let medicalWarn=false,fireSpread=false,fireRoad=false,powerWarn=false,waterWarn=false;
    let powerRepair=false,waterRepair=false,roadDamage=false;
    const AI=(cfg.enableCityAI!==false);
    for(let time=step;time<=tmax;time+=step) {
      // Initial earthquake damage. All subsequent values are computed, not scripted keyframes.
      if(time===1){
        if(damage.water>.06)emit(time,'damage','water-damage','給水センターが損傷','water-plant',[hazard]);
        if(damage.power>.06)emit(time,'damage','power-damage','変電所が損傷','power-station',[hazard]);
        if(damage.road>.10)emit(time,'damage','road-damage','幹線道路が地震で損傷','main-road',[hazard]);
      }
      const water=clamp(1-damage.water+Math.max(0,time-150)*.00040);
      const power=clamp(1-damage.power+Math.max(0,time-90)*.00135);
      if(!waterWarn&&water<.78&&ids['water-damage']){
        emit(time,'cascade','water-short','消防用水の供給能力が低下','fire-station',[ids['water-damage']]);
        waterWarn=true;
      }
      if(!powerWarn&&power<.80&&ids['power-damage']){
        emit(time,'cascade','power-short','病院への商用電源が不足','hospital',[ids['power-damage']]);
        powerWarn=true;
      }
      if(ignition&&time===8){
        fireStarted=true;fireSize=clamp((values.residential-.60)*.32+.03);
        emit(time,'damage','fire-ignition','住宅地区で地震後の火災が発生','residential',[hazard]);
        observedAt=time+10;
      }
      if(powerWarn&&!backup&&time>=10){
        backup=true;
        emit(time,'response','backup','病院が非常用電源を起動','hospital',
          [ids['power-short']],[],'病院が商用電源の不足を観測');
      }
      if(fireStarted&&!fireResolved) {
        // Suppression has effect only after deployment and physical arrival.
        const growth=.0045+.012*(1-water)+.0015*fireSize;
        const suppression=arrived ? .017*(.20+.80*water) : 0;
        fireSize=clamp(fireSize+growth-suppression);
        if(AI&&!dispatched&&time>=observedAt){
          dispatched=true;
          mainClosed=cfg.mainRoadOpen===false || damage.road>.30;
          route=mainClosed?'迂回路':'幹線道路';
          eta=time+(mainClosed?52:18);
          emit(time,'response','dispatch','消防隊が出動を決定','fire-station',
            [ids['fire-ignition']],[],'受理済みの火災通報に基づく判断');
        }
        if(dispatched&&!arrived&&time>=eta){
          // Road condition is rechecked at arrival; a closure can delay dispatch.
          const closed=cfg.mainRoadOpen===false||damage.road>.30||fireRoad;
          if(route==='幹線道路'&&closed){route='迂回路';eta=time+34;}
          else{
            arrived=true;
            emit(time,'response','fire-arrival','消防隊が現場に到着','residential',
              [ids.dispatch],[],'到着時点の道路状態を反映');
          }
        }
        if(!fireSpread&&fireSize>=.36){
          fireSpread=true;
          emit(time,'cascade','fire-spread','火災が周辺地区へ拡大','residential',
            [ids['fire-ignition'],ids['water-short']]);
        }
        if(!fireRoad&&fireSize>=.68){
          fireRoad=true;
          emit(time,'cascade','road-closure','延焼で幹線道路が通行不能','main-road',
            [ids['fire-spread']||ids['fire-ignition']]);
        }
        if(fireSize<=.005&&arrived){
          fireResolved=true;
          emit(time,'recovery','fire-contained','消防活動により火災が鎮火','residential',
            [ids['fire-ignition'],ids['fire-arrival']]);
        }
      }
      mainClosed=cfg.mainRoadOpen===false||damage.road>.30||fireRoad;
      const traffic=mainClosed ? .43 : clamp(1-damage.road);
      const firefighting=clamp(.65*water+.35*traffic-.20*fireSize);
      // Backup limits emergency service without magically restoring mains.
      const effectivePower=clamp(power+(backup?Math.min(.7,1-power):0));
      const medical=clamp((.55*effectivePower+.45*traffic)*(1-.17*fireSize));
      if(!medicalWarn&&medical<.78){
        medicalWarn=true;
        emit(time,'cascade','medical-reduction','医療提供能力が低下','hospital',
          [ids['road-closure']||ids['road-damage'],ids['power-short'],ids['fire-spread']]);
      }
      if(!powerRepair&&time>90&&power>=.82&&ids['power-damage']){
        powerRepair=true;
        emit(time,'recovery','power-repair','電力設備の供給能力が回復','power-station',
          [ids['power-damage']]);
      }
      if(!waterRepair&&time>150&&water>=.82&&ids['water-damage']){
        waterRepair=true;
        emit(time,'recovery','water-repair','給水設備の供給能力が回復','water-plant',
          [ids['water-damage']]);
      }
      const sys=[power,water,traffic,firefighting,medical];
      frames.push({time,values:sys.map(x=>Math.round(x*100)),
        affected:[
          ...(water<.90?['water-plant']:[]),
          ...(power<.90?['power-station']:[]),
          ...(mainClosed?['main-road']:[]),
          ...(fireSize>.005?['residential']:[]),
          ...(firefighting<.75?['fire-station']:[]),
          ...(medical<.90?['hospital']:[])
        ]});
    }
    const metrics=cascadeMetrics(events,frames);
    const score=Math.round(metrics.meanLoss*100);
    const ending=metrics.finalLoss>.18?'collapse':'contained';
    return {isSimulation:true,id:cfg.faultPosition<.5?'west':'east',
      zone:cfg.faultPosition<.5?'西部':'東部',name:'M1計算結果',rp:cfg.magnitude<=6?25:cfg.magnitude<=6.5?35:55,
      faultPosition:cfg.faultPosition,magnitude:cfg.magnitude,seed:cfg.seed===undefined?42:cfg.seed,
      frames,events,metrics,score,ending,damages:Object.fromEntries(Object.entries(damage).map(([k,v])=>[k,round(v)])),
      summary:'架空の被害モデルによる計算結果。都市機能損失・災害連鎖を比較してください。'};
  }
  return {simulate,cascadeMetrics,pointOnFault,intensity,SYSTEMS};
});
