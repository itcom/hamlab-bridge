import { Storage } from "@plasmohq/storage"
import type { PlasmoCSConfig } from "plasmo"

const storage = new Storage()

// 現在選択されているポート番号（0-4）
let currentSelectedPort: number | null = null

export const config: PlasmoCSConfig = {
    matches: ["https://hamlab.jp/*"]
}

// ページ読み込み時にUIを追加
window.addEventListener("load", () => {
    createToolbar()
    // 接続されているリグ数を取得
    chrome.runtime.sendMessage({ type: "getRigState" })
})

/**
 * background.ts から受信するメッセージの想定型
 */
type BridgeMessage =
    | string
    | {
        type?: "adif"
        adif?: string
        geo?: {
            jcc?: string
        }
        qrz?: {
            qth?: string
            grid?: string
            operator?: string
        }
    }
    | {
        type: "rig"
        data: boolean
        freq: number
        mode: string
        rig: string
        port: number
    }
    | {
        type: "rigState"
        port: number
        freq: number
        mode: string
    }
    | {
        type: "rigStates"
        states: Record<string, {
            data: boolean
            freq: number
            port: number
            mode: string
            proto: string
        }>
    }

chrome.runtime.onMessage.addListener((msg: BridgeMessage) => {

    // rigStatesタイプのメッセージ処理（接続されているリグ情報を取得）
    if (typeof msg !== "string" && msg.type === "rigStates") {
        // states全体を渡す
        updateRigButtons(msg.states)
        return
    }

    // rigStateタイプのメッセージ処理（リグ選択ボタンからの応答）
    if (typeof msg !== "string" && msg.type === "rigState") {
        // 選択されたポートを記録
        currentSelectedPort = msg.port
        updateRigButtonColors()
        
        const freqMHz = (msg.freq / 1000000).toFixed(3)
        set("#frequency", freqMHz)
        const mappedMode = mapMode(msg.mode)
        if (mappedMode) {
            set("#mode", mappedMode)
        }
        return
    }

    // rigタイプのメッセージ処理（ブロードキャスト）
    if (typeof msg !== "string" && msg.type === "rig") {
        // portから選択状態を更新
        currentSelectedPort = msg.port
        updateRigButtonColors()
        
        // 自動反映設定をチェック
        storage.get<boolean>("autoRigUpdate").then((enabled) => {
            if (enabled === false) return // 無効の場合は何もしない
            
            // Hz → MHz変換
            const freqMHz = (msg.freq / 1000000).toFixed(3)
            set("#frequency", freqMHz)
            // モード変換
            const mappedMode = mapMode(msg.mode)
            if (mappedMode) {
                set("#mode", mappedMode)
            }
        })
        return
    }

    const adif = typeof msg === "string" ? msg : msg.adif
    if (!adif) return

    const data = parseADIF(adif)

    // フォーム反映（ADIF由来）
    fillHamLab(data)

    // JCC/JCG（geo由来・空のときだけ）
    if (typeof msg !== "string" && msg.geo?.jcc) {
        setIfEmpty("#js-code", msg.geo.jcc)
    }

    // ③ QTH 補完（QRZ・空のときだけ）
    if (typeof msg !== "string" && msg.qrz?.qth) {
        setIfEmpty("#qth", msg.qrz.qth)
    }

    // ④ Grid 高精度化（先頭一致時のみ差し替え）
    if (typeof msg !== "string" && msg.qrz?.grid) {
        const el = document.querySelector<HTMLInputElement>("#gl")
        if (el && el.value && msg.qrz.grid.startsWith(el.value)) {
            el.value = msg.qrz.grid
            el.dispatchEvent(new Event("change", { bubbles: true }))
        }
    }

    // QRZ NAME → operator（空のときだけ）
    if (typeof msg !== "string" && msg.qrz?.operator) {
        setIfEmpty("#operator", msg.qrz.operator)
    }


    handleSubmit(data)
})

/* -------------------------
 * Mode mapping
 * ------------------------- */

