let ws: WebSocket | null = null

/**
 * Establishes a WebSocket connection to the local HAMLAB Bridge server.
 * Listens for incoming messages and forwards them to all tabs.
 * If the connection is closed, re-establish it after a 1 second delay.
 */
function connect() {
    ws = new WebSocket("ws://127.0.0.1:17800/ws")

    ws.onmessage = (e) => {
        let payload: any

        try {
            payload = JSON.parse(e.data)
        } catch {
            // 従来互換（生ADIF）
            payload = { adif: e.data }
        }

        chrome.tabs.query({ url: "https://hamlab.jp/*" }, (tabs) => {
            tabs.forEach((tab) => {
                if (!tab.id) return
                chrome.tabs.sendMessage(tab.id, payload, () => {
                    // content script が無いのは正常
                    if (chrome.runtime.lastError) {
                        // 何もしない（ログも出さない）
                    }
                })
            })
        })
    }


    ws.onclose = () => setTimeout(connect, 1000)
}

connect()

// Content script からのメッセージを受信
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === "openOptions") {
        chrome.runtime.openOptionsPage()
    } else if (message.type === "getRigState" && ws && ws.readyState === WebSocket.OPEN) {
        // リグ情報取得リクエスト
        const request = message.port !== undefined 
            ? { type: "getRigState", port: message.port }
            : { type: "getRigState" }
        ws.send(JSON.stringify(request))
    }
})
