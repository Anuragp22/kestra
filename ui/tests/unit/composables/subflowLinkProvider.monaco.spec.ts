import {describe, expect, it} from "vitest"

;(globalThis as any).MonacoEnvironment = {
    getWorker: () => ({postMessage(){}, terminate(){}, addEventListener(){}, removeEventListener(){}}),
}

import * as monaco from "monaco-editor/esm/vs/editor/editor.api"
import {
    buildSubflowLinks,
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

describe("subflow link Uri round-trip", () => {
    it("survives a direct Uri read", () => {
        const target = {namespace: "company.team", flowId: "child_flow"}
        const uri = monaco.Uri.from({scheme: SUBFLOW_LINK_SCHEME, path: "/open", query: encodeSubflowTarget(target)})
        expect(decodeSubflowTarget(uri.query)).toEqual(target)
    })

    it("survives a string serialize + reparse (worst case Monaco opener path)", () => {
        const target = {namespace: "company.team", flowId: "child_flow"}
        const uri = monaco.Uri.from({scheme: SUBFLOW_LINK_SCHEME, path: "/open", query: encodeSubflowTarget(target)})
        const reparsed = monaco.Uri.parse(uri.toString())
        expect(decodeSubflowTarget(reparsed.query)).toEqual(target)
    })

    it("survives special characters in the target", () => {
        const target = {namespace: "a.b-c", flowId: "child flow & x?y=z"}
        const uri = monaco.Uri.from({scheme: SUBFLOW_LINK_SCHEME, path: "/open", query: encodeSubflowTarget(target)})
        const reparsed = monaco.Uri.parse(uri.toString())
        expect(decodeSubflowTarget(reparsed.query)).toEqual(target)
    })
})

describe("buildSubflowLinks against a real Monaco model", () => {
    it("maps ranges to the real namespace and flowId values", () => {
        const model = monaco.editor.createModel(
            SUBFLOW_SOURCE,
            "yaml",
            monaco.Uri.parse("inmemory://model/flow-Flow.yaml"),
        )
        try {
            const links = buildSubflowLinks(model)
            expect(links).toHaveLength(2)

            const values = links.map((link) =>
                model.getValueInRange(new monaco.Range(
                    link.range.startLineNumber,
                    link.range.startColumn,
                    link.range.endLineNumber,
                    link.range.endColumn,
                )),
            )
            expect(values).toContain("other.namespace")
            expect(values).toContain("child_flow")
        } finally {
            model.dispose()
        }
    })
})
