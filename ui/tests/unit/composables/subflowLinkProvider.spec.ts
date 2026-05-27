import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {
    buildSubflowLinks,
    createSubflowLinkOpener,
    decodeSubflowTarget,
    encodeSubflowTarget,
    SUBFLOW_LINK_SCHEME,
} from "../../../src/composables/monaco/languages/subflowLinkProvider"

const SUBFLOW_SOURCE = [
    "id: parent",
    "namespace: company.team",
    "",
    "tasks:",
    "  - id: call_subflow",
    "    type: io.kestra.plugin.core.flow.Subflow",
    "    namespace: other.namespace",
    "    flowId: child_flow",
].join("\n")

/**
 * Minimal Monaco model stub. `getPositionAt` uses a deterministic single-line
 * mapping (column = offset + 1) so range conversion can be asserted.
 */
function fakeModel(path: string, value: string) {
    return {
        uri: {path},
        getValue: () => value,
        getPositionAt: (offset: number) => ({lineNumber: 1, column: offset + 1}),
    }
}

describe("buildSubflowLinks", () => {
    it("returns a Monaco link per subflow value on a flow model", () => {
        const model = fakeModel("inmemory://model/flow-123", SUBFLOW_SOURCE)

        const links = buildSubflowLinks(model)

        expect(links).toHaveLength(2)
        for (const link of links) {
            expect(link.target).toEqual({namespace: "other.namespace", flowId: "child_flow"})
        }

        // Range is derived from the resolver char offsets through getPositionAt.
        const flowIdOffset = SUBFLOW_SOURCE.indexOf("child_flow")
        const flowIdLink = links.find((link) => link.range.startColumn === flowIdOffset + 1)
        expect(flowIdLink).toBeDefined()
        expect(flowIdLink!.range.endColumn).toBe(flowIdOffset + "child_flow".length + 1)
    })

    it("returns no links on a non-flow model", () => {
        const model = fakeModel("inmemory://model/namespace-file.yaml", SUBFLOW_SOURCE)

        expect(buildSubflowLinks(model)).toEqual([])
    })
})

describe("decodeSubflowTarget (link activation trust boundary)", () => {
    it("round-trips a valid target", () => {
        const target = {namespace: "ns", flowId: "f"}
        expect(decodeSubflowTarget(encodeSubflowTarget(target))).toEqual(target)
    })

    it("returns undefined on malformed query", () => {
        expect(decodeSubflowTarget("%%%not-json")).toBeUndefined()
    })

    it("returns undefined on JSON null", () => {
        expect(decodeSubflowTarget(encodeURIComponent("null"))).toBeUndefined()
    })

    it("returns undefined when flowId is missing", () => {
        expect(decodeSubflowTarget(encodeURIComponent(JSON.stringify({namespace: "ns"})))).toBeUndefined()
    })

    it("returns undefined when flowId is not a string", () => {
        expect(decodeSubflowTarget(encodeURIComponent(JSON.stringify({namespace: "ns", flowId: 5})))).toBeUndefined()
    })

    it("keeps only namespace and flowId, dropping extra keys", () => {
        const query = encodeURIComponent(JSON.stringify({namespace: "ns", flowId: "f", evil: 1}))
        expect(decodeSubflowTarget(query)).toEqual({namespace: "ns", flowId: "f"})
    })
})

describe("createSubflowLinkOpener", () => {
    let openSpy: ReturnType<typeof vi.spyOn>

    function fakeRouter() {
        return {
            currentRoute: {value: {params: {tenant: "main"}}},
            resolve: vi.fn(() => ({href: "/resolved"})),
        }
    }

    beforeEach(() => {
        openSpy = vi.spyOn(window, "open").mockImplementation(() => null)
    })

    afterEach(() => {
        openSpy.mockRestore()
    })

    it("ignores foreign schemes without navigating", () => {
        const router = fakeRouter()
        const opener = createSubflowLinkOpener(router as any)

        expect(opener.open({scheme: "https", query: ""})).toBe(false)
        expect(router.resolve).not.toHaveBeenCalled()
        expect(openSpy).not.toHaveBeenCalled()
    })

    it("returns false when the query cannot be decoded", () => {
        const router = fakeRouter()
        const opener = createSubflowLinkOpener(router as any)

        expect(opener.open({scheme: SUBFLOW_LINK_SCHEME, query: "%%%"})).toBe(false)
        expect(openSpy).not.toHaveBeenCalled()
    })

    it("opens the referenced flow on its edit tab in a new browser tab", () => {
        const router = fakeRouter()
        const opener = createSubflowLinkOpener(router as any)
        const query = encodeSubflowTarget({namespace: "ns", flowId: "f"})

        expect(opener.open({scheme: SUBFLOW_LINK_SCHEME, query})).toBe(true)
        expect(router.resolve).toHaveBeenCalledWith({
            name: "flows/update",
            params: {namespace: "ns", id: "f", tab: "edit", tenant: "main"},
        })
        expect(openSpy).toHaveBeenCalledWith("/resolved", "_blank")
    })
})
