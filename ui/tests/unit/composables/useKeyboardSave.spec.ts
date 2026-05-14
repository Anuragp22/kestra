import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {createPinia, setActivePinia} from "pinia"
import {defineComponent, h, KeepAlive} from "vue"
import {mount, VueWrapper} from "@vue/test-utils"
import {saveDefaultActions, storageKeys} from "../../../src/utils/constants"

const saveMock = vi.fn()

vi.mock("../../../src/stores/flow", () => ({
    useFlowStore: () => ({save: saveMock}),
}))

vi.mock("vue-router", () => ({
    useRoute: () => ({query: {}, params: {}}),
    useRouter: () => ({push: vi.fn()}),
}))

async function mountKeyboardSave() {
    const {useKeyboardSave} = await import("../../../src/components/no-code/utils/useKeyboardSave")

    const Inner = defineComponent({
        name: "Inner",
        setup() { useKeyboardSave() },
        template: "<div />",
    })

    // onActivated fires when the component is first mounted inside KeepAlive.
    return mount(
        defineComponent({render: () => h(KeepAlive, null, () => h(Inner))}),
    )
}

function ctrlS() {
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "s", ctrlKey: true, bubbles: true}))
}

describe("useKeyboardSave", () => {
    let wrapper: VueWrapper

    beforeEach(() => {
        localStorage.clear()
        saveMock.mockClear()
        setActivePinia(createPinia())
    })

    afterEach(() => {
        // Unmounting triggers onDeactivated, which removes the document listener.
        wrapper?.unmount()
    })

    it("calls save(false) when no preference is stored — default is plain save, not draft", async () => {
        wrapper = await mountKeyboardSave()
        ctrlS()
        expect(saveMock).toHaveBeenCalledOnce()
        expect(saveMock).toHaveBeenCalledWith(false)
    })

    it("calls save(false) when SAVE preference is stored explicitly", async () => {
        localStorage.setItem(storageKeys.SAVE_DEFAULT_ACTION, saveDefaultActions.SAVE)
        wrapper = await mountKeyboardSave()
        ctrlS()
        expect(saveMock).toHaveBeenCalledOnce()
        expect(saveMock).toHaveBeenCalledWith(false)
    })

    it("calls save(true) when SAVE_AS_DRAFT preference is stored", async () => {
        localStorage.setItem(storageKeys.SAVE_DEFAULT_ACTION, saveDefaultActions.SAVE_AS_DRAFT)
        wrapper = await mountKeyboardSave()
        ctrlS()
        expect(saveMock).toHaveBeenCalledOnce()
        expect(saveMock).toHaveBeenCalledWith(true)
    })
})
