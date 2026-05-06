<template>
    <div class="edit-popper">
        <FilterHeader
            :label="filterKey.label"
            :description="filterKey.description"
            @close="emits('close')"
        />
        <FilterComparatorSelect
            :shouldShowComparator
            :selectedComparator="state.selectedComparator"
            :filterKey="filterKey"
            @update:selected-comparator="state.selectedComparator = $event"
        />

        <TimeRangeSwitch
            v-if="filterKey.valueType === 'time-range'"
            v-model="state.timeRangeMode"
        />

        <component
            v-if="valueComponent"
            :is="valueComponent.component"
            v-bind="valueComponent.props"
            v-on="valueComponent.events"
        />

        <FilterFooter
            :footerText
            :timeRangeMode="state.timeRangeMode"
            @reset="resetState"
            @apply="handleApply"
        />
    </div>
</template>

<script setup lang="ts">
    import {computed, onMounted, reactive, inject, watch} from "vue";
    import {useI18n} from "vue-i18n";
    import {
        type AppliedFilter,
        type FilterKeyConfig,
        type FilterValue,
        COMPARATOR_LABELS,
        Comparators,
        TEXT_COMPARATORS,
        KV_COMPARATORS
    } from "../utils/filterTypes";
    import {FILTER_CONTEXT_INJECTION_KEY} from "../utils/filterInjectionKeys";
    import FilterText from "./FilterText.vue";
    import FilterRadio from "./FilterRadio.vue";
    import FilterFooter from "./FilterFooter.vue";
    import FilterHeader from "./FilterHeader.vue";
    import FilterSelect from "./FilterSelect.vue";
    import FilterKVPairs from "./FilterKVPairs.vue";
    import FilterDateTime from "./FilterDateTime.vue";
    import FilterMultiSelect from "./FilterMultiSelect.vue";
    import FilterComparatorSelect from "./FilterComparatorSelect.vue";
    import TimeRangeSwitch from "./TimeRangeSwitch.vue";
    const {t} = useI18n({useScope: "global"});

    const RELATIVE_DATE = [
        {label: t("datepicker.last5minutes"), value: "PT5M"},
        {label: t("datepicker.last15minutes"), value: "PT15M"},
        {label: t("datepicker.last1hour"), value: "PT1H"},
        {label: t("datepicker.last12hours"), value: "PT12H"},
        {label: t("datepicker.last24hours"), value: "PT24H"},
        {label: t("datepicker.last48hours"), value: "PT48H"},
        {label: t("datepicker.last7days"), value: "PT168H"},
        {label: t("datepicker.last30days"), value: "P30D"},
        {label: t("datepicker.last365days"), value: "PT8760H"},
    ];

    const getRelativeDateLabel = (value: string): string => {
        const item = RELATIVE_DATE.find((item) => item.value === value);
        return item ? item.label : value;
    };

    const props = defineProps<{
        filter: AppliedFilter;
        filterKey: FilterKeyConfig;
        showComparatorSelection?: boolean;
    }>();

    const emits = defineEmits<{
        close: [];
        remove: [filterId: string];
        update: [filter: AppliedFilter];
    }>();

    const filterContext = inject(FILTER_CONTEXT_INJECTION_KEY);

    const state = reactive({
        textValue: "",
        selectValue: "",
        radioValue: "ALL",
        dateValue: null as Date | null,
        keyValuePair: [] as string[],
        endDateValue: null as Date | null,
        valueOptions: [] as FilterValue[],
        startDateValue: null as Date | null,
        selectedComparator: props.filter.comparator,
        timeRangeMode: "predefined" as "predefined" | "custom"
    });

    const shouldShowComparator = computed(
        () => props.filterKey?.showComparatorSelection ?? props.showComparatorSelection ?? false
    );

    const isTextOp = computed(() =>
        TEXT_COMPARATORS.includes(state.selectedComparator) && props.filterKey?.key !== "resources"
    );

    const isKVPairFilter = computed(() =>
        props.filterKey?.valueType === "key-value"
    );

    const valueComponent = computed(() => {
        if (isTextOp.value) {
            return {
                component: FilterText,
                props: {textValue: state.textValue, label: props.filterKey?.label},
                events: {"update:text-value": (value: string) => (state.textValue = value)}
            };
        }

        // Generic time-range type: predefined select + TimeRangeSwitch + single-date or range custom
        if (props.filterKey?.valueType === "time-range") {
            if (state.timeRangeMode === "custom" && props.filterKey.customDateMode !== "range") {
                return {
                    component: FilterDateTime,
                    props: {dateValue: state.dateValue, label: props.filterKey?.label},
                    events: {"update:date-value": (value: Date | null) => (state.dateValue = value)}
                };
            }
            return {
                component: FilterSelect,
                props: {
                    modelValue: state.selectValue,
                    options: state.valueOptions,
                    searchable: props.filterKey?.searchable,
                    label: props.filterKey?.label,
                    timeRangeMode: state.timeRangeMode,
                    startDateValue: state.startDateValue,
                    endDateValue: state.endDateValue
                },
                events: {
                    "update:modelValue": (value: string) => (state.selectValue = value),
                    "update:start-date-value": (value: Date | null) => (state.startDateValue = value),
                    "update:end-date-value": (value: Date | null) => (state.endDateValue = value)
                }
            };
        }

        // Key-value pair filters (details, labels)
        if (isKVPairFilter.value) {
            return {
                component: FilterKVPairs,
                props: {modelValue: state.keyValuePair},
                events: {"update:modelValue": (value: string[]) => (state.keyValuePair = value)}
            };
        }

        // valueType drives component selection
        const componentConfigs = {
            select: {
                component: FilterSelect,
                props: {
                    modelValue: state.selectValue,
                    options: state.valueOptions,
                    searchable: props.filterKey?.searchable,
                    label: props.filterKey?.label
                },
                events: {
                    "update:modelValue": (value: string) => (state.selectValue = value)
                }
            },
            text: {
                component: FilterText,
                props: {
                    textValue: state.textValue,
                    label: props.filterKey?.label
                },
                events: {
                    "update:text-value": (value: string) => (state.textValue = value)
                }
            },
            "multi-select": {
                component: FilterMultiSelect,
                props: {
                    modelValue: state.keyValuePair,
                    options: state.valueOptions,
                    searchable: props.filterKey?.searchable,
                    label: props.filterKey?.label,
                    filterKey: props.filterKey?.key
                },
                events: {
                    "update:modelValue": (value: string[]) => (state.keyValuePair = value)
                }
            },
            date: {
                component: FilterDateTime,
                props: {
                    dateValue: state.dateValue,
                    label: props.filterKey?.label
                },
                events: {
                    "update:date-value": (value: Date | null) => (state.dateValue = value)
                }
            },
            radio: {
                component: FilterRadio,
                props: {
                    modelValue: state.radioValue,
                    options: state.valueOptions
                },
                events: {
                    "update:modelValue": (value: string) => (state.radioValue = value)
                }
            }
        };

        return (
            componentConfigs[props.filterKey.valueType as keyof typeof componentConfigs] || null
        );
    });

    const footerText = computed(() => {
        if (isTextOp.value) return state.textValue ?? "";

        if (props.filterKey?.valueType === "time-range") {
            if (state.timeRangeMode === "custom") {
                if (props.filterKey.customDateMode === "range") {
                    return (state.startDateValue && state.endDateValue)
                        ? `${state.startDateValue.toLocaleDateString()} - ${state.endDateValue.toLocaleDateString()}`
                        : "";
                }
                return state.dateValue?.toLocaleDateString() ?? "";
            }
            const option = state.valueOptions?.find(opt => opt.value === state.selectValue);
            return option ? option.label : (state.selectValue ?? "");
        }

        if (isKVPairFilter.value && props.filterKey?.key === "labels") {
            return t("filter.kv_pair_selected", {count: state.keyValuePair.length});
        }

        switch (props.filterKey?.valueType) {
        case "multi-select":
            return `${state.keyValuePair.length} ${props.filterKey?.label} selected`;
        case "select":
            if (state.selectValue) {
                const option = state.valueOptions?.find(opt => opt.value === state.selectValue);
                return option ? option.label : state.selectValue;
            }
            return "";
        case "radio":
            return state.radioValue === "ALL" ? "Default selected" : state.radioValue;
        default:
            return "";
        }
    });

    const resetState = () => {
        const defaultFilter = filterContext?.hasPreApplied(props.filterKey.key)
            ? filterContext?.getPreApplied(props.filterKey.key)
            : null;

        if (defaultFilter) {
            initializeStateFromFilter(defaultFilter);
            return;
        }

        Object.assign(state, {
            textValue: "",
            selectValue: "",
            keyValuePair: [],
            radioValue: "ALL",
            dateValue: null,
            timeRangeMode: "predefined",
            startDateValue: null,
            endDateValue: null
        });
    };

    const getFilterValue = () => {
        if (isTextOp.value) {
            return {value: state.textValue, label: state.textValue};
        }

        if (props.filterKey?.valueType === "time-range") {
            if (state.timeRangeMode === "custom") {
                if (props.filterKey.customDateMode === "range") {
                    return {
                        value: {startDate: state.startDateValue!, endDate: state.endDateValue!},
                        label: `${state.startDateValue!.toLocaleDateString()} - ${state.endDateValue!.toLocaleDateString()}`
                    };
                }
                return {value: state.dateValue ?? "", label: state.dateValue?.toLocaleDateString() ?? ""};
            }
            return {
                value: state.selectValue,
                label: state.valueOptions?.find(opt => opt.value === state.selectValue)?.label || state.selectValue
            };
        }

        if (isKVPairFilter.value) {
            return {
                value: state.keyValuePair,
                label: state.keyValuePair[0] || ""
            };
        }

        switch (props.filterKey.valueType) {
        case "text":
            return {value: state.textValue, label: state.textValue};
        case "select":
            return {
                value: state.selectValue,
                label:
                    state.valueOptions?.find(opt => opt.value === state.selectValue)
                        ?.label || state.selectValue
            };
        case "multi-select":
            return {
                value: state.keyValuePair,
                label: state.keyValuePair
                    .map(val =>
                        state.valueOptions?.find(opt => opt.value === val)?.label ?? val
                    )
                    .join(", ")
            };
        case "date":
            return {
                value: state.dateValue ?? "",
                label: state.dateValue?.toLocaleDateString() ?? ""
            };
        case "radio":
            if (state.radioValue === "ALL") return null;
            return {value: state.radioValue, label: state.radioValue};
        default:
            return null;
        }
    };

    const handleApply = () => {
        if (!state.selectedComparator) return;

        const filterData = getFilterValue();
        if (!filterData) {
            emits("remove", props.filter.id);
            emits("close");
            return;
        }

        emits("update", {
            ...props.filter,
            comparator: state.selectedComparator,
            comparatorLabel: COMPARATOR_LABELS[state.selectedComparator],
            value: filterData.value,
            valueLabel: filterData.label
        });
        emits("close");
    };

    const initializeStateFromFilter = (filter: AppliedFilter) => {
        state.selectedComparator = filter.comparator;

        if (props.filterKey?.valueType === "time-range") {
            const isRangeCustom =
                props.filterKey.customDateMode === "range" &&
                typeof filter.value === "object" &&
                filter.value !== null &&
                "startDate" in filter.value;

            if (isRangeCustom) {
                state.timeRangeMode = "custom";
                const {startDate, endDate} = filter.value as {startDate: Date; endDate: Date};
                state.startDateValue = startDate;
                state.endDateValue = endDate;
            } else if (props.filterKey.customDateMode !== "range") {
                const valueStr = typeof filter.value === "string" ? filter.value : "";
                const isDuration = /^P(T?\d+[HMD]|\d+[YMDW])/.test(valueStr);
                if (valueStr && !isDuration) {
                    state.timeRangeMode = "custom";
                    state.dateValue = filter.value instanceof Date ? filter.value : new Date(valueStr);
                } else {
                    state.timeRangeMode = "predefined";
                    state.dateValue = null;
                    state.selectValue = valueStr;
                }
            } else {
                state.timeRangeMode = "predefined";
                state.startDateValue = null;
                state.endDateValue = null;
                state.selectValue = typeof filter.value === "string" ? filter.value : "";
            }
            return;
        }

        const isTextOp = TEXT_COMPARATORS.includes(filter.comparator) && props.filterKey?.key !== "resources";
        const isKVPair = props.filterKey?.valueType === "key-value" || (props.filterKey?.key === "labels" && KV_COMPARATORS.includes(filter.comparator));

        if (isTextOp) {
            state.textValue = typeof filter.value === "string" ? filter.value : "";
        } else if (isKVPair) {
            state.keyValuePair = Array.isArray(filter.value)
                ? filter.value
                : typeof filter.value === "string"
                    ? [filter.value]
                    : [];
        } else {
            switch (props.filterKey.valueType) {
            case "text":
                state.textValue = typeof filter.value === "string" ? filter.value : "";
                break;
            case "multi-select":
                state.keyValuePair = Array.isArray(filter.value) ? filter.value : [];
                break;
            case "select":
                state.selectValue =
                    typeof filter.value === "string" &&
                    state.valueOptions.find(option => option.value === filter.value)
                        ? filter.value
                        : "";
                break;
            case "date":
                state.dateValue = filter.value instanceof Date
                    ? filter.value
                    : typeof filter.value === "string"
                        ? new Date(filter.value)
                        : null;
                break;
            case "radio":
                state.radioValue = typeof filter.value === "string"
                    ? filter.value
                    : "ALL";
                break;
            }
        }
    };

    const loadValueOptions = async () => {
        if (!props.filterKey?.valueProvider) return;

        state.valueOptions = await props.filterKey.valueProvider();

        if (
            props.filterKey?.valueType === "time-range" &&
            typeof props.filter.value === "string"
        ) {
            const currentValue = props.filter.value;
            const exists = state.valueOptions.some(
                option => option.value === currentValue
            );
            if (!exists && /^P(T?\d+[HMD]|\d+[YMDW])/.test(currentValue)) {
                state.valueOptions.push({
                    value: currentValue,
                    label: getRelativeDateLabel(currentValue)
                });
            }
        }
    };

    const initializeFilter = async () => {
        state.selectedComparator = shouldShowComparator.value
            ? props.filter.comparator
            : props.filterKey.comparators[0];
        await loadValueOptions();
        initializeStateFromFilter(props.filter);
    };

    watch(() => state.timeRangeMode, (mode) => {
        if (props.filterKey?.valueType === "time-range" && props.filterKey?.customDateMode !== "range") {
            state.selectedComparator = mode === "predefined"
                ? Comparators.EQUALS
                : Comparators.GREATER_THAN_OR_EQUAL_TO;
        }
    });

    onMounted(initializeFilter);
</script>
