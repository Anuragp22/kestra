import type {Router} from "vue-router"

export interface OpenFlowTarget {
    namespace: string
    flowId: string
    executionId?: string
    tab?: string
}

/**
 * Opens a flow (or one of its executions) in a new browser tab, preserving the
 * current tenant. Shared by the topology subflow "Open" button and the YAML
 * subflow links. The landing tab is caller-chosen via `target.tab`: YAML links
 * pass "edit", the topology button leaves it unset (defaults to overview).
 */
export function openFlowInNewTab(target: OpenFlowTarget, router: Router): void {
    const tenant = router.currentRoute.value.params.tenant

    const resolved = target.executionId
        ? router.resolve({
            name: "executions/update",
            params: {
                namespace: target.namespace,
                flowId: target.flowId,
                tab: target.tab ?? "topology",
                id: target.executionId,
                tenant,
            },
        })
        : router.resolve({
            name: "flows/update",
            params: {
                namespace: target.namespace,
                id: target.flowId,
                tab: target.tab ?? "overview",
                tenant,
            },
        })

    window.open(resolved.href, "_blank")
}
