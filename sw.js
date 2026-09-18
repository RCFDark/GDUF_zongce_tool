/* ============================================================================
 * sw.js —— 为页面注入 COOP / COEP 响应头，使其进入 crossOriginIsolated 状态。
 * onnxruntime-web 只有在这种状态下才能启用多线程 WASM（约 2~3 倍提速）。
 *
 * 采用 COEP: credentialless —— 比 require-corp 宽松：跨域的无 CORS 资源
 * （图片、脚本等）无需带 CORP 头也能加载，避免把页面其它功能一起卡住。
 * ==========================================================================*/

var COEP_CREDENTIALLESS = true;

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('message', function (ev) {
  if (ev.data && ev.data.type === 'coepCredentialless') {
    COEP_CREDENTIALLESS = !!ev.data.value;
  }
});

self.addEventListener('fetch', function (event) {
  var r = event.request;

  // 缓存探测类请求不要拦截（会抛错）
  if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;

  var request = (COEP_CREDENTIALLESS && r.mode === 'no-cors')
    ? new Request(r, { credentials: 'omit' })
    : r;

  event.respondWith(
    fetch(request).then(function (response) {
      if (response.status === 0) return response;          // opaque，原样返回
      var h = new Headers(response.headers);
      h.set('Cross-Origin-Embedder-Policy', COEP_CREDENTIALLESS ? 'credentialless' : 'require-corp');
      h.set('Cross-Origin-Opener-Policy', 'same-origin');
      if (!COEP_CREDENTIALLESS) h.set('Cross-Origin-Resource-Policy', 'cross-origin');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: h
      });
    }).catch(function (e) { console.error('[sw] fetch failed:', e); })
  );
});
