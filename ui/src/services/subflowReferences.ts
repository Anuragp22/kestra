import {isScalar, parseDocument, Scalar, visit, type Node, type YAMLMap} from "yaml"

/**
 * Task types that reference another flow through a `namespace` + `flowId` pair.
 * Kept minimal on purpose — extended as new task types require it.
 *
 * Sibling list: `taskTypesWithSubflows` in packages/topology/src/Topology.vue
 * (drives the topology expand button). Keep the two in sync when adding a type.
 */
const SUBFLOW_TASK_TYPES = new Set<string>([
    "io.kestra.plugin.core.flow.Subflow",
    "io.kestra.plugin.core.flow.ForEachItem",
    // Legacy aliases kept for flows written against older Kestra versions.
    "io.kestra.core.tasks.flows.Subflow",
    "io.kestra.core.tasks.flows.ForEachItem",
])

export interface SubflowLink {
    /** Character offset range [start, end] of the clickable value in the source. */
    range: [number, number]
    /** The flow this reference points to. */
    target: {namespace: string; flowId: string}
}

function scalarString(node: unknown): string | undefined {
    return isScalar(node) && typeof node.value === "string" ? node.value : undefined
}

/** A value containing a Pebble expression cannot be resolved to a concrete flow. */
function isTemplated(value: string): boolean {
    return value.includes("{{")
}

function valueRange(node: unknown): [number, number] | undefined {
    if (!isScalar(node) || !node.range) {
        return undefined
    }
    let [start, end] = [node.range[0], node.range[1]]
    // For quoted scalars the node range spans the surrounding quotes; link only the inner value.
    if (node.type === Scalar.QUOTE_DOUBLE || node.type === Scalar.QUOTE_SINGLE) {
        start += 1
        end -= 1
    }
    return [start, end]
}

/**
 * Finds every reference to another flow inside subflow-capable tasks of a flow
 * YAML source, returning the clickable value ranges and the resolved target.
 */
export function resolveSubflowLinks(source: string): SubflowLink[] {
    const links: SubflowLink[] = []

    let document
    try {
        document = parseDocument(source)
    } catch {
        return links
    }
    if (!document?.contents) {
        return links
    }

    visit(document, {
        Map(_key, node: YAMLMap) {
            const type = scalarString(node.get("type", true) as Node)
            if (type === undefined || !SUBFLOW_TASK_TYPES.has(type)) {
                return
            }

            const namespaceNode = node.get("namespace", true) as Node
            const flowIdNode = node.get("flowId", true) as Node
            const namespace = scalarString(namespaceNode)
            const flowId = scalarString(flowIdNode)
            // Skip when either value is missing or empty: there's no flow to navigate to.
            if (!namespace || !flowId) {
                return
            }
            if (isTemplated(namespace) || isTemplated(flowId)) {
                return
            }

            const target = {namespace, flowId}
            const namespaceRange = valueRange(namespaceNode)
            const flowIdRange = valueRange(flowIdNode)
            if (namespaceRange) {
                links.push({range: namespaceRange, target})
            }
            if (flowIdRange) {
                links.push({range: flowIdRange, target})
            }
        },
    })

    return links
}
