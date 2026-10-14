/* M0 demonstration data. All places, quantitative values, and RP rules are fictional. */
window.DC_DATA = (() => {
  'use strict';

  const systems = [
    { id: 'power', name: '電力', short: '電力', color: '#e5b65f' },
    { id: 'water', name: '水道', short: '水道', color: '#72b7d6' },
    { id: 'traffic', name: '交通', short: '交通', color: '#a4bc98' },
    { id: 'fire', name: '消防', short: '消防', color: '#df846e' },
    { id: 'medical', name: '医療', short: '医療', color: '#b7a1d5' },
  ];

  const facilities = [
    { id:'water-plant', label:'西部給水センター', code:'W', system:'water', x:220, y:189, zone:'西部', description:'市内の一部へ給水する施設。消防水利の供給とも関係する。', dependsOn:[], supports:['消防拠点','住宅地区'], outline:'河川付近の架空給水施設' },
    { id:'power-station', label:'東部変電所', code:'E', system:'power', x:733, y:178, zone:'東部', description:'病院などへの電力供給に関係する施設。', dependsOn:[], supports:['中央病院','東部居住区'], outline:'架空の送配電拠点' },
    { id:'fire-station', label:'中央消防署', code:'F', system:'fire', x:458, y:276, zone:'中央', description:'出動隊を配備。道路の通行状況と消火用水に依存する。', dependsOn:['water-plant','main-road'], supports:['住宅地区'], outline:'消火・救助の拠点' },
    { id:'hospital', label:'中央病院', code:'H', system:'medical', x:715, y:399, zone:'東部', description:'非常用電源を備える想定。電力とアクセス道路に依存する。', dependsOn:['power-station','main-road'], supports:['傷病者の受入れ'], outline:'架空の地域医療拠点' },
    { id:'main-road', label:'中央幹線道路', code:'R', system:'traffic', x:463, y:420, zone:'中央', description:'消防署と病院を結ぶ主要な交通路。道路閉塞が救急搬送に影響する。', dependsOn:[], supports:['消防署','中央病院'], outline:'広域交通の仮想接続' },
    { id:'residential', label:'西部住宅地区', code:'B', system:null, x:255, y:377, zone:'西部', description:'建物の損傷により二次的な火災が起こる演示地区。', dependsOn:['water-plant'], supports:[], outline:'模式的な住宅地区' },
    { id:'shelter', label:'避難支援拠点', code:'S', system:null, x:571, y:140, zone:'中央', description:'市の避難支援を表す施設。M0では状態計算の対象外。', dependsOn:['main-road'], supports:[], outline:'防災施設の例' },
  ];

  // The replay clock advances in fixed 1-minute steps. Sparse scripted keyframes
  // remain authoritative; between keyframes we hold the most recently known
  // state rather than inventing intermediate physical changes.
  const replayStepMinutes = 1;
  const frames = (entries) => {
    if (!entries.length || entries[0][0] !== 0) throw new Error('Replay must start at t=0');
    for (let i = 0; i < entries.length; i += 1) {
      if (!Number.isInteger(entries[i][0]) || (i && entries[i][0] <= entries[i-1][0])) {
        throw new Error('Keyframe times must be strictly increasing whole minutes');
      }
    }
    const timeline = [];
    let keyframe = 0;
    for (let minute = 0; minute <= entries.at(-1)[0]; minute += replayStepMinutes) {
      while (keyframe + 1 < entries.length && entries[keyframe + 1][0] <= minute) keyframe += 1;
      const [, values, affected] = entries[keyframe];
      timeline.push({ time: minute, values, affected });
    }
    return timeline;
  };
  const west = {
    id:'west', name:'西部震源', zone:'西部', loc:[185,320], rp:35,
    summary:'断水が消火活動を制約し、火災と道路閉塞を通じて交通・医療へ影響が広がる。',
    ending:'collapse', score:82,
    frames:frames([
      [0,   [100,100,100,100,100], ['residential']],
      [30,  [100,74,100,100,100], ['residential','water-plant']],
      [60,  [100,59,100,97,100], ['residential','water-plant']],
      [90,  [100,56,100,89,100], ['residential','water-plant']],
      [120, [100,53,100,62,100], ['residential','water-plant','fire-station']],
      [180, [100,49,83,46,94], ['residential','water-plant','fire-station']],
      [240, [100,47,38,36,79], ['residential','water-plant','fire-station','main-road']],
      [360, [100,58,34,31,64], ['residential','fire-station','main-road','hospital']],
    ]),
    events:[
      {id:'w1',time:0, kind:'hazard', title:'地震が西部地区で発生', detail:'揺れが西部住宅地区および周辺インフラに作用した。', causes:[], place:'residential'},
      {id:'w2',time:30,kind:'damage',title:'西部給水センターに損傷',detail:'地震により送水機能が低下したという演示設定。',causes:['w1'],place:'water-plant'},
      {id:'w3',time:60,kind:'cascade',title:'消防用水の供給圧が低下',detail:'水道機能の低下が消火能力へ波及した。',causes:['w2'],place:'fire-station'},
      {id:'w4',time:60,kind:'damage',title:'住宅地区で火災発生',detail:'地震に伴う二次被害。プレイヤーが直接発火させたものではない。',causes:['w1'],place:'residential'},
      {id:'w5',time:90,kind:'response',title:'市消防本部が部隊を派遣',detail:'火災の通報を確認し、消防署から出動した。',basis:'この時点で受けた火災通報',causes:['w4'],place:'fire-station'},
      {id:'w6',time:120,kind:'cascade',title:'消火活動の能力が不足',detail:'出動は実施されたが、消火用水不足が活動を制約した。',causes:['w3'],context:['w5'],place:'fire-station'},
      {id:'w7',time:180,kind:'cascade',title:'火災が周辺地区へ拡大',detail:'消火能力の不足と発生した火災の影響が重なった。',causes:['w4','w6'],place:'residential'},
      {id:'w8',time:240,kind:'cascade',title:'中央幹線道路が通行不能',detail:'延焼区域に接続する道路を規制し、通行が停止した。',causes:['w7'],place:'main-road'},
      {id:'w9',time:240,kind:'response',title:'市が迂回路の確保を指示',detail:'道路の通行止めを把握した後、代替経路を指示した。',basis:'道路の閉塞情報',causes:['w8'],place:'main-road'},
      {id:'w10',time:360,kind:'cascade',title:'医療搬送に遅延が発生',detail:'主要路線の閉塞により医療施設へのアクセスが低下した。',causes:['w8'],context:['w9'],place:'hospital'},
    ]
  };
  const east = {
    id:'east', name:'東部震源', zone:'東部', loc:[785,305], rp:35,
    summary:'停電が発生するが、非常用電源と復旧対応によって医療機能が維持される。',
    ending:'contained', score:27,
    frames:frames([
      [0,   [100,100,100,100,100], ['power-station']],
      [30,  [57,100,100,100,100], ['power-station']],
      [60,  [52,100,100,100,83], ['power-station','hospital']],
      [90,  [52,100,100,100,87], ['power-station']],
      [120, [62,100,100,100,91], ['power-station']],
      [180, [81,100,100,100,95], ['power-station']],
      [240, [92,100,100,100,98], []],
      [360, [100,100,100,100,100], []],
    ]),
    events:[
      {id:'e1',time:0,kind:'hazard',title:'地震が東部地区で発生',detail:'揺れが東部の電力設備に作用した。',causes:[],place:'power-station'},
      {id:'e2',time:30,kind:'damage',title:'東部変電所に損傷',detail:'送電設備の被害により一部停電が発生した。',causes:['e1'],place:'power-station'},
      {id:'e3',time:60,kind:'cascade',title:'病院の商用電源が停止',detail:'送電機能の低下により医療施設が影響を受けた。',causes:['e2'],place:'hospital'},
      {id:'e4',time:90,kind:'response',title:'病院が非常用電源を稼働',detail:'商用電源の停止を検知し、非常用電源へ切り替えた。',basis:'自施設で検知した停電',causes:['e3'],place:'hospital'},
      {id:'e5',time:120,kind:'response',title:'電力事業者が復旧作業を開始',detail:'設備障害の報告を受けて安全確認後に復旧作業へ移行した。',basis:'変電所の障害報告',causes:['e2'],place:'power-station'},
      {id:'e6',time:180,kind:'recovery',title:'一部地域への送電が復旧',detail:'復旧作業によって電力供給が回復し始めた。',causes:['e5'],place:'power-station'},
      {id:'e7',time:240,kind:'recovery',title:'医療機能がほぼ回復',detail:'非常用電源と送電復旧の組み合わせにより医療活動を継続した。',causes:['e4','e6'],place:'hospital'},
      {id:'e8',time:360,kind:'recovery',title:'主要な都市機能が収束',detail:'想定した機能低下は解消した。',causes:['e6','e7'],place:'hospital'},
    ]
  };
  // Fictional fault geometry for unrestricted epicenter placement in the M0 UI.
  // The displayed path and positional percentages are schematic, not geospatial data.
  const fault = {
    points: [[90,365],[185,320],[325,290],[475,332],[650,347],[785,305],[875,255]],
    demoPositions: { west:0.125, east:0.855 },
  };
  const cases = { west, east };
  const scenario = {
    name:'内陸地震 / 架空都市アルバ',
    rpBudget:60,
    magnitudeOptions:[
      {value:'6.5',rp:35,name:'M6.5  標準演示'},
      {value:'7.3',rp:75,name:'M7.3  RP超過例'},
      {value:'8.2',rp:100,name:'M8.2  現実性制約違反例'}
    ],
    modeledMaxMagnitude:7.5
  };
  return { systems, facilities, fault, cases, scenario, replayStepMinutes, timeLabels:['00:00','01:00','02:00','03:00','04:00','05:00','06:00'] };
})();
