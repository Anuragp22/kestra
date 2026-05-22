<template>
    <div class="logical-chooser">
        <button
            v-for="op in OPTIONS"
            :key="op"
            type="button"
            class="logical-chooser-option"
            :class="{active: current === op}"
            @click="$emit('select', op)"
        >{{ op === "AND" ? $t("filter.and") : $t("filter.or") }}</button>
    </div>
</template>

<script setup lang="ts">
    import type {LogicalOperator} from "../utils/filterTypes"

    defineProps<{
        current: LogicalOperator;
    }>()

    defineEmits<{
        select: [op: LogicalOperator];
    }>()

    const OPTIONS: LogicalOperator[] = ["AND", "OR"]
</script>

<style lang="scss" scoped>
.logical-chooser {
    display: flex;
    flex-direction: column;
    min-width: 4rem;
    padding: 0.25rem;
    gap: 0.125rem;
}

.logical-chooser-option {
    appearance: none;
    background: transparent;
    border: none;
    text-align: left;
    padding: 0.375rem 0.75rem;
    font-size: var(--ks-font-size-sm);
    color: var(--ks-content-primary);
    border-radius: var(--ks-border-radius-sm, 0.15rem);
    cursor: pointer;

    &:hover {
        background-color: var(--ks-background-hover, var(--ks-background-card));
    }

    &.active {
        font-weight: 600;
        color: var(--ks-content-link);
    }
}
</style>
