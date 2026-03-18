// =============================================
// 🌉 content_bridge.js —— isolated world 中转桥
// 负责在 MAIN world (inject.js) 和 background.js 之间传递消息
// =============================================
console.log('🌉 [bridge] content_bridge.js 已加载');

window.addEventListener('__wm_fetch_request__', (e) => {
    const { id, url } = e.detail;
    console.log(`📨 [bridge] 收到来自 inject.js 的请求 id=${id}, url=${url.substring(0, 80)}...`);

    // 转发给 background service worker（它能真正绕过 CORS）
    chrome.runtime.sendMessage({ type: 'wmFetchImage', url }, (response) => {
        if (chrome.runtime.lastError) {
            const err = chrome.runtime.lastError.message;
            console.error(`❌ [bridge] sendMessage 失败: ${err}`);
            window.dispatchEvent(new CustomEvent('__wm_fetch_response__', {
                detail: { id, error: err }
            }));
            return;
        }

        if (!response || !response.ok) {
            const err = (response && response.error) || '未知错误';
            console.error(`❌ [bridge] background 返回失败: ${err}`);
            window.dispatchEvent(new CustomEvent('__wm_fetch_response__', {
                detail: { id, error: err }
            }));
            return;
        }

        console.log(`✅ [bridge] 收到 background 的 base64，回传 inject.js`);
        window.dispatchEvent(new CustomEvent('__wm_fetch_response__', {
            detail: { id, dataUrl: response.dataUrl }
        }));
    });
});
