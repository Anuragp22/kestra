import type {Router} from "vue-router"
import {resolveSubflowLinks} from "../../../services/subflowReferences"
import {openFlowInNewTab} from "../../../utils/openFlow"

/** Custom URI scheme used to route subflow link activation to our opener. */
export const SUBFLOW_LINK_SCHEME = "kestra-subflow"

export interface SubflowTarget {
    namespace: string
    flowId: string
}

/** Serializes a subflow target into a link URI query string. */
export function encodeSubflowTarget(target: SubflowTarget): string {
    return encodeURIComponent(JSON.stringify(target))
}

/** Parses a subflow target from a link URI query string, if valid. */
export function decodeSubflowTarget(query: string): SubflowTarget | undefined {
    try {
        const parsed = JSON.parse(decodeURIComponent(query))
        if (typeof parsed?.namespace === "string" && typeof parsed?.flowId === "string") {
            return {namespace: parsed.namespace, flowId: parsed.flowId}
        }
    } catch {
        // fall through
    }
    return undefined
}

/** The slice of a Monaco model this builder depends on (kept small for testing). */
export interface SubflowLinkModel {
    uri: {path: string}
    getValue(): string
    getPositionAt(offset: number): {lineNumber: number; column: number}
}

export interface SubflowMonacoLink {
    range: {
        startLineNumber: number
        startColumn: number
        endLineNumber: number
        endColumn: number
    }
    target: {namespace: string; flowId: string}
}

/**
 * Flow editor models carry a `flow-` prefix in their URI path (set from the
 * editor's `flow` schema type). Mirrors the same convention the inline-completion
 * provider uses. Note: a namespace file literally named `flow-*.yaml` would also
 * match, but it would only yield links if it contained a real Subflow task block,
 * which is flow content, not namespace-file content — so the false positive is
 * not reachable in practice.
 */
function isFlowModel(path: string): boolean {
    return path.includes("flow-")
}

/** A link resource as seen by the Monaco link opener (only the fields we read). */
interface LinkResource {
    scheme: string
    query: string
}

/**
 * Builds the Monaco link opener that activates subflow links: it claims only our
 * custom scheme and opens the decoded flow in a new browser tab on its edit tab.
 * Returns false for any other scheme so other link openers still handle theirs.
 */
export function createSubflowLinkOpener(router: Router) {
    return {
        open(resource: LinkResource): boolean {
            if (resource.scheme !== SUBFLOW_LINK_SCHEME) {
                return false
            }
            const target = decodeSubflowTarget(resource.query)
            if (!target) {
                return false
            }
            openFlowInNewTab({...target, tab: "edit"}, router)
            return true
        },
    }
}

/**
 * Maps the subflow references of a flow model to Monaco link descriptors,
 * converting the resolver's character offsets to editor positions. Returns an
 * empty list for non-flow models so other YAML editors are left untouched.
 */
export function buildSubflowLinks(model: SubflowLinkModel): SubflowMonacoLink[] {
    if (!isFlowModel(model.uri.path)) {
        return []
    }

    return resolveSubflowLinks(model.getValue()).map((link) => {
        const start = model.getPositionAt(link.range[0])
        const end = model.getPositionAt(link.range[1])
        return {
            range: {
                startLineNumber: start.lineNumber,
                startColumn: start.column,
                endLineNumber: end.lineNumber,
                endColumn: end.column,
            },
            target: link.target,
        }
    })
}
