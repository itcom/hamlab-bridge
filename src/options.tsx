import { useEffect, useState } from "react"
import { Storage } from "@plasmohq/storage"

const storage = new Storage()

/**
 * Options page for HAMLAB Bridge
 * 
 * This page allows the user to configure whether to show a confirmation dialog before submitting the ADIF data to HAMLAB.
 * 
 * The confirmation dialog is shown by default. If the user sets the switch to OFF, the dialog will not be shown and the data will be submitted automatically.
 */
export default function Options() {
    const [showConfirm, setShowConfirm] = useState(true)
    const [remarks1Text, setRemarks1Text] = useState("")
    const [rigName, setRigName] = useState("")
    const [antName, setAntName] = useState("")
    const [antHeight, setAntHeight] = useState("")


    useEffect(() => {
        storage.get<boolean>("showConfirm").then((v) => { setShowConfirm(v ?? true) })
        storage.get<string>("remarks1Text").then(v => { setRemarks1Text(v ?? "") })
        storage.get<string>("rigName").then(v => setRigName(v ?? ""))
        storage.get<string>("antName").then(v => setAntName(v ?? ""))
        storage.get<string>("antHeight").then(v => setAntHeight(v ?? ""))
    }, [])

    /**
     * Handles changes to the "Show confirmation dialog" switch.
     * Updates the local storage with the new value and updates the component state.
     * @param {boolean} v - New value of the switch
     */
    const onChange = async (v: boolean) => {
        setShowConfirm(v)
        await storage.set("showConfirm", v)
    }

    return (
        <div style={{ padding: 20 }}>
            <h2>HAMLAB Bridge 設定</h2>

            <label>
                <input
                    type="checkbox"
                    checked={showConfirm}
                    onChange={e => {
                        setShowConfirm(e.target.checked)
                        storage.set("showConfirm", e.target.checked)
                    }}
                />
                登録前に確認ダイアログを表示する
            </label>

            <hr />

            <label>
                Remarks1 固定文言
                <br />
                <input
                    type="text"
                    style={{ width: "100%" }}
                    value={remarks1Text}
                    onChange={e => {
                        setRemarks1Text(e.target.value)
                        storage.set("remarks1Text", e.target.value)
                    }}
                    placeholder="例: FT8 / HAMLAB Bridge"
                />
            </label>

            <hr />

            <h3>設備情報（自動入力）</h3>

            <label>
                無線機
                <input
                    type="text"
                    style={{ width: "100%" }}
                    value={rigName}
                    onChange={e => {
                        setRigName(e.target.value)
                        storage.set("rigName", e.target.value)
                    }}
                    placeholder="例: IC-7300"
                />
            </label>

            <br /><br />

            <label>
                アンテナ
                <input
                    type="text"
                    style={{ width: "100%" }}
                    value={antName}
                    onChange={e => {
                        setAntName(e.target.value)
                        storage.set("antName", e.target.value)
                    }}
                    placeholder="例: ZS6BKW"
                />
            </label>

            <br /><br />

            <label>
                地上高（m）
                <input
                    type="text"
                    style={{ width: "100%" }}
                    value={antHeight}
                    onChange={e => {
                        setAntHeight(e.target.value)
                        storage.set("antHeight", e.target.value)
                    }}
                    placeholder="例: 10"
                />
            </label>

        </div>
    )
}
