from pathlib import Path
from playwright.sync_api import sync_playwright
import re
import shutil
R=Path(__file__).resolve().parents[1]

def setup(page):
    html=(R/'index.html').read_text()
    html=re.sub(r'<script src="js/(?:data|app).js" defer></script>','',html)
    html=re.sub(r'<link rel="stylesheet" href="css/style.css">','',html)
    page.set_content(html)
    page.add_style_tag(content=(R/'css/style.css').read_text())
    page.add_script_tag(content=(R/'js/data.js').read_text())
    page.add_script_tag(content=(R/'js/app.js').read_text())

def go_setup(page):
    page.locator('[data-action="unlock"][data-page="intel"]').click()
    page.locator('[data-action="unlock"][data-page="setup"]').click()

def start(page):
    page.locator('[data-action="simulate"]').click()
    page.locator('[data-action="pause"]').click()

def seek(page,n):
    page.locator('#time-slider').evaluate('(el, v) => {el.value = v; el.dispatchEvent(new Event("input", {bubbles:true}));}',str(n))

def assert_contains(locator,txt):
    assert txt in locator.inner_text(),(txt,locator.inner_text())

with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1280,'height':800})
  errors=[]
  page.on('pageerror',lambda err:errors.append(str(err)))
  setup(page);go_setup(page)
  # Free fault choice and M0 replay
  assert page.locator('#fault-position').count()==1
  start(page)
  seek(page,0)
  detail=page.locator('[data-observe-event-detail]')
  assert '西部給水センターに損傷' not in detail.inner_text(),detail.inner_text()
  seek(page,29)
  assert '西部給水センターに損傷' not in detail.inner_text(),detail.inner_text()
  seek(page,30)
  page.locator('[data-event-list] [data-id="w1"]').click()
  detail=page.locator('[data-observe-event-detail]')
  assert_contains(detail,'西部給水センターに損傷')
  assert '住宅地区で火災発生' not in detail.inner_text(),detail.inner_text()
  seek(page,60)
  page.locator('[data-event-list] [data-id="w1"]').click()
  assert_contains(detail,'住宅地区で火災発生')
  print('PASS #2: future children hidden / revealed at correct time')
  # Ensure UI element objects persist across ticks; focus and scrollbar stable.
  seek(page,241)
  page.locator('[data-event-list]').evaluate('(el)=>{el.scrollTop=60}')
  before=page.locator('[data-event-list]').evaluate('(el)=>el.scrollTop')
  slider=page.locator('#time-slider')
  btn=page.locator('[data-action="speed"]')
  btn.click();btn.click() # speed 4x
  page.evaluate("window._speedNode = document.querySelector('[data-action=\"speed\"]'); window._sliderNode = document.getElementById('time-slider');")
  page.locator('[data-action="play"]').click()
  page.wait_for_timeout(280)
  assert page.evaluate("window._speedNode === document.querySelector('[data-action=\"speed\"]')"), 'speed button was recreated during replay'
  assert page.evaluate("window._sliderNode === document.getElementById('time-slider')"), 'slider was recreated during replay'
  after=page.locator('[data-event-list]').evaluate('(el)=>el.scrollTop')
  assert after==before,(before,after)
  btn.focus()
  page.wait_for_timeout(120)
  assert page.evaluate('document.activeElement.dataset.action')=='speed','focus lost during replay'
  page.locator('[data-action="pause"]').click()
  print('PASS #4: playback uses stable controls; focus and log scroll preserved')
  # #5 causal correction and scoring #6
  seek(page,360)
  page.locator('[data-action="unlock"][data-page="result"]').click()
  assert_contains(page.locator('.evaluation-panel'),'6 辺')
  assert_contains(page.locator('.evaluation-panel'),'4 / 5 系統')
  assert_contains(page.locator('.evaluation-panel'),'2.34')
  page.locator('.cause-node[data-id="w10"]').click()
  detail=page.locator('.result-analysis-grid .event-detail')
  assert_contains(detail,'中央幹線道路が通行不能')
  assert_contains(detail,'対応・関連（原因ではない）')
  assert_contains(detail,'市が迂回路の確保を指示')
  cause=detail.locator('.detail-row').first.inner_text()
  assert '迂回路の確保を指示' not in cause,cause
  print('PASS #5/#6: mitigation separate from cause; score factors and cascade depth explainable')
  # #3 retry should not reveal new outcome without run
  page.locator('[data-action="retry"]').click()
  page.locator('#fault-position').evaluate('(el)=>{el.value="85.5";el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}')
  nav=page.locator('.top-nav [data-page="result"]')
  assert nav.is_disabled(), 'result navigation should be locked on retry'
  nav.evaluate('(el)=>el.click()')
  assert page.locator('#fault-position').count()==1, 'unexpectedly navigated to result'
  start(page);seek(page,360);page.locator('[data-action="unlock"][data-page="result"]').click()
  assert_contains(page.locator('.evaluation-panel'),'2 辺')
  assert_contains(page.locator('.evaluation-panel'),'2 / 5 系統')
  assert_contains(page.locator('.evaluation-panel'),'0.77')
  assert_contains(page.locator('.result-hero'),'85.5%')
  print('PASS #3/#6: new results gated by completion, east score metrics correct')
  # The completed east trial remains the source for an old result even if a draft is edited.
  page.locator('.top-nav [data-page="setup"]').click()
  page.locator('#fault-position').evaluate('(el)=>{el.value="12.5";el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}')
  page.locator('.top-nav [data-page="result"]').click()
  assert_contains(page.locator('.result-hero'),'85.5%')
  assert_contains(page.locator('.result-hero'),'27')
  print('PASS #3: completed run remains immutable after editing another draft')

  # Run one-minute clock at every speed and finish normally (without seek to end).
  second=browser.new_page(viewport={'width':390,'height':844})
  second_errors=[]
  second.on('pageerror',lambda err:second_errors.append(str(err)))
  setup(second);go_setup(second)
  assert second.locator('#fault-position').is_visible()
  start(second)
  for factor in (1,2,4):
    # Always start from 05:58 and watch the natural progression.
    seek(second,358)
    second.locator('[data-action="play"]').click()
    second.wait_for_function('document.querySelector("[data-clock]").textContent === "06:00"',timeout=2500)
    assert second.locator('.top-nav [data-page="result"]').is_enabled()
    assert second.locator('[data-action="unlock"][data-page="result"]').is_visible()
    # At end playback is stopped and replay mode stays selectable.
    if factor!=4:second.locator('[data-action="speed"]').click()
  assert not second_errors, second_errors
  second.close()
  print('PASS #4: 1×/2×/4× natural terminal frames; mobile setup')
  assert not errors,errors
  print('PAGE ERRORS:',errors)
  browser.close()
