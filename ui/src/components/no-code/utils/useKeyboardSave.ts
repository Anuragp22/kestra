import {onActivated, onDeactivated} from "vue"
import {useFlowStore} from "../../../stores/flow"
import {saveDefaultActions, storageKeys} from "../../../utils/constants"

export function useKeyboardSave() {
    const flowStore = useFlowStore()
    const handleKeyboardSave = (e: KeyboardEvent) => {
        if (e.type === "keydown" && e.key === "s" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            // Ctrl+S follows the user's default save action preference (Save vs Save as draft),
            // matching what the split-button dropdown shows.
            const draft = localStorage.getItem(storageKeys.SAVE_DEFAULT_ACTION) === saveDefaultActions.SAVE_AS_DRAFT
            flowStore.save(draft)
        }
    }

    onActivated(() => {
        document.addEventListener("keydown", handleKeyboardSave)
    })


    onDeactivated(() => {
        document.removeEventListener("keydown", handleKeyboardSave)
    })
}