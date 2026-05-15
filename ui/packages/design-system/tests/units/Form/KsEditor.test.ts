import {describe, test, expect} from "vitest"
import {isOffsetInPebbleBlock} from "../../../src/utils/pebbleBlock"
import {findDuplicateTaskIds} from "../../../src/utils/yamlValidation"

describe("KsEditor / pebbleBlock", () => {
    test("returns false for offset < 2", () => {
        expect(isOffsetInPebbleBlock("{{ x }}", 0)).toBe(false)
        expect(isOffsetInPebbleBlock("{{ x }}", 1)).toBe(false)
    })

    test("detects offset inside {{ ... }}", () => {
        const text = "name = {{ flow.id }}"
        // index of "flow" letter "f"
        const offset = text.indexOf("flow")
        expect(isOffsetInPebbleBlock(text, offset)).toBe(true)
    })

    test("offset before first {{ is not inside a block", () => {
        const text = "abc = {{ flow.id }}"
        expect(isOffsetInPebbleBlock(text, 2)).toBe(false)
    })

    test("offset after }} is not inside a block", () => {
        const text = "{{ a }} after"
        expect(isOffsetInPebbleBlock(text, text.length - 2)).toBe(false)
    })

    test("text with no pebble at all", () => {
        expect(isOffsetInPebbleBlock("no braces here", 5)).toBe(false)
    })
})

describe("KsEditor / findDuplicateTaskIds", () => {
    test("returns empty array for valid flow without duplicates", () => {
        const yaml = `
id: my-flow
namespace: company.team
tasks:
  - id: t1
    type: io.kestra.plugin.core.log.Log
  - id: t2
    type: io.kestra.plugin.core.log.Log
`
        expect(findDuplicateTaskIds(yaml)).toEqual([])
    })

    test("detects a single duplicate task id", () => {
        const yaml = `
id: my-flow
namespace: company.team
tasks:
  - id: same
    type: io.kestra.plugin.core.log.Log
  - id: same
    type: io.kestra.plugin.core.log.Log
`
        const markers = findDuplicateTaskIds(yaml)
        expect(markers.length).toBe(1)
        expect(markers[0].taskId).toBe("same")
        expect(markers[0].severity).toBe("error")
        expect(markers[0].message).toContain("same")
    })

    test("detects duplicates inside nested tasks/errors", () => {
        const yaml = `
id: my-flow
tasks:
  - id: outer
    type: io.kestra.plugin.core.flow.Sequential
    tasks:
      - id: dup
        type: io.kestra.plugin.core.log.Log
errors:
  - id: dup
    type: io.kestra.plugin.core.log.Log
`
        const markers = findDuplicateTaskIds(yaml)
        const ids = markers.map(m => m.taskId)
        expect(ids).toContain("dup")
    })

    test("handles invalid yaml without throwing", () => {
        const yaml = ":::: not yaml ::::"
        expect(() => findDuplicateTaskIds(yaml)).not.toThrow()
    })
})
