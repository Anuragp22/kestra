import {beforeEach, describe, expect, it} from "vitest";
import {createPinia, setActivePinia} from "pinia";
import * as YAML_UTILS from "@kestra-io/ui-libs/flow-yaml-utils";
import {parseDocument as parseYamlDocument, Pair as YamlPair, Scalar as YamlScalar} from "yaml";

// Mirror the inline YAML helper used by the flow store (see applyDraftFlag in flow.ts).
function applyDraftFlag(source: string, draft: boolean): string {
    const doc = parseYamlDocument(source) as any;
    if (!doc?.contents?.items) {
        return source;
    }
    const existing = doc.contents.items.find(
        (item: any) => (item.key?.value ?? item.key) === "draft"
    );
    if (existing) {
        existing.value = draft;
    } else {
        doc.contents.items.push(new YamlPair(new YamlScalar("draft"), draft));
    }
    return doc.toString();
}

describe("flow draft save", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("exposes a saveAsDraft action on the flow store", async () => {
        const {useFlowStore} = await import("../../../src/stores/flow");
        const store = useFlowStore();
        expect(typeof store.saveAsDraft).toBe("function");
    });

    it("toggles the draft field both ways while preserving the rest of the flow", () => {
        const yaml = `id: my-flow
namespace: io.kestra.tests
tasks:
  - id: log
    type: io.kestra.plugin.core.log.Log
    message: hello
`;

        const drafted = applyDraftFlag(yaml, true);
        expect(YAML_UTILS.parse(drafted).draft).toBe(true);
        expect(YAML_UTILS.parse(drafted).id).toBe("my-flow");

        const published = applyDraftFlag(drafted, false);
        expect(YAML_UTILS.parse(published).draft).toBe(false);
        expect(YAML_UTILS.parse(published).tasks).toHaveLength(1);
    });
});
