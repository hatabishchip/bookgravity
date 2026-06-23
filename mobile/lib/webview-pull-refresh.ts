// Pull-to-refresh for the embedded web surfaces (admin panel, trainer inbox).
//
// react-native-webview's native `pullToRefreshEnabled` is unreliable on
// Android (it frequently never shows the spinner, especially when the web
// page owns its own scroll container). So instead we inject a small script
// that implements the gesture INSIDE the page: when the user drags down while
// the active scroll area is at the top, the content rubber-bands down, a
// circular spinner slides in from the top, and crossing the threshold reloads
// the page. Identical behaviour on Android and iOS, like a native list.
//
// Injected via the WebView `injectedJavaScript` prop. The trailing `true;` is
// required by react-native-webview so it doesn't warn about the return value.

export const PULL_TO_REFRESH_JS = `
(function(){
  if (window.__gsPTR) return; window.__gsPTR = true;
  var THRESH = 64, MAX = 120, startY = 0, pull = 0, active = false, target = null, busy = false;

  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;display:flex;justify-content:center;pointer-events:none;z-index:2147483647;transform:translateY(-50px);opacity:0;';
  var sp = document.createElement('div');
  sp.style.cssText = 'margin-top:12px;width:30px;height:30px;border-radius:50%;border:3px solid rgba(130,130,130,0.35);border-top-color:#2C6E49;box-sizing:border-box;';
  bar.appendChild(sp);
  function mount(){ if (document.body && !bar.parentNode) document.body.appendChild(bar); }
  mount(); document.addEventListener('DOMContentLoaded', mount);

  function scrollable(el){
    while (el && el !== document.body && el !== document.documentElement){
      var s = window.getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function atTop(el){
    if (el === document.scrollingElement || el === document.documentElement || el === document.body)
      return (window.pageYOffset || 0) <= 0;
    return el.scrollTop <= 0;
  }
  function setT(on){
    var t = on ? 'transform .25s ease, opacity .25s ease' : 'none';
    bar.style.transition = t; document.body.style.transition = on ? 'transform .25s ease' : 'none';
  }
  function render(p){
    document.body.style.transform = 'translateY(' + p + 'px)';
    bar.style.transform = 'translateY(' + Math.min(p - 44, 12) + 'px)';
    bar.style.opacity = Math.min(p / THRESH, 1);
    sp.style.transform = 'rotate(' + (p * 4) + 'deg)';
  }
  function snapBack(){ setT(true); document.body.style.transform=''; bar.style.transform='translateY(-50px)'; bar.style.opacity='0'; }
  function refresh(){
    busy = true; setT(true);
    document.body.style.transform = 'translateY(52px)';
    bar.style.transform = 'translateY(12px)'; bar.style.opacity = '1';
    var d = 0, iv = setInterval(function(){ d = (d + 30) % 360; sp.style.transform = 'rotate(' + d + 'deg)'; }, 40);
    setTimeout(function(){ clearInterval(iv); window.location.reload(); }, 550);
  }

  window.addEventListener('touchstart', function(e){
    if (busy || e.touches.length !== 1) return;
    target = scrollable(e.target);
    if (atTop(target)) { startY = e.touches[0].clientY; active = true; pull = 0; setT(false); }
    else active = false;
  }, { passive: true, capture: true });

  window.addEventListener('touchmove', function(e){
    if (!active || busy) return;
    var dy = e.touches[0].clientY - startY;
    if (dy <= 0 || !atTop(target)) { if (pull > 0) { render(0); pull = 0; } active = false; return; }
    pull = Math.min(dy * 0.5, MAX);
    if (pull > 4 && e.cancelable) e.preventDefault();
    render(pull);
  }, { passive: false, capture: true });

  window.addEventListener('touchend', function(){
    if (!active || busy) return; active = false;
    if (pull >= THRESH) refresh(); else snapBack();
  }, { passive: true, capture: true });
})();
true;
`
