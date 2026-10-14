/* DISASTER CASCADE M0 – UI-only demo, not a hazard simulator. */
(() => {
  'use strict';
  const D = window.DC_DATA;
  // Screen-play speed is independent of the in-game time step (1 minute).
  const REPLAY_INTERVAL_MS = 120;
  const app = document.getElementById('app');
  const order = ['start','intel','setup','observe','result'];
  const labels = { start:'スタート',intel:'都市分析',setup:'災害条件',observe:'経過観察',result:'結果分析' };
  const S = {
    view:'start', unlocked:0, origin:'west', faultT:D.fault.demoPositions.west,
    magnitude:'6.5', selectedFacility:'water-plant',
    selectedEvent:null, frame:0, playing:false, timer:null, mapLayer:'infrastructure', speed:1,
    activeRun:null, completedRun:null,
  };
  // The selectable hypocenter follows a continuous, piecewise-linear fictitious fault.
  // Two prerecorded outcomes are used only as clearly labelled M0 demonstration regions.
  const faultSegments=D.fault.points.slice(1).map((p,i)=>{
    const a=D.fault.points[i], len=Math.hypot(p[0]-a[0],p[1]-a[1]);
    return {a,b:p,len};
  });
  const faultTotal=faultSegments.reduce((sum,s)=>sum+s.len,0);
  const clamp01=v=>Math.min(1,Math.max(0,v));
  function faultPoint(t){
    let d=clamp01(t)*faultTotal;
    for(const s of faultSegments){
      if(d<=s.len) return [s.a[0]+(s.b[0]-s.a[0])*d/s.len,s.a[1]+(s.b[1]-s.a[1])*d/s.len];
      d-=s.len;
    }
    return D.fault.points.at(-1).slice();
  }
  function closestFaultT(x,y){
    let bestDistance=Infinity, bestT=0, prefix=0;
    for(const s of faultSegments){
      const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1];
      const u=clamp01(((x-s.a[0])*dx+(y-s.a[1])*dy)/(s.len*s.len));
      const px=s.a[0]+dx*u,py=s.a[1]+dy*u;
      const dist=(x-px)**2+(y-py)**2;
      if(dist<bestDistance){bestDistance=dist;bestT=(prefix+s.len*u)/faultTotal;}
      prefix+=s.len;
    }
    return bestT;
  }
  // A completed attempt is immutable: draft edits must never alter an earlier result.
  const displayedRun=()=>S.view==='result'?S.completedRun:S.view==='observe'?S.activeRun:null;
  const runOrigin=()=>displayedRun()?.origin ?? S.origin;
  const runFaultT=()=>displayedRun()?.faultT ?? S.faultT;
  const faultPercent=()=>`${(runFaultT()*100).toFixed(1)}%`;
  function setFaultT(t, redraw=true){
    S.faultT=clamp01(Number(t));
    S.origin=S.faultT<0.5?'west':'east';
    if(redraw)render();
    else {
      const mark=app.querySelector('.fault-marker');
      const [x,y]=faultPoint(S.faultT);
      if(mark)mark.setAttribute('transform',`translate(${x} ${y})`);
      const pos=app.querySelector('#fault-position-value');
      if(pos)pos.textContent=faultPercent();
      const caseLabel=app.querySelector('#fault-case-label');
      if(caseLabel)caseLabel.textContent=`${D.cases[S.origin].zone}代表ケースを演示`;
      const range=app.querySelector('#fault-position');
      if(range)range.value=(S.faultT*100).toFixed(3);
    }
  }
  // Keep a single source of truth for mouse, touch, and slider selection.
  let activePointer=null;
  const esc = (x) => String(x).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const kase = () => D.cases[runOrigin()];
  const frame = () => kase().frames[S.frame];
  const money = () => D.scenario.magnitudeOptions.find(x => x.value === S.magnitude);
  const invalid = () => {
    const m=Number(S.magnitude), opt=money();
    if(m>D.scenario.modeledMaxMagnitude) return {reason:'reality',message:`現実性制約：この架空断層モデルでは M${D.scenario.modeledMaxMagnitude} を上限とする想定です。RPとは独立した制約です。`};
    if(opt.rp>D.scenario.rpBudget) return {reason:'rp',message:`RP不足：必要 ${opt.rp} RP / 使用可能 ${D.scenario.rpBudget} RP。災害規模を変更してください。`};
    if(m!==6.5) return {reason:'unsupported',message:'この条件にはM0演示データがありません。'};
    return null;
  };
  const fmtTime = (minutes) => `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  const allEvents = (limitTime=Infinity) => kase().events.filter(e=>e.time<=limitTime);
  const findEvent = (id) => kase().events.find(e=>e.id===id);
  const facility = (id) => D.facilities.find(f=>f.id===id);
  const statusText = (v) => v<45?'深刻':v<75?'低下':'稼働';
  const statusColor = (v) => v<45?'var(--danger)':v<75?'var(--warning)':'var(--safe)';
  const chip = (s,cls='') => `<span class="chip ${cls}">${esc(s)}</span>`;
  const icon = (symbol) => `<span aria-hidden="true" class="icon">${symbol}</span>`;
  const eventTitle=e=>e.kind==='hazard' ? `地震発生（断層上 ${faultPercent()}）` : e.title;
  const eventDetail=e=>e.kind==='hazard' ? `指定した架空断層上の地点で地震が発生。後続の被害は${kase().zone}代表演示を利用しており、選択座標から計算した結果ではありません。` : e.detail;


  function pause(){ S.playing=false; if(S.timer!==null){clearInterval(S.timer);S.timer=null;} }
  function navigate(page) {
    if(!order.includes(page)) return;
    if(order.indexOf(page)>S.unlocked && page!=='start') return;
    if(page==='result'&&!S.completedRun) return;
    pause(); S.view=page; render(); window.scrollTo({top:0,behavior:'instant'});
  }
  function unlock(page) {
    if(page==='result' && (!S.activeRun || S.frame!==kase().frames.length-1))return;
    if(page==='result')finishAttempt();
    S.unlocked=Math.max(S.unlocked, order.indexOf(page)); navigate(page);
  }
  function finishAttempt(){
    if(S.activeRun && S.frame===kase().frames.length-1){
      S.completedRun={...S.activeRun};
      S.unlocked=Math.max(S.unlocked,order.indexOf('result'));
    }
  }
  function startSimulation() {
    if(invalid()) return;
    pause(); S.frame=0; S.selectedEvent=null;
    S.activeRun={origin:S.origin,faultT:S.faultT,magnitude:S.magnitude};
    S.completedRun=null; // Never expose the outcome of an unplayed retry.
    S.unlocked=order.indexOf('observe');
    S.view='observe'; render(); play();
  }
  function play(){
    if(S.view!=='observe') return;
    if(S.frame===kase().frames.length-1){S.frame=0;S.selectedEvent=null;}
    pause(); S.playing=true;
    updateObserveFrame();
    scheduleReplay();
  }
  function scheduleReplay(){
    if(S.timer!==null)clearInterval(S.timer);
    S.timer=setInterval(()=>{
      if(S.view!=='observe'){pause();return;}
      if(S.frame>=kase().frames.length-1){pause();updateObserveFrame();return;}
      S.frame+=1;
      if(S.frame===kase().frames.length-1){finishAttempt();pause();}
      // No app.innerHTML replacement during playback: preserve input focus and log scrolling.
      updateObserveFrame();
    },REPLAY_INTERVAL_MS/S.speed);
  }
  function gotoFrame(index){
    pause(); S.frame=Math.max(0,Math.min(index,kase().frames.length-1));S.selectedEvent=null;
    if(S.frame===kase().frames.length-1)finishAttempt();
    updateObserveFrame();
  }
  function selectedEventObj(){
    const available=allEvents(S.view==='observe'?frame().time:Infinity);
    return available.find(e=>e.id===S.selectedEvent) || available.at(-1) || null;
  }

  function header(){
    return `<header class="topbar"><div class="topbar-inner">
      <button class="brand" data-action="navigate" data-page="start" aria-label="タイトル画面へ戻る"><span class="brand-mark">D<span class="brand-dot">.</span></span><span class="brand-text">DISASTER <strong>CASCADE</strong><small>都市は、どこから壊れるのか</small></span></button>
      <nav class="top-nav" aria-label="ゲームの進行">
        ${order.slice(1).map((p,i)=>`<button data-action="navigate" data-page="${p}" class="nav-step ${S.view===p?'active':''}" ${order.indexOf(p)>S.unlocked?'disabled':''}><span class="nav-index">0${i+1}</span><span>${labels[p]}</span></button>`).join('')}
      </nav><div class="top-badges">${chip('M0 MOCK','m0')}${chip('架空データ','ghost')}</div>
    </div></header>`;
  }

  function footer(){return `<footer class="footer"><span>DISASTER CASCADE / M0 UI MOCK</span><span>この作品の地図・数値・災害結果・RP規則は演示用の架空データです。実際の被害予測ではありません。</span></footer>`;}
  function titleBlock(kicker,title,desc,addon=''){
    return `<div class="section-head"><div><div class="eyebrow">${esc(kicker)}</div><h1>${title}</h1><p>${desc}</p></div>${addon}</div>`;
  }

  function mapSVG(mode='intel'){
    const ob=mode==='observe', se=mode==='setup';
    const affected=ob?frame().affected:[];
    const earthquakeloc=(se||ob)?faultPoint(runFaultT()):null;
    const statuses = D.facilities.map(f=>{
      const danger=affected.includes(f.id), selected=(S.selectedFacility===f.id && !se);
      const nodeColor = danger?'#d37e70':f.system?D.systems.find(x=>x.id===f.system).color:'#c1c9d0';
      return `<g role="button" tabindex="0" aria-label="${esc(f.label)}の情報" data-action="facility" data-id="${esc(f.id)}" class="map-node ${selected?'picked':''} ${danger?'affected':''}" transform="translate(${f.x} ${f.y})">
       <circle class="node-aura" r="29" fill="${nodeColor}" opacity="${danger?'.16':'.08'}"/>
       <circle r="19" fill="#132d3e" stroke="${nodeColor}" stroke-width="${danger?'3':'2'}"/>
       <text x="0" y="5" text-anchor="middle" font-size="13" font-family="system-ui" font-weight="800" fill="#f0f4f7">${f.code}</text>
       <text class="map-node-label" x="0" y="38" text-anchor="middle" font-size="13" font-weight="650" fill="#e6edf1">${esc(f.label)}</text>
       <circle class="node-alert" cx="15" cy="-15" r="6" fill="#ed947b" stroke="#122534" stroke-width="2"/>
      </g>`;
    }).join('');
    const waterPath='<path d="M220 189 L458 276" class="water-line"/>';
    const powerPath='<path d="M733 178 L715 399" class="power-line"/>';
    const roadPath='<path d="M458 276 L463 420 L715 399" class="road-line"/>';
    let links='';
    if(S.mapLayer==='infrastructure') links=waterPath+powerPath+roadPath;
    if(S.mapLayer==='water') links=waterPath;
    if(S.mapLayer==='power') links=powerPath;
    if(S.mapLayer==='traffic') links=roadPath;
    const faultD='M'+D.fault.points.map(p=>p.join(' ')).join(' L');
    const faultLine=`<g class="fault-geometry" aria-hidden="true"><path class="fault-underlay" d="${faultD}"/><path class="fault-visible" d="${faultD}"/></g>`;
    const faultHit=se?`<path class="fault-hit" d="${faultD}" data-fault-selector="true" aria-hidden="true"/>`:'';
    const marker=(se||ob)?`<g class="fault-marker ${se?'fault-draggable':''}" transform="translate(${earthquakeloc[0]} ${earthquakeloc[1]})" ${se?'data-fault-selector="true"':''} aria-hidden="true"><circle r="30" class="fault-marker-halo"/><circle r="13" class="fault-marker-center"/><path d="M-24 0H-16 M16 0H24 M0-24V-16 M0 16V24" stroke="#ffe0b3" stroke-width="3" stroke-linecap="round"/></g>`:'';
    const ring=ob?`<g pointer-events="none"><circle cx="${earthquakeloc[0]}" cy="${earthquakeloc[1]}" r="47" fill="none" stroke="#e8ab7d" opacity=".45" stroke-dasharray="7 7"/></g>`:'';
    return `<svg class="city-svg" ${se?'data-fault-map="true"':''} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 580" role="img" aria-label="架空都市アルバの模式地図。${se?'黄色の断層線をクリックまたはドラッグして震源位置を選択します。':'施設を選択すると情報が表示されます。'}">
     <defs><pattern id="minorGrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#284759" stroke-width=".7" opacity=".45"/></pattern><pattern id="majorGrid" width="120" height="120" patternUnits="userSpaceOnUse"><rect width="120" height="120" fill="url(#minorGrid)"/><path d="M120 0H0V120" fill="none" stroke="#325164" stroke-width="1" opacity=".5"/></pattern></defs>
     <rect width="960" height="580" fill="#0e2534"/><rect width="960" height="580" fill="url(#majorGrid)"/>
     <path d="M0 0 H338 L312 165 L345 348 L280 580 H0 Z" fill="#163545" opacity=".95"/>
     <path d="M635 0H960V580H618L660 370L637 192Z" fill="#122f41"/>
     <path d="M340 0L326 120L365 270L337 440L360 580" fill="none" stroke="#3a7285" stroke-width="23" opacity=".30"/>
     <path d="M340 0L326 120L365 270L337 440L360 580" fill="none" stroke="#5e9cac" stroke-width="5" opacity=".7"/>
     <g fill="#29495a" opacity=".6">
       <rect x="86" y="78" width="104" height="49" rx="4"/><rect x="110" y="248" width="116" height="56" rx="4"/><rect x="185" y="443" width="94" height="72" rx="4"/><rect x="400" y="69" width="124" height="53" rx="4"/>
       <rect x="502" y="198" width="99" height="53" rx="4"/><rect x="546" y="323" width="93" height="67" rx="4"/><rect x="776" y="81" width="112" height="67" rx="4"/><rect x="775" y="353" width="110" height="70" rx="4"/>
     </g>
     <g stroke="#496273" stroke-width="10" fill="none" opacity=".46"><path d="M48 219L933 219 M105 485L905 485 M475 0L475 580 M805 0L805 580 M140 0L140 580"/><path d="M34 530L850 40"/></g>
     <g stroke="#6e8090" stroke-width="1.5" opacity=".25" stroke-dasharray="5 7" fill="none"><path d="M360 0V580 M645 0V580"/></g>
     <text x="78" y="48" class="region-label">WEST / 西部</text><text x="395" y="48" class="region-label">CENTRAL / 中央</text><text x="718" y="48" class="region-label">EAST / 東部</text>
     <g class="infrastructure">${links}</g>${faultLine}${faultHit}${ring}${statuses}${marker}
     <g transform="translate(897 64)"><path d="M0 20 L0 -18 L-8 0 L0 -4 L8 0 Z" fill="#c4d7df"/><text y="-25" text-anchor="middle" font-size="12" fill="#c4d7df">N</text></g>
     <text x="22" y="550" font-size="11" fill="#8ea6b3" letter-spacing="1">SCHEMATIC CITY · NOT TO SCALE</text><text x="375" y="375" font-size="13" fill="#efb880" pointer-events="none">架空断層</text>
    </svg>`;
  }
  function mapPanel(mode){return `<div class="map-shell"><div class="map-top"><div class="map-name"><span class="map-dot"></span> 架空都市アルバ <span class="muted-dot">/ 都市構造模式図</span></div>${chip(mode==='setup'?'震源選択中':mode==='observe'?'被害レイヤー':'事前調査','ghost')}</div>
    ${mapSVG(mode)}
    <div class="map-bottom"><div class="layer-controls" aria-label="接続レイヤー切替">${[['infrastructure','すべて'],['water','水道'],['power','電力'],['traffic','交通']].map(([k,v])=>`<button data-action="layer" data-layer="${k}" class="layer-btn ${S.mapLayer===k?'selected':''}">${v}</button>`).join('')}</div><span class="map-help">${mode==='setup'?'断層線をドラッグして震源を移動':'● 施設を選択すると詳細表示'}</span></div>
  </div>`;}
  function detailsPanel(){
    const f=facility(S.selectedFacility)||D.facilities[0];
    const systemName=f.system?D.systems.find(s=>s.id===f.system).name:'都市施設';
    const deps=f.dependsOn.length?f.dependsOn.map(d=>facility(d)?.label).filter(Boolean).join(' / '):'なし（本モックの範囲）';
    return `<div class="panel section-surface"><div class="panel-head"><span class="eyebrow">SELECTED FACILITY</span>${chip(f.zone+'地区','ghost')}</div><h2>${esc(f.label)}</h2><div class="mini-label">${esc(systemName)} / ${esc(f.outline)}</div><p class="panel-copy">${esc(f.description)}</p><div class="data-divider"></div><div class="detail-row"><span>依存する施設</span><strong>${esc(deps)}</strong></div><div class="detail-row"><span>影響先</span><strong>${esc(f.supports.length?f.supports.join(' / '):'個別設定なし')}</strong></div>${S.view==='observe'?`<div class="detail-row"><span>現在の状態</span><strong>${frame().affected.includes(f.id)?'<span class="t-danger">影響あり</span>':'<span class="t-safe">大きな影響なし</span>'}</strong></div>`:''}
     <p class="disclaimer-inline">施設配置・依存関係は演示用の架空設定です。</p></div>`;
  }
  function systemBars(values,compact=false){
    return `<div class="system-bars ${compact?'compact':''}">${D.systems.map((s,i)=>{
      const v=values[i];return `<div class="system-item"><div class="system-row"><span><span class="system-color" style="background:${s.color}"></span>${s.name}</span><span class="system-value" style="color:${statusColor(v)}">${v}%</span></div><div class="bar-track"><div class="bar-value ${v<45?'critical':''}" style="width:${v}%;background:${v<45?'var(--danger)':v<75?'var(--warning)':s.color}"></div></div>${compact?'':`<span class="micro muted">${statusText(v)}</span>`}</div>`;}).join('')}</div>`;
  }

  function startScreen(){return `<main class="start-layout"><div class="hero-copy"><div class="eyebrow">STRATEGY / SYSTEMIC RESILIENCE / M0 EXPERIENCE</div><h1>災害を起こす。<br><span>連鎖を読み解く。</span></h1><p class="hero-lead">操作できるのは、自然災害の発生条件だけ。<br>都市は避難・消防・復旧で対抗する。都市機能の依存関係を分析し、連鎖がどこまで波及するかを見極めよう。</p><div class="hero-cta"><button class="btn btn-primary btn-lg" data-action="unlock" data-page="intel">都市の分析を始める <span aria-hidden="true">↗</span></button><span class="hero-meta">所要演示：約3分 / 地震シナリオ</span></div><div class="feature-grid"><div><span class="feature-number">01 /</span><strong>分析する</strong><p>5系統のインフラ依存を調査</p></div><div><span class="feature-number">02 /</span><strong>条件を選ぶ</strong><p>RPと現実性制約を考慮</p></div><div><span class="feature-number">03 /</span><strong>因果を追う</strong><p>都市の対応と被害連鎖を観察</p></div></div></div><div class="hero-visual"><div class="hero-image-head"><span>SCENARIO 001</span><span>JAPAN · FICTIONAL CITY</span></div>${mapSVG('start')}<div class="hero-visual-foot"><strong>ALBA CITY</strong><span>地震 / 西部・東部の比較演示</span></div><div class="hero-sticker">LIVE INTERFACE<br><strong>NO SIMULATION</strong></div></div><div class="start-notice">これは災害シミュレーションではなく画面・操作の検証用モックです。施設、被害数値、対策、勝敗、地理は演示用に作成しています。</div></main>`;}

  function intelScreen(){return `<main class="page">
    ${titleBlock('PHASE 01 / RECONNAISSANCE','都市を調べる','災害の規模だけでは結果は決まらない。都市機能のつながりと、防災上の備えを調査する。',`<button class="btn btn-primary" data-action="unlock" data-page="setup">災害条件の設定へ →</button>`)}
    <div class="content-grid"><div class="main-stack">${mapPanel('intel')}<div class="intel-hint"><span class="hint-icon">i</span>地図上の W / E / F / H / R などの施設を選択すると、依存先と影響先を確認できます。黄色の線は演示用の架空断層です。</div><div class="panel system-overview"><div class="panel-head"><span class="eyebrow">CITY SYSTEMS</span>${chip('被災前 / 全系統100%','safe')}</div><h3>調査対象の都市機能</h3>${systemBars([100,100,100,100,100],true)}</div></div><aside class="side-stack">${detailsPanel()}<div class="panel section-surface"><div class="eyebrow">STRATEGIC INSIGHT</div><h3>連鎖は施設のつながりから生まれる</h3><p class="panel-copy">水道の低下は消防へ、道路の閉塞は救急搬送へ、電力の停止は医療へ影響し得る。都市側の応急対応は、その連鎖を弱めることがある。</p><div class="insight-foot">現在の被害状況ではなく、災害前の構造分析です。</div></div></aside></div>
  </main>`;}

  function setupScreen(){
    const err=invalid(), opt=money();
    return `<main class="page">${titleBlock('PHASE 02 / PARAMETERS','地震条件を設定する','限られたRPの中で一次災害を指定する。二次被害や都市側の対応は直接操作できない。')}
      <div class="content-grid"><div class="main-stack">${mapPanel('setup')}<div class="intel-hint"><span class="hint-icon">i</span>黄色の断層線をクリックするか、震源マーカーを線に沿ってドラッグしてください。右側のスライダーでも微調整できます。震源位置は断層線上に制限されます。</div><div class="panel rule-panel"><div class="eyebrow">GAME RULE</div><p>操作可能：地震の条件のみ。<strong>火災・停電・断水・道路閉塞は指定できません。</strong>発生結果と都市の反応はM0であらかじめ定義されたイベントを再生します。</p></div></div>
      <aside class="side-stack"><div class="panel setup-panel"><div class="panel-head"><span class="eyebrow">SEISMIC EVENT</span>${chip('一次災害','ghost')}</div><h2>発生条件</h2><label class="field-title" for="fault-position">01 / 断層上の震源位置</label><div class="fault-position-readout"><strong id="fault-position-value">${faultPercent()}</strong><span id="fault-case-label">${kase().zone}代表ケースを演示</span></div><input id="fault-position" class="fault-position-slider" type="range" min="0" max="100" step="0.1" value="${(S.faultT*100).toFixed(2)}" aria-label="断層の西端からの位置（パーセント）"><div class="fault-endpoints"><span>断層 西端（0%）</span><span>断層 東端（100%）</span></div><p class="fault-explainer">位置は断層に沿って自由に指定できます。被害は区間別の2つの固定演示のいずれかを再生し、位置ごとの被害計算は行いません。</p><label class="field-title" for="magnitude">02 / 地震規模（演示用）</label><select id="magnitude" class="field-select" aria-label="地震規模を選択">${D.scenario.magnitudeOptions.map(m=>`<option value="${m.value}" ${S.magnitude===m.value?'selected':''}>${m.name}</option>`).join('')}</select>
      <div class="rp-section"><div class="rp-line"><span>RISK POINT</span><strong>${opt.rp} <span>/ ${D.scenario.rpBudget} RP</span></strong></div><div class="bar-track rp-track"><div class="bar-value" style="background:${opt.rp>D.scenario.rpBudget?'var(--danger)':'var(--accent)'};width:${Math.min(100,100*opt.rp/D.scenario.rpBudget)}%"></div></div><div class="rp-detail"><span>消費 ${opt.rp} RP</span><span>残量 ${Math.max(0,D.scenario.rpBudget-opt.rp)} RP</span></div></div>
      <div class="validation ${err?'invalid':'valid'}" role="status"><span aria-hidden="true">${err?'!':'✓'}</span><p>${esc(err?err.message:'設定可能：RPと現実性制約を満たしています。対応する演示ケースが用意されています。')}</p></div>
      <button class="btn btn-primary btn-full" data-action="simulate" ${err?'disabled':''}>地震を発生させる <span>→</span></button><p class="disclaimer-inline">RP計算・断層上限・M値は検証用仮ルールです。実在する断層の評価ではありません。</p></div><div class="panel section-surface"><div class="eyebrow">EXPECTED DEMONSTRATION</div><h3>同規模でも異なる代表演示</h3><p class="panel-copy">震源は架空断層上の任意の位置に置けます。ただしM0の演示結果は西側半分・東側半分の2区間で切り替わる固定データです。位置による影響を連続的に計算しているわけではありません。</p></div></aside></div>
    </main>`;
  }

  function eventList(limit){
    const items=allEvents(limit).slice().reverse();
    return items.length?items.map(e=>`<button class="event-row ${S.selectedEvent===e.id?'active':''}" data-action="event" data-id="${e.id}"><span class="event-time">${fmtTime(e.time)}</span><span class="event-marker ${e.kind}"></span><span class="event-text"><strong>${esc(eventTitle(e))}</strong><small>${e.kind==='response'?'都市側の対策':e.kind==='recovery'?'復旧':e.kind==='cascade'?'連鎖障害':e.kind==='damage'?'一次災害による被害':'一次災害'}</small></span><span class="event-arrow">›</span></button>`).join(''):'<p class="empty-state">現在、表示できるイベントはありません。</p>';
  }
  function selectedEventPanel(){
    const e=selectedEventObj();
    if(!e)return '';
    const causes=e.causes.map(id=>findEvent(id)).filter(Boolean).map(eventTitle);
    const visibleUntil=S.view==='observe'?frame().time:Infinity;
    const children=kase().events.filter(x=>x.time<=visibleUntil && x.causes.includes(e.id));
    const related=(e.context||[]).map(findEvent).filter(Boolean).map(eventTitle);
    return `<div class="panel event-detail"><div class="panel-head"><span class="eyebrow">EVENT DETAIL</span>${chip(fmtTime(e.time),'ghost')}</div><h3>${esc(eventTitle(e))}</h3><p class="panel-copy">${esc(eventDetail(e))}</p><div class="detail-row"><span>原因</span><strong>${esc(causes.length?causes.join(' / '):'一次災害の発生')}</strong></div><div class="detail-row"><span>後続イベント</span><strong>${esc(children.length?children.map(eventTitle).join(' / '):'現時点で判明した後続なし')}</strong></div>${related.length?`<div class="detail-row"><span>対応・関連（原因ではない）</span><strong>${esc(related.join(' / '))}</strong></div>`:''}${e.basis?`<div class="ai-basis"><strong>都市側の判断根拠</strong><p>${esc(e.basis)}</p></div>`:''}</div>`;
  }
  function observeScreen(){
    const f=frame(), c=kase();
    const end=S.frame===c.frames.length-1;
    return `<main class="page observe-page">${titleBlock('PHASE 03 / EVENT REPLAY','災害の連鎖を観察する',`震源：架空断層上 ${faultPercent()} / M6.5。${esc(c.zone)}代表演示を再生中（位置から被害を計算したものではありません）。`,`${chip('演示データ再生中','demo')}`)}
     <div class="content-grid"><div class="main-stack">${mapPanel('observe')}
        <div class="panel playback-panel"><div class="playback-top"><div><span class="eyebrow">TIME CONTROL · Δt = 1分</span><div class="clock"><span data-clock>${fmtTime(f.time)}</span> <small>/ 06:00</small></div></div><div class="playback-actions"><button class="control-btn" data-action="backframe" ${S.frame===0?'disabled':''} aria-label="1分戻る">‹‹</button><button class="control-btn control-main" data-action="${S.playing?'pause':'play'}" aria-label="${S.playing?'一時停止':'再生'}">${S.playing?'Ⅱ':'▶'}</button><button class="control-btn" data-action="nextframe" ${end?'disabled':''} aria-label="1分進む">››</button><button class="speed-btn" data-action="speed" aria-label="再生速度を変更">${S.speed}×</button></div></div>
        <input id="time-slider" type="range" min="0" max="${c.frames.length-1}" step="1" value="${S.frame}" aria-label="演示時刻（1分刻み）" class="time-slider" style="--progress:${100*S.frame/(c.frames.length-1)}%"><div class="tick-labels"><span>00:00</span><span>03:00</span><span>06:00</span></div>
        <div data-replay-ending>${end?`<button class="btn btn-primary btn-full result-btn" data-action="unlock" data-page="result">演示終了。結果を分析する →</button>`:'<span class="micro muted">再生が終わると結果分析へ進めます。時間バーは1分刻みです。イベントのない時刻は直前の状態を維持します。</span>'}</div></div>
        <div class="panel log-panel"><div class="panel-head"><div><span class="eyebrow">EVENT LOG</span><h3>発生したイベント</h3></div><span data-event-count>${chip(`${allEvents(f.time).length} 件`,'ghost')}</span></div><div class="event-list" data-event-list>${eventList(f.time)}</div></div>
     </div><aside class="side-stack"><div class="panel status-panel"><div class="panel-head"><span class="eyebrow">SYSTEM STATUS</span><span data-status-clock>${chip(fmtTime(f.time),'ghost')}</span></div><h2>都市機能の稼働状況</h2><div data-status-bars>${systemBars(f.values)}</div><p class="disclaimer-inline">%は都市機能の稼働率を模した演示値で、実測・予測値ではありません。</p></div><div data-observe-event-detail>${selectedEventPanel()}</div><div data-observe-facility>${detailsPanel()}</div></aside></div>
    </main>`;
  }

  function causalChain(){
    const c=kase(); const selected=S.selectedEvent;
    const chosen=selected?findEvent(selected):null;
    const linked=new Set([selected,...(chosen?.causes||[]),...c.events.filter(e=>e.causes.includes(selected)).map(e=>e.id)]);
    return `<div class="cause-list">${c.events.map((e,i)=>`<button class="cause-node ${selected===e.id?'active':''} ${selected&&!linked.has(e.id)?'dim':''}" data-action="event" data-id="${e.id}" aria-pressed="${selected===e.id}"><span class="cause-step">${String(i+1).padStart(2,'0')}</span><span class="cause-text"><strong>${esc(eventTitle(e))}</strong><small>${fmtTime(e.time)} ${e.causes.length?'· '+e.causes.map(id=>'#'+String(c.events.findIndex(e=>e.id===id)+1).padStart(2,'0')).join(', ')+' から派生':'· 起点'}</small></span><span class="event-marker ${e.kind}"></span></button>`).join('')}</div>`;
  }
  // Only hazard/damage/cascade edges count toward the harmful cascade depth.
  // Responses/recovery can causally support recovery but cannot inflate damage depth.
  function cascadeMetrics(c){
    const damageKinds=new Set(['hazard','damage','cascade']);
    const events=new Map(c.events.map(e=>[e.id,e]));
    const depthCache=new Map();
    function depth(id){
      if(depthCache.has(id))return depthCache.get(id);
      const e=events.get(id);
      if(!e||!damageKinds.has(e.kind))return -1;
      const predecessors=e.causes.map(events.get.bind(events)).filter(p=>p&&damageKinds.has(p.kind));
      const d=predecessors.length?1+Math.max(...predecessors.map(p=>depth(p.id))):0;
      depthCache.set(id,d);return d;
    }
    const depthEdges=Math.max(0,...c.events.filter(e=>damageKinds.has(e.kind)).map(e=>depth(e.id)));
    const touchedSystems=D.systems.filter((sys,i)=>c.frames.some(f=>f.values[i]<100));
    const finalLoss=D.systems.filter((sys,i)=>c.frames.at(-1).values[i]<100);
    return {depthEdges,touchedSystems,finalLoss,efficiency:(c.score/c.rp).toFixed(2)};
  }
  function evaluationPanel(c){
    const m=cascadeMetrics(c);
    const reason=c.ending==='collapse'
      ? `最終時刻に${m.finalLoss.map(s=>s.name).join('・')}の${m.finalLoss.length}系統で機能低下が残存し、複数の系統に連鎖が波及したため、崩壊とする演示です。`
      : `影響を受けた${m.touchedSystems.map(s=>s.name).join('・')}の${m.touchedSystems.length}系統が最終時刻までに100%へ回復したため、収束とする演示です。`;
    return `<div class="panel evaluation-panel"><div class="panel-head"><span class="eyebrow">EVALUATION / DEMO</span>${chip('仮の評価','ghost')}</div>
      <h3>スコアの根拠と連鎖の評価</h3>
      <div class="evaluation-metrics">
        <div><small>有害な連鎖の深さ</small><strong>${m.depthEdges}<em> 辺</em></strong></div>
        <div><small>一度でも影響した都市機能</small><strong>${m.touchedSystems.length}<em> / ${D.systems.length} 系統</em></strong></div>
        <div><small>RP効率（仮スコア / RP）</small><strong>${m.efficiency}<em> 点/RP</em></strong></div>
      </div>
      <p class="panel-copy"><strong>終局の説明：</strong>${esc(reason)}</p>
      <p class="panel-copy">被害・消防活動・道路閉塞などの経路が深く、波及先が多いほど高く評価する構想です。RPが同一でも都市の対処により結果が変わります。西部 ${D.cases.west.score} 点／東部 ${D.cases.east.score} 点は説明用の仮値で、上記の項目から算出していません。</p>
      <p class="disclaimer-inline">深さは一次災害を起点に、被害・連鎖障害のイベントのみをたどった最長経路の因果辺数です。都市側の対策・復旧は数えません。発生後の稼働率低下がある系統を「波及」と数えます。採点式・崩壊閾値はM1〜M2で検討します。</p></div>`;
  }

  function resultScreen(){
    const c=kase(), last=c.frames.at(-1),collapsed=c.ending==='collapse', other=D.cases[c.id==='west'?'east':'west'];
    return `<main class="page">${titleBlock('PHASE 04 / POST-EVENT ANALYSIS','何が連鎖を引き起こしたか','一次災害の条件から、施設損傷、都市の対抗、機能低下までを遡って確認する。',`<button class="btn btn-primary" data-action="retry">条件を変えて再挑戦 ↗</button>`)}
      <div class="result-hero ${collapsed?'red':'green'}"><div><span class="eyebrow">SCENARIO OUTCOME / ${esc(c.name)}</span><h2>${collapsed?'都市機能が崩壊':'都市機能が収束'}</h2><p>${esc(c.summary)}</p><div class="outcome-disclaimer">震源は架空断層上 ${faultPercent()}。この結果は${esc(c.zone)}代表演示の固定結果で、指定した座標の被害予測ではありません。</div></div><div class="score-spot"><span>演示スコア</span><strong>${c.score}<small> / 100</small></strong><span>仮評価 · RP消費 ${c.rp}</span></div></div>
      <div class="result-top-grid"><div class="panel"><div class="panel-head"><span class="eyebrow">FINAL SYSTEM STATUS</span>${chip('06:00','ghost')}</div><h3>最終都市機能</h3>${systemBars(last.values,true)}</div><div class="panel"><div class="panel-head"><span class="eyebrow">CASE COMPARISON</span>${chip('同一規模 M6.5','ghost')}</div><h3>地震位置の違い</h3><div class="comparison"><div class="compare-row"><span></span><strong>現在のケース</strong><strong>比較ケース</strong></div><div class="compare-row"><span>断層上の震源位置</span><strong>${faultPercent()}</strong><strong>${(100*D.fault.demoPositions[other.id]).toFixed(1)}%</strong></div><div class="compare-row"><span>使用した代表演示</span><strong>${c.zone}</strong><strong>${other.zone}</strong></div><div class="compare-row"><span>結果</span><strong>${c.ending==='collapse'?'機能崩壊':'収束'}</strong><strong>${other.ending==='collapse'?'機能崩壊':'収束'}</strong></div><div class="compare-row"><span>演示スコア</span><strong>${c.score}</strong><strong>${other.score}</strong></div><div class="compare-row"><span>RP消費</span><strong>${c.rp}</strong><strong>${other.rp}</strong></div></div><p class="disclaimer-inline">比較用の演示結果です。ゲームバランスや現実の危険性を示すものではありません。</p></div></div>
      ${evaluationPanel(c)}
      <div class="result-analysis-grid"><div class="panel"><div class="panel-head"><span class="eyebrow">CAUSAL HISTORY</span>${chip('原因IDで追跡','ghost')}</div><h3>連鎖イベントと原因</h3><p class="panel-copy">イベントを選択すると、その原因と直後の派生先を強調します。「#」はこの一覧のイベント番号です。</p>${causalChain()}</div><div class="side-stack">${selectedEventPanel()}<div class="panel"><span class="eyebrow">NEXT ATTEMPT</span><h3>別の震源を試す</h3><p class="panel-copy">地震規模を変えず、架空断層上の震源位置を変更できます。演示結果は西側・東側の2種類を切り替えて表示します。</p><button class="btn btn-secondary btn-full" data-action="compare">${other.zone}地区のケースを確認 →</button></div></div></div>
    </main>`;
  }

  function updateObserveFrame(){
    if(S.view!=='observe')return;
    const f=frame(), c=kase(), end=S.frame===c.frames.length-1;
    const clock=app.querySelector('[data-clock]');if(!clock)return;
    clock.textContent=fmtTime(f.time);
    const slider=app.querySelector('#time-slider');
    if(slider){slider.value=String(S.frame);slider.style.setProperty('--progress',`${100*S.frame/(c.frames.length-1)}%`);}
    const backward=app.querySelector('[data-action="backframe"]');if(backward)backward.disabled=S.frame===0;
    const forward=app.querySelector('[data-action="nextframe"]');if(forward)forward.disabled=end;
    const playback=app.querySelector('[data-action="play"], [data-action="pause"]');
    if(playback){playback.dataset.action=S.playing?'pause':'play';playback.setAttribute('aria-label',S.playing?'一時停止':'再生');playback.textContent=S.playing?'Ⅱ':'▶';}
    const speed=app.querySelector('[data-action="speed"]');if(speed)speed.textContent=`${S.speed}×`;
    const statusClock=app.querySelector('[data-status-clock]');if(statusClock)statusClock.innerHTML=chip(fmtTime(f.time),'ghost');
    const bars=app.querySelector('[data-status-bars]');
    const newValues=JSON.stringify(f.values);
    if(bars&&bars.dataset.values!==newValues){bars.innerHTML=systemBars(f.values);bars.dataset.values=newValues;}
    // Update affected map nodes in place; do not replace the map while it has focus.
    app.querySelectorAll('.observe-page .map-node[data-id]').forEach(el=>{
      el.classList.toggle('affected',f.affected.includes(el.dataset.id));
    });
    const log=app.querySelector('[data-event-list]');
    const eventIds=allEvents(f.time).map(e=>e.id).join(',');
    if(log&&log.dataset.events!==eventIds){
      const scrollTop=log.scrollTop;
      log.innerHTML=eventList(f.time);
      log.scrollTop=scrollTop;
      log.dataset.events=eventIds;
    }
    const count=app.querySelector('[data-event-count]');if(count)count.innerHTML=chip(`${allEvents(f.time).length} 件`,'ghost');
    const detail=app.querySelector('[data-observe-event-detail]');
    if(detail){const html=selectedEventPanel();if(detail.dataset.html!==html){detail.innerHTML=html;detail.dataset.html=html;}}
    const info=app.querySelector('[data-observe-facility]');
    if(info){const html=detailsPanel();if(info.dataset.html!==html){info.innerHTML=html;info.dataset.html=html;}}
    const ending=app.querySelector('[data-replay-ending]');
    if(ending&&ending.dataset.ended!==String(end)){
      ending.innerHTML=end?'<button class="btn btn-primary btn-full result-btn" data-action="unlock" data-page="result">演示終了。結果を分析する →</button>':'<span class="micro muted">再生が終わると結果分析へ進めます。時間バーは1分刻みです。イベントのない時刻は直前の状態を維持します。</span>';
      ending.dataset.ended=String(end);
    }
    const resultNav=app.querySelector('.top-nav [data-page="result"]');if(resultNav)resultNav.disabled=!S.completedRun;
  }

  function render(){
    app.innerHTML=header()+({start:startScreen,intel:intelScreen,setup:setupScreen,observe:observeScreen,result:resultScreen}[S.view])()+footer();
    if(S.view==='observe')updateObserveFrame();
  }

  app.addEventListener('click',(ev)=>{
    const target=ev.target.closest('[data-action]');
    if(!target||target.disabled) return;
    const a=target.dataset.action;
    if(a==='navigate') return navigate(target.dataset.page);
    if(a==='unlock') return unlock(target.dataset.page);
    if(a==='facility') {S.selectedFacility=target.dataset.id;return render();}
        if(a==='layer') {S.mapLayer=target.dataset.layer;return render();}
    if(a==='simulate') return startSimulation();
    if(a==='pause') {pause();return updateObserveFrame();}
    if(a==='play') return play();
    if(a==='backframe') return gotoFrame(S.frame-1);
    if(a==='nextframe') return gotoFrame(S.frame+1);
    if(a==='speed') {S.speed=S.speed===1?2:S.speed===2?4:1;if(S.playing)scheduleReplay();return updateObserveFrame();}
    if(a==='event'){S.selectedEvent=target.dataset.id;return render();}
    if(a==='retry'){S.selectedEvent=null;S.frame=0;S.completedRun=null;S.activeRun=null;S.unlocked=order.indexOf('observe');return navigate('setup');}
    if(a==='compare'){setFaultT(D.fault.demoPositions[kase().id==='west'?'east':'west'],false);S.magnitude='6.5';S.frame=0;S.selectedEvent=null;return startSimulation();}
  });
  function pointerFaultT(ev,svg){
    const ctm=svg.getScreenCTM();
    if(!ctm)return S.faultT;
    const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;
    const local=p.matrixTransform(ctm.inverse());
    return closestFaultT(local.x,local.y);
  }
  app.addEventListener('pointerdown',ev=>{
    const selector=ev.target.closest('[data-fault-selector]');
    if(S.view!=='setup'||!selector||!ev.isPrimary||ev.button!==0)return;
    const svg=selector.closest('svg[data-fault-map]');
    if(!svg)return;
    ev.preventDefault();
    activePointer=ev.pointerId;
    svg.setPointerCapture(ev.pointerId);
    setFaultT(pointerFaultT(ev,svg),false);
  });
  app.addEventListener('pointermove',ev=>{
    if(activePointer!==ev.pointerId)return;
    const svg=app.querySelector('svg[data-fault-map]');
    if(svg)setFaultT(pointerFaultT(ev,svg),false);
  });
  function endFaultDrag(ev){
    if(activePointer!==ev.pointerId)return;
    const svg=app.querySelector('svg[data-fault-map]');
    if(svg&&svg.hasPointerCapture(ev.pointerId))svg.releasePointerCapture(ev.pointerId);
    activePointer=null;
    render();
  }
  app.addEventListener('pointerup',endFaultDrag);
  app.addEventListener('pointercancel',endFaultDrag);
  app.addEventListener('keydown',(ev)=>{
    if((ev.key==='Enter'||ev.key===' ')&&ev.target.matches('g[role="button"][data-action]')){
      ev.preventDefault();ev.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    }
  });
  app.addEventListener('change',(ev)=>{
    if(ev.target.id==='magnitude') {S.magnitude=ev.target.value;render();}
    if(ev.target.id==='fault-position'){setFaultT(Number(ev.target.value)/100);app.querySelector('#fault-position')?.focus({preventScroll:true});}
    if(ev.target.id==='time-slider') gotoFrame(Number(ev.target.value));
  });
  app.addEventListener('input',(ev)=>{
    if(ev.target.id==='fault-position')setFaultT(Number(ev.target.value)/100,false);
    if(ev.target.id==='time-slider') {
      // Live seek without destroying the slider or pointer capture.
      gotoFrame(Number(ev.target.value));
    }
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&S.playing){pause();render();}});
  render();
})();
