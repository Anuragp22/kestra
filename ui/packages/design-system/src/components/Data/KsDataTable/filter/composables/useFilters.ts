import {ref, watch, computed} from "vue"
import {useRoute, useRouter} from "vue-router"
import {
    keyOfComparator,
    decodeSearchParams,
    encodeFilterGroupsToQuery,
    isValidFilter,
    getUniqueFilters,
    clearFilterQueryParams,
    findUnrenderableFilterKeys,
    parseFiltersFromString,
    serializeFiltersToString,
    type DecodedParam,
} from "../utils/helpers"
import {
    SEARCH_QUERY_KEY,
    TIME_RANGE_KEY,
    DATE_FILTER_KEY,
    START_DATE_FIELD,
    END_DATE_FIELD,
} from "../utils/constants"
import {
    type AppliedFilter,
    type FilterConfiguration,
    type FilterGroup,
    type FilterKeyConfig,
    type LeafFilterGroup,
    type LogicalOperator,
    type WrapperGroup,
    COMPARATOR_LABELS,
    Comparators,
    TEXT_COMPARATORS,
    isLeafGroup,
    isWrapperGroup,
} from "../utils/filterTypes"
import {usePreAppliedFilters} from "./usePreAppliedFilters"
import {applyDefaultFilters, useDefaultFilter} from "./useDefaultFilter"
import {useDismissedKeys} from "./useDismissedKeys"
import {
    useFilterGroups,
    findLeafById,
    findLeafContaining,
    allFilters,
    newGroupId,
} from "./useFilterGroups"

