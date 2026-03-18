// =============================================
// 🚀 background.js —— Service Worker
// 唯一真正能绕过 CORS 的地方（不在页面上下文）
// =============================================
console.log('🚀 [background] Service Worker 已启动');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== 'wmFetchImage') return false;

    const url = message.url;
    console.log(`📥 [background] 收到 fetch 请求: ${url.substring(0, 80)}...`);

    fetch(url, {
        credentials: 'include',
        redirect: 'follow'
    })
    .then(res => {
        console.log(`📡 [background] 响应 status=${res.status}, url=${res.url.substring(0, 80)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
    })
    .then(blob => {
        console.log(`📦 [background] blob 大小: ${(blob.size/1024).toFixed(1)}KB, type: ${blob.type}`);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('FileReader 失败'));
            reader.readAsDataURL(blob);
        });
    })
    .then(dataUrl => {
        console.log(`✅ [background] base64 完成，长度: ${dataUrl.length}，回传`);
        sendResponse({ ok: true, dataUrl });
    })
    .catch(err => {
        console.error(`❌ [background] fetch 失败: ${err.message}`);
        sendResponse({ ok: false, error: err.message });
    });

    return true; // 保持 sendResponse 异步有效
});