const MODE_MAP: Record<string, string> = {
    "FM": "FM",
    "FM-N": "FM",
    "WFM": "FM",
    "AM": "AM",
    "AM-N": "AM",
    "SSB": "SSB",
    "USB": "SSB",
    "LSB": "SSB",
    "CW": "CW",
    "CW-R": "CW",
    "CW-U": "CW",
    "RTTY": "RTTY",
    "RTTY-R": "RTTY",
    "RTTY-LSB": "RTTY",
    "RTTY-USB": "RTTY",
    "FT8": "FT8",
    "FT4": "FT4",
    "DV": "DV",
    "D-STAR (DV)": "D-STAR (DV)",
    "D-STAR (DR)": "D-STAR (DR)",
    "C4FM": "C4FM",
    "WIRES-X": "WIRES-X",
}

function mapMode(mode: string): string | undefined {
    return MODE_MAP[mode]
}

/* -------------------------
 * ADIF utilities
 * ------------------------- */

function parseADIF(adif: string) {
    const obj: Record<string, string> = {}
    adif.replace(/<([^:]+):\d+>([^<]+)/g, (_: string, k: string, v: string) => {
        obj[k.toLowerCase()] = v.trim()
        return ""
    })
    return obj
}

function adifDate(d?: string) {
    if (!d || d.length !== 8) return ""
    return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
}

function adifTime(t?: string) {
    if (!t || t.length < 4) return ""
    return `${t.slice(0, 2)}:${t.slice(2, 4)}`
}

/* -------------------------
 * Form fill
 * ------------------------- */

async function fillHamLab(data: Record<string, string>) {
    set("#callsign", data.call)
    set("#day", adifDate(data.qso_date))
    set("#time", adifTime(data.time_on))
    set("#frequency", data.freq)
    set("#bureau", data.rst_rcvd)
    set("#bureau_2", data.rst_sent)
    set("#mode", data.mode)
    set("#gl", data.gridsquare)
    set("#qth", data.qth)
    set("#remarks2", data.comment)
    set("#operator", data.name)
    set("#rig-val", data.tx_pwr)
    set("#time_zone", "U")

    // Options（固定値）
    const remarks1 = await storage.get<string>("remarks1Text")
    const rigName = await storage.get<string>("rigName")
    const antName = await storage.get<string>("antName")
    const antHeight = await storage.get<string>("antHeight")

    if (remarks1) set("#remarks1", remarks1)
    if (rigName) set("#rig-name", rigName)
    if (antName) set("#ant-name", antName)
    if (antHeight) set("#ant-val", antHeight)
}

/* -------------------------
 * DOM helpers
 * ------------------------- */

function set(sel: string, val?: string) {
    if (!val) return
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(sel)
    if (!el) return
    el.value = val
    el.dispatchEvent(new Event("change", { bubbles: true }))
}

function setIfEmpty(sel: string, val?: string) {
    if (!val) return
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(sel)
    if (!el || el.value) return
    el.value = val
    el.dispatchEvent(new Event("change", { bubbles: true }))
}

/* -------------------------
 * Submit flow
 * ------------------------- */

async function handleSubmit(data: Record<string, string>) {
    const showConfirm = (await storage.get<boolean>("showConfirm")) ?? true
    if (showConfirm) {
        showConfirmDialog(data, submitWithDelay)
    } else {
        submitWithDelay()
    }
}

function wait(ms = 300) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function submitWithDelay() {
    await wait(300)
    document.querySelector<HTMLButtonElement>("#submit-regist")?.click()
}

function showConfirmDialog(
    data: Record<string, string>,
    onOk: () => void
) {
    const box = document.createElement("div")
    box.style.cssText = `
    position:fixed; top:20px; right:20px; z-index:99999;
    background:#111; color:#fff; padding:12px;
    border-radius:8px; font-size:13px;
  `
    box.innerHTML = `
    <b>HAMLABに送信しますか？</b><br>
    ${data.call} / ${data.band} / ${data.mode} / ${data.rst_sent}<br><br>
    <button id="ok">送信</button>
    <button id="ng">キャンセル</button>
  `
    document.body.appendChild(box)

    box.querySelector<HTMLButtonElement>("#ok")?.addEventListener("click", () => {
        box.remove()
        onOk()
    })
    box.querySelector<HTMLButtonElement>("#ng")?.addEventListener("click", () => {
        box.remove()
    })
}

