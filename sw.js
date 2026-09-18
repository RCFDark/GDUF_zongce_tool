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

  /* 关键：只处理「导航请求」（即 HTML 文档本身）。
   *
   * 跨源隔离只要求**文档响应**带 COOP/COEP；子资源（脚本、wasm、模型、图片）由浏览器
   * 按文档上的 COEP 原生校验，无需 SW 插手。若 SW 拦截所有请求并重建 Response，会踩到
   * 一个致命坑：SW 里 fetch() 拿到的 response.body 已是**解压后的明文**，但复制过来的
   * 响应头仍带 Content-Encoding: gzip/br —— 浏览器再解一次 → 内容损坏 →
   * 脚本报 "Uncaught SyntaxError: Unexpected end of input"，
   * pdf.js 的 Worker 因此起不来，退化成 fake worker 并抛
   * "Cannot read properties of undefined (reading 'WorkerMessageHandler')"。
   *
   * 因此这里对非导航请求直接放行（不调用 respondWith），让浏览器走原生流程。 */
  if (r.mode !== 'navigate') return;

  event.respondWith(
    fetch(r).then(function (response) {
      if (response.status === 0) return response;          // opaque，原样返回
      var h = new Headers(response.headers);
      // 防御：重建 Response 时 body 已被 SW 解压，必须去掉编码相关头，避免二次解码
      h.delete('Content-Encoding');
      h.delete('Content-Length');
      h.set('Cross-Origin-Embedder-Policy', COEP_CREDENTIALLESS ? 'credentialless' : 'require-corp');
      h.set('Cross-Origin-Opener-Policy', 'same-origin');
      if (!COEP_CREDENTIALLESS) h.set('Cross-Origin-Resource-Policy', 'cross-origin');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: h
      });
    }).catch(function () { /* 失败则不干预，交给浏览器默认处理 */ })
  );
});