export function useFilters(
    configuration: FilterConfiguration,
    showSearchInput = true,
    defaultScope?: boolean,
    defaultTimeRange?: boolean,
    defaultDuration?: string,
) {
    const router = useRouter()
    const route = useRoute()

    const tree = useFilterGroups()
    const dismissed = useDismissedKeys(configuration)

    const searchQuery = ref("")

    const {
        markAsPreApplied,
        hasPreApplied,
        getPreApplied,
    } = usePreAppliedFilters()

    const updateSearchQuery = (query: Record<string, any>) => {
        const trimmedQuery = searchQuery.value?.trim()
        delete query.q
        delete query.search
        delete query[SEARCH_QUERY_KEY]

        if (trimmedQuery && showSearchInput) {
            query[SEARCH_QUERY_KEY] = trimmedQuery
        }
    }

    const hasValue = (filter: AppliedFilter): boolean => {
        return (Array.isArray(filter.value) && filter.value.length > 0) ||
            (!Array.isArray(filter.value) && filter.value !== "" && filter.value !== null && filter.value !== undefined)
    }

    /** Strip invalid values and dedupe by (key, comparator) within each leaf group. */
    const sanitizeLeaf = (leaf: LeafFilterGroup): LeafFilterGroup =>
        ({...leaf, filters: getUniqueFilters(leaf.filters.filter(isValidFilter))})

    const updateRoute = (shouldResetPage = false) => {
        const query = {...route.query}
        clearFilterQueryParams(query)

        const validUnits: FilterGroup[] = tree.groups.value.flatMap((unit): FilterGroup[] => {
            if (isWrapperGroup(unit)) {
                const cleanedChildren = unit.children.map(sanitizeLeaf).filter(c => c.filters.length > 0)
                if (cleanedChildren.length === 0) return []
                if (cleanedChildren.length === 1) return [cleanedChildren[0]] // unwrap single child
                return [{...unit, children: cleanedChildren}]
            }
            const cleaned = sanitizeLeaf(unit)
            return cleaned.filters.length > 0 ? [cleaned] : []
        })

        Object.assign(query, encodeFilterGroupsToQuery(validUnits, keyOfComparator, tree.topLogical.value))

        updateSearchQuery(query)

        if (shouldResetPage && parseInt(String(query.page ?? "1")) > 1) {
            delete query.page
        }

        router.push({query})
    }

    /**
     * True when the URL contains `filters[...]` keys the chip UI can't render — i.e. anything
     * beyond a top-level group plus one wrapper level (more than two `[and|or][N]` segments).
     */
    const hasUnrenderableFilters = computed(() => findUnrenderableFilterKeys(route.query).length > 0)

    /** Serialised raw view of every `filters[...]` query param. The raw editor consumes this string. */
    const rawQuery = computed(() => serializeFiltersToString(route.query))

    /** Replace every `filters[...]` route param with the parsed contents of the editor string. */
    const applyRawQuery = (str: string) => {
        const newFilters = parseFiltersFromString(str)
        const query = {...route.query}
        clearFilterQueryParams(query)
        Object.assign(query, newFilters)
        delete query.page
        router.push({query})
    }

    const createAppliedFilter = (
        key: string,
        config: FilterKeyConfig | undefined,
        comparator: Comparators,
        value: AppliedFilter["value"],
        valueLabel: string,
        idSuffix: string,
        meta?: Record<string, string>,
    ): AppliedFilter => ({
        // Random tail keeps IDs unique when the same key+op appears in multiple groups;
        // without it, two `state IN ...` chips parsed from the URL in the same tick collide
        // and updateFilter routes both edits to the first match.
        id: `${key}-${idSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        key,
        keyLabel: config?.keyLabelProvider ? config.keyLabelProvider(meta) : (config?.label ?? key),
        comparator,
        comparatorLabel: COMPARATOR_LABELS[comparator],
        value,
        valueLabel,
        ...(meta ? {meta} : {}),
    })

    const createTimeRangeFilter = (
        config: FilterKeyConfig,
        startDate: Date,
        endDate: Date,
        comparator = Comparators.EQUALS,
        meta?: Record<string, string>,
    ): AppliedFilter => ({
        ...createAppliedFilter(
            "timeRange",
            config,
            comparator,
            {startDate, endDate},
            `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
            keyOfComparator(comparator),
            meta,
        ),
        comparatorLabel: "Is Between",
    })

    const processFieldValue = (config: FilterKeyConfig, params: any[], _field: string, comparator: Comparators) => {
        const isTextOp = TEXT_COMPARATORS.includes(comparator)

        if (config?.valueType === "key-value") {
            const combinedValue = params.map(p => p?.value as string)
            return {
                value: combinedValue,
                valueLabel: combinedValue.length > 1
                    ? `${combinedValue[0]} +${combinedValue.length - 1}`
                    : combinedValue[0] ?? "",
            }
        }

        if (config?.valueType === "multi-select" && !isTextOp) {
            const combinedValue = params.flatMap(p =>
                Array.isArray(p?.value) ? p.value : (p?.value as string)?.split(",") ?? [],
            )
            return {
                value: combinedValue,
                valueLabel: combinedValue.join(", "),
            }
        }

        let value: AppliedFilter["value"] = Array.isArray(params[0]?.value)
            ? params[0].value[0]
            : (params[0]?.value as string)

        if (config?.valueType === "date" && typeof value === "string") {
            value = new Date(value)
        }

        return {
            value,
            valueLabel: value instanceof Date ? value.toLocaleDateString() : String(value),
        }
    }

    /**
     * Decode the route query into top-level FilterGroup units PLUS the observed top-level operator.
     * Returns `{groups, topLogical}` so the caller can sync both at once via `tree.replaceTree`.
     *
     * Internally the decode goes through three named passes for clarity:
     *   1. `bucketParams` — group decoded params by (topIdx, wrapperChildIdx) into Slot maps.
     *   2. `buildLeafFromSlot` — turn one Slot into a `LeafFilterGroup`.
     *   3. `assembleUnits` — fold the bucket map into top-level units (leaves or wrappers).
     */
    const parseEncodedGroups = (): {groups: FilterGroup[]; topLogical: LogicalOperator} => {
        const bucketed = bucketParams(decodeSearchParams(route.query))
        const routeDateFilter = route.query[DATE_FILTER_KEY] as string | undefined
        const groups = assembleUnits(bucketed, routeDateFilter)
        return {groups, topLogical: bucketed.observedTopLogical ?? "OR"}
    }

    /** A bag of params bucketed into one logical position in the tree. */
    type Slot = {
        fieldParams: Map<string, DecodedParam[]>;
        dateFilters: Record<string, {comparatorKey: string; value: string}>;
    }

    type BucketedParams = {
        perTop: Map<number, {isWrapper: boolean; children: Map<number, Slot>}>;
        observedTopLogical: LogicalOperator | undefined;
        wrapperLogicalByTopIdx: Map<number, LogicalOperator>;
    }

    const emptySlot = (): Slot => ({fieldParams: new Map(), dateFilters: {}})

    /**
     * Sort decoded URL params into buckets keyed by (topIdx, wrapperChildIdx). Tracks the
     * top-level operator and each wrapper's operator as side effects of the first param that
     * specifies them — well-formed URLs are consistent so the first wins.
     */
    const bucketParams = (params: DecodedParam[]): BucketedParams => {
        const perTop = new Map<number, {isWrapper: boolean; children: Map<number, Slot>}>()
        let observedTopLogical: LogicalOperator | undefined
        const wrapperLogicalByTopIdx = new Map<number, LogicalOperator>()

        const getSlot = (topIdx: number, wrapperChildIdx?: number): Slot => {
            if (!perTop.has(topIdx)) {
                perTop.set(topIdx, {isWrapper: false, children: new Map()})
            }
            const top = perTop.get(topIdx)!
            if (wrapperChildIdx !== undefined) top.isWrapper = true
            const childKey = wrapperChildIdx ?? -1
            if (!top.children.has(childKey)) top.children.set(childKey, emptySlot())
            return top.children.get(childKey)!
        }

        params.forEach(param => {
            const topIdx = param.groupIndex ?? 0
            if (param.topLogical && observedTopLogical === undefined) {
                observedTopLogical = param.topLogical
            }
            if (param.wrapperLogical && !wrapperLogicalByTopIdx.has(topIdx)) {
                wrapperLogicalByTopIdx.set(topIdx, param.wrapperLogical)
            }
            const slot = getSlot(topIdx, param.wrapperChildIndex)
            if (param.field === START_DATE_FIELD || param.field === END_DATE_FIELD) {
                slot.dateFilters[param.field] = {
                    comparatorKey: param.operation ?? "",
                    value: param.value as string,
                }
            } else {
                // Bucket by (field, operation) so same-field/different-comparator pairs survive.
                const bucketKey = `${param.field}|${param.operation ?? ""}`
                if (!slot.fieldParams.has(bucketKey)) slot.fieldParams.set(bucketKey, [])
                slot.fieldParams.get(bucketKey)!.push(param)
            }
        })

        return {perTop, observedTopLogical, wrapperLogicalByTopIdx}
    }

    /** Build a single LeafFilterGroup from one bucketed Slot. */
    const buildLeafFromSlot = (slot: Slot, routeDateFilter: string | undefined): LeafFilterGroup => {
        const filtersMap = new Map<string, AppliedFilter>()

        slot.fieldParams.forEach((params, bucketKey) => {
            const field = params[0]?.field ?? bucketKey.split("|")[0]
            const config = configuration.keys?.find(k => k?.key === field)
            if (!config) return

            const parsedComparator = Comparators[params[0]?.operation as keyof typeof Comparators]
            const comparator = config.comparators?.includes(parsedComparator) ? parsedComparator : undefined
            if (!comparator) return

            const {value, valueLabel} = processFieldValue(config, params, field, comparator)
            const meta = field === TIME_RANGE_KEY && routeDateFilter && config.dateFilterOptions
                ? {dateFilter: routeDateFilter}
                : undefined
            filtersMap.set(
                `${field}|${params[0]?.operation ?? ""}`,
                createAppliedFilter(field, config, comparator, value, valueLabel, params[0]?.operation, meta),
            )
        })

        if (slot.dateFilters[START_DATE_FIELD] && slot.dateFilters[END_DATE_FIELD]) {
            const timeRangeConfig = configuration.keys?.find(k => k?.key === TIME_RANGE_KEY)
            if (timeRangeConfig) {
                const comparator = Comparators[slot.dateFilters[START_DATE_FIELD].comparatorKey as keyof typeof Comparators]
                const meta = routeDateFilter && timeRangeConfig.dateFilterOptions
                    ? {dateFilter: routeDateFilter}
                    : undefined
                filtersMap.set(
                    TIME_RANGE_KEY,
                    createTimeRangeFilter(
                        timeRangeConfig,
                        new Date(slot.dateFilters[START_DATE_FIELD].value),
                        new Date(slot.dateFilters[END_DATE_FIELD].value),
                        comparator,
                        meta,
                    ),
                )
            }
        }

        return {id: newGroupId(), kind: "leaf", filters: Array.from(filtersMap.values())}
    }

    /** Fold the bucket map into a sorted list of top-level FilterGroup units. */
    const assembleUnits = (bucketed: BucketedParams, routeDateFilter: string | undefined): FilterGroup[] => {
        const orderedTop = Array.from(bucketed.perTop.entries()).sort(([a], [b]) => a - b)
        return orderedTop.flatMap(([topIdx, top]): FilterGroup[] => {
            if (!top.isWrapper) {
                const slot = top.children.get(-1) ?? emptySlot()
                const leaf = buildLeafFromSlot(slot, routeDateFilter)
                return leaf.filters.length > 0 ? [leaf] : []
            }
            const orderedChildren = Array.from(top.children.entries())
                .filter(([k]) => k >= 0)
                .sort(([a], [b]) => a - b)
            const childLeaves = orderedChildren
                .map(([, slot]) => buildLeafFromSlot(slot, routeDateFilter))
                .filter(c => c.filters.length > 0)
            if (childLeaves.length === 0) return []
            if (childLeaves.length === 1) return [childLeaves[0]]
            const wrapper: WrapperGroup = {
                id: newGroupId(),
                kind: "wrapper",
                logical: bucketed.wrapperLogicalByTopIdx.get(topIdx) ?? "AND",
                children: childLeaves,
            }
            return [wrapper]
        })
    }

    /** Default-visible filter chips (visibleByDefault=true) that appear empty on first load. */
    const resolveDefaultVisibleValue = (key: FilterKeyConfig): AppliedFilter["value"] => {
        const value = typeof key.defaultValue === "function"
            ? key.defaultValue()
            : key.defaultValue
        if (value !== undefined) return value
        return key.valueType === "multi-select" ? [] : ""
    }

    const defaultVisibleValueLabel = (value: AppliedFilter["value"]): string => {
        if (Array.isArray(value)) return value.join(", ")
        if (value && typeof value === "object" && "startDate" in value && "endDate" in value) {
            return `${value.startDate.toLocaleDateString()} - ${value.endDate.toLocaleDateString()}`
        }
        if (value instanceof Date) return value.toLocaleDateString()
        return value?.toString?.() ?? ""
    }

    const createDefaultVisibleFilters = (
        excludedKeys = new Set<string>(),
        hiddenDefaultVisibleKeys = dismissed.dismissedKeys.value,
    ): AppliedFilter[] =>
        configuration.keys
            ?.filter(key =>
                key.visibleByDefault &&
                !excludedKeys.has(key.key) &&
                !hiddenDefaultVisibleKeys.has(key.key),
            )
            .map(key => {
                const comparator = (key.comparators?.[0] as Comparators) ?? Comparators.EQUALS
                const value = resolveDefaultVisibleValue(key)
                const valueLabel = defaultVisibleValueLabel(value)
                return {
                    ...createAppliedFilter(key.key, key, comparator, value, valueLabel, "default"),
                    isDefaultVisible: true,
                } as AppliedFilter
            }) ?? []

    const initializeFromRoute = () => {
        if (showSearchInput) {
            searchQuery.value = (route.query?.["filters[q][EQUALS]"] as string) ?? ""
        }

        const {groups: parsedGroups, topLogical: parsedTop} = parseEncodedGroups()
        const parsedFlat = allFilters(parsedGroups)

        if (tree.appliedFilters.value?.length === 0 && parsedFlat.length > 0) {
            markAsPreApplied(parsedFlat)
        }

        // Restore any dismissed-key entries that are now back in the URL.
        const parsedFilterKeys = new Set(parsedFlat.map(f => f.key))
        parsedFilterKeys.forEach(k => dismissed.restoreDefaultVisibleKey(k))

        // Default-visible filters always live in the first LEAF group alongside the user's primary filters.
        // When the first top unit is a wrapper, we prepend a fresh leaf carrying just the defaults.
        const defaultsForFirstGroup = createDefaultVisibleFilters(parsedFilterKeys, dismissed.dismissedKeys.value)
        const head = parsedGroups[0]
        let finalGroups: FilterGroup[]
        if (parsedGroups.length === 0) {
            finalGroups = defaultsForFirstGroup.length > 0
                ? [{id: newGroupId(), kind: "leaf", filters: defaultsForFirstGroup}]
                : []
        } else if (parsedGroups.length === 1 && isLeafGroup(head) && head.filters.length === 0) {
            finalGroups = [{...head, filters: defaultsForFirstGroup}]
        } else if (isLeafGroup(head)) {
            finalGroups = [
                {...head, filters: [...head.filters, ...defaultsForFirstGroup]},
                ...parsedGroups.slice(1),
            ]
        } else if (defaultsForFirstGroup.length > 0) {
            finalGroups = [
                {id: newGroupId(), kind: "leaf", filters: defaultsForFirstGroup},
                ...parsedGroups,
            ]
        } else {
            finalGroups = parsedGroups
        }

        tree.replaceTree(finalGroups, parsedTop)
    }

    watch(() => route.query, initializeFromRoute, {deep: true, immediate: false})
    initializeFromRoute()

    /** Returns the id of the leaf that should receive a new filter when no explicit id was given. */
    const fallbackLeafId = (): string | undefined => {
        const lastTop = tree.groups.value[tree.groups.value.length - 1]
        if (!lastTop) return undefined
        if (isWrapperGroup(lastTop)) {
            return lastTop.children[lastTop.children.length - 1]?.id
        }
        return lastTop.id
    }

    /** Resolve the leaf id that should receive a new filter from a (possibly missing) groupId. */
    const resolveTargetLeafId = (groupId?: string): string | undefined => {
        if (groupId) {
            const direct = findLeafById(tree.groups.value, groupId)
            if (direct) return direct.id
            const maybeWrapper = tree.groups.value.find(g => g.id === groupId)
            if (maybeWrapper && isWrapperGroup(maybeWrapper)) {
                return maybeWrapper.children.slice(-1)[0]?.id
            }
        }
        return fallbackLeafId()
    }

    const addFilter = (filter: AppliedFilter, groupId?: string) => {
        dismissed.restoreDefaultVisibleKey(filter.key)
        const targetLeafId = resolveTargetLeafId(groupId)
        if (!targetLeafId) return

        tree.updateLeaf(targetLeafId, leaf => {
            // Replace only when both key AND comparator match — same-field/different-op chips coexist.
            const idx = leaf.filters.findIndex(
                f => f?.key === filter?.key && f?.comparator === filter?.comparator,
            )
            return {
                ...leaf,
                filters: idx === -1
                    ? [...leaf.filters, filter]
                    : leaf.filters.map((f, j) => (j === idx ? filter : f)),
            }
        })
        updateRoute(hasValue(filter))
    }

    const removeFilter = (filterId: string) => {
        const enclosing = findLeafContaining(tree.groups.value, filterId)
        if (!enclosing) return
        const found = enclosing.filters.find(f => f?.id === filterId)
        if (!found) return
        tree.updateLeaf(enclosing.id, leaf => ({
            ...leaf,
            filters: leaf.filters.filter(f => f?.id !== filterId),
        }))
        dismissed.dismissDefaultVisibleKey(found.key)
        updateRoute(false)
    }

    const updateFilter = (updatedFilter: AppliedFilter) => {
        dismissed.restoreDefaultVisibleKey(updatedFilter.key)
        const enclosing = findLeafContaining(tree.groups.value, updatedFilter.id)
        if (!enclosing) return
        tree.updateLeaf(enclosing.id, leaf => ({
            ...leaf,
            filters: leaf.filters.map(f => (f?.id === updatedFilter.id ? updatedFilter : f)),
        }))
        updateRoute(hasValue(updatedFilter))
    }

    /** Structural operations: delegate to the tree composable, then push to route. */
    const moveFilter = (filterId: string, targetGroupId: string) => {
        tree.moveFilter(filterId, targetGroupId)
        updateRoute(false)
    }

    const wrapGroups = (sourceGroupId: string, targetGroupId: string) => {
        tree.wrapGroups(sourceGroupId, targetGroupId)
        updateRoute(false)
    }

    const unwrapGroup = (wrapperId: string) => {
        tree.unwrapGroup(wrapperId)
        updateRoute(false)
    }

    const setTopLogical = (op: LogicalOperator) => {
        tree.setTopLogical(op)
        updateRoute(false)
    }

    const setWrapperLogical = (wrapperId: string, op: LogicalOperator) => {
        tree.setWrapperLogical(wrapperId, op)
        updateRoute(false)
    }

    const addGroup = () => {
        tree.addGroup()
        // Empty groups don't affect the URL — the route updates when the user adds a filter.
    }

    const removeGroup = (groupId: string) => {
        if (tree.groups.value.length <= 1) return
        tree.removeGroup(groupId)
        updateRoute(false)
    }

    const clearFilters = () => {
        dismissed.dismissAllDefaultVisibleKeys()
        tree.clearTree()
        searchQuery.value = ""
        updateRoute(true)
    }

    const defaultFilterOptions = {
        namespace: configuration.keys?.some((k) => k.key === "namespace") ? undefined : null,
        includeScope: defaultScope ?? configuration.keys?.some((k) => k.key === "scope"),
        includeTimeRange: defaultTimeRange ?? configuration.keys?.some((k) => k.key === "timeRange"),
        defaultDuration,
    }
    useDefaultFilter(defaultFilterOptions)

    const resetToDefaults = () => {
        dismissed.resetDismissedDefaultVisibleKeys()

        const {query: defaultQuery} = applyDefaultFilters({}, defaultFilterOptions)
        const resetFilters: AppliedFilter[] = []

        if (defaultFilterOptions.includeTimeRange) {
            const timeRangeConfig = configuration.keys?.find((k) => k.key === "timeRange")
            const timeRangeQueryKey = "filters[timeRange][EQUALS]"
            const defaultTimeRangeForReset = defaultQuery[timeRangeQueryKey]
            const timeRangeValue = Array.isArray(defaultTimeRangeForReset) ? defaultTimeRangeForReset[0] : defaultTimeRangeForReset

            if (timeRangeConfig && typeof timeRangeValue === "string" && timeRangeValue.length > 0) {
                const comparator = (timeRangeConfig.comparators?.[0] as Comparators) ?? Comparators.EQUALS
                resetFilters.push(
                    createAppliedFilter("timeRange", timeRangeConfig, comparator, timeRangeValue, timeRangeValue, "default"),
                )
            }
        }

        resetFilters.push(...createDefaultVisibleFilters(new Set(), dismissed.dismissedKeys.value))

        const currentQuery = {...route.query}
        clearFilterQueryParams(currentQuery)
        delete currentQuery.page

        const query = {...currentQuery, ...defaultQuery}
        router.replace({query}).then(() => {
            tree.replaceTree([{id: newGroupId(), kind: "leaf", filters: resetFilters}], "OR")
        })
    }

    watch(searchQuery, () => {
        updateRoute(searchQuery.value.trim() !== "")
    })

    return {
        appliedFilters: tree.appliedFilters,
        groups: tree.groups,
        topLogical: tree.topLogical,
        hasUnrenderableFilters,
        rawQuery,
        applyRawQuery,
        hasDismissedDefaultVisibleKeys: dismissed.hasDismissedDefaultVisibleKeys,
        searchQuery,
        addFilter,
        removeFilter,
        updateFilter,
        moveFilter,
        wrapGroups,
        unwrapGroup,
        setTopLogical,
        setWrapperLogical,
        addGroup,
        removeGroup,
        clearFilters,
        resetToDefaults,
        hasPreApplied,
        getPreApplied,
    }
}