/* -------------------------
 * Toolbar UI
 * ------------------------- */

function createToolbar() {
    // URLに応じて初期状態を設定
    // /admin/index.php で、かつ #anc_1 ではない場合のみ展開
    const isAdminPage = window.location.pathname.includes("/admin/index.php") 
                        && window.location.hash !== "#anc_1"
    let isCollapsed = !isAdminPage

    const toolbar = document.createElement("div")
    toolbar.id = "hamlab-bridge-toolbar"
    toolbar.style.cssText = `
        position: fixed;
        top: 1px;
        left: 1px;
        z-index: 10000;
        background: rgb(255, 255, 255, 0.2);
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        display: flex;
        gap: 8px;
        align-items: center;
    `

    // 折りたたみボタン
    const toggleBtn = createButton(isCollapsed ? "◀" : "▶", "50px", () => {
        isCollapsed = !isCollapsed
        if (isCollapsed) {
            content.style.display = "none"
            toggleBtn.textContent = "▶"
            // IFRAMEも隠す
            const iframe = document.getElementById("hamlab-bridge-udp-iframe")
            if (iframe) {
                iframe.style.display = "none"
            }
        } else {
            content.style.display = "flex"
            toggleBtn.textContent = "◀"
            // IFRAMEがあれば再表示
            const iframe = document.getElementById("hamlab-bridge-udp-iframe")
            if (iframe) {
                iframe.style.display = "block"
            }
        }
    })
    toggleBtn.style.padding = "3px 6px"
    toggleBtn.style.fontSize = "10px"

    // コンテンツコンテナ
    const content = document.createElement("div")
    content.style.cssText = `
        display: ${isCollapsed ? "none" : "flex"};
        gap: 8px;
        align-items: center;
        flex: 1;
    `

    // リグ選択ボタンコンテナ（左側）
    const rigContainer = document.createElement("div")
    rigContainer.id = "hamlab-bridge-rig-container"
    rigContainer.style.cssText = `
        display: flex;
        gap: 4px;
        flex: 1;
    `

    // 設定ボタンコンテナ（右側、2段）
    const settingsContainer = document.createElement("div")
    settingsContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 2px;
    `

    // 設定ボタン
    const settingsBtn = createButton("⚙️", "", () => {
        chrome.runtime.sendMessage({ type: "openOptions" })
    })
    settingsBtn.title = "設定"
    settingsBtn.style.fontSize = "10px"
    settingsBtn.style.padding = "3px 6px"

    // UDP Bridge設定ボタン
    const udpBridgeBtn = createButton("🌐", "", () => {
        toggleUdpBridgeIframe()
    })
    udpBridgeBtn.title = "UDP Bridge"
    udpBridgeBtn.style.fontSize = "10px"
    udpBridgeBtn.style.padding = "3px 6px"

    settingsContainer.appendChild(settingsBtn)
    settingsContainer.appendChild(udpBridgeBtn)

    content.appendChild(rigContainer)
    content.appendChild(settingsContainer)

    toolbar.appendChild(toggleBtn)
    toolbar.appendChild(content)
    document.body.appendChild(toolbar)
}

function createButton(text: string, height: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button")
    btn.textContent = text
    btn.style.cssText = `
        padding: 6px 12px;
        border: 1px solid #ccc;
        border-radius: 3px;
        background: rgb(248, 248, 248,0.5);
        cursor: pointer;
        font-size: 12px;
        color: #000;
        font-weight: bold;
        text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 2px #fff;
    `
    if (height) {
        btn.style.height = height
    }
    btn.addEventListener("click", onClick)
    btn.addEventListener("mouseover", () => {
        const rigPort = parseInt(btn.dataset.rigPort || "-1", 10)
        if (rigPort >= 0 && rigPort === currentSelectedPort) {
            return
        }
        btn.style.background = "#e8e8e8"
        btn.style.color = "#000"
        btn.style.textShadow = "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 2px #fff"
    })
    btn.addEventListener("mouseout", () => {
        const rigPort = parseInt(btn.dataset.rigPort || "-1", 10)
        if (rigPort >= 0 && rigPort === currentSelectedPort) {
            btn.style.background = "rgb(100 180 255)"
            btn.style.color = "#fff"
            btn.style.borderColor = "rgb(180 210 255)"
            btn.style.textShadow = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 3px #000"
        } else {
            btn.style.background = "rgb(248, 248, 248,0.5)"
            btn.style.color = "#000"
            btn.style.textShadow = "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 2px #fff"
        }
    })
    return btn
}

function toggleUdpBridgeIframe() {
    let iframe = document.getElementById("hamlab-bridge-udp-iframe") as HTMLIFrameElement
    if (iframe) {
        iframe.remove()
        return
    }

    iframe = document.createElement("iframe")
    iframe.id = "hamlab-bridge-udp-iframe"
    iframe.src = "http://127.0.0.1:17801/settings" // UDP BridgeのデフォルトURL
    iframe.style.cssText = `
        position: fixed;
        top: 120px;
        right: 1px;
        width: 500px;
        height: 70%;
        border: 1px solid #ccc;
        border-radius: 4px;
        z-index: 9999;
        background: #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `
    document.body.appendChild(iframe)
}

async function updateRigButtons(states: Record<string, {
    data: boolean
    freq: number
    port: number
    mode: string
    proto: string
}>) {
    const rigContainer = document.getElementById("hamlab-bridge-rig-container")
    if (!rigContainer) return

    // 既存のボタンをクリア
    rigContainer.innerHTML = ""

    // 設定から各リグの名前を読み込む
    const rigNames = await Promise.all([
        storage.get<string>("rig1Name"),
        storage.get<string>("rig2Name"),
        storage.get<string>("rig3Name"),
        storage.get<string>("rig4Name"),
        storage.get<string>("rig5Name")
    ])

    // statesから実際に接続されているポートを取得してボタンを作成
    for (const [key, state] of Object.entries(states)) {
        const port = state.port
        const customName = rigNames[port]
        const label = customName || `Rig ${port + 1}`
        
        const rigBtn = createButton(label, "50px", () => {
            selectRig(port)
        })
        rigBtn.style.fontSize = "11px"
        rigBtn.style.padding = "3px 6px"
        rigBtn.style.fontWeight = "bold"
        rigBtn.dataset.rigPort = port.toString() // ポート番号をdata属性に保存
        
        // 現在選択中のポートなら色を変える
        if (currentSelectedPort === port) {
            rigBtn.style.background = "rgb(100 180 255)"
            rigBtn.style.color = "#fff"
            rigBtn.style.fontWeight = "bold"
            rigBtn.style.borderColor = "rgb(180 210 255)"
            rigBtn.style.textShadow = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 3px #000"
        } else {
            // 非選択状態でもtext-shadowを設定
            rigBtn.style.textShadow = "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 2px #fff"
        }
        
        rigContainer.appendChild(rigBtn)
    }
}

function updateRigButtonColors() {
    const rigContainer = document.getElementById("hamlab-bridge-rig-container")
    if (!rigContainer) return

    // すべてのリグボタンを取得して色を更新
    const buttons = rigContainer.querySelectorAll<HTMLButtonElement>("button")
    buttons.forEach((btn) => {
        const rigPort = parseInt(btn.dataset.rigPort || "-1", 10)
        if (rigPort === currentSelectedPort) {
            // 選択中のボタン
            btn.style.background = "rgb(100 180 255)"
            btn.style.color = "#fff"
            btn.style.fontWeight = "bold"
            btn.style.borderColor = "rgb(180 210 255)"
            btn.style.textShadow = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 3px #000"
        } else {
            // 非選択のボタン
            btn.style.background = "rgb(248, 248, 248,0.5)"
            btn.style.color = "#000"
            btn.style.fontWeight = "bold"
            btn.style.borderColor = "#ccc"
            btn.style.textShadow = "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 2px #fff"
        }
    })
}

function selectRig(port: number) {
    chrome.runtime.sendMessage({
        type: "getRigState",
        port: port
    })
}
