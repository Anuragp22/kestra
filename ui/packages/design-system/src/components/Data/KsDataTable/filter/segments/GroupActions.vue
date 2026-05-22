<template>
    <KsTooltip
        v-if="canUnwrap"
        placement="top"
        :content="$t('filter.unwrap_group')"
    >
        <KsButton
            link
            class="remove-group-btn"
            :aria-label="$t('filter.unwrap_group')"
            @click="$emit('unwrap')"
        >
            ⤴
        </KsButton>
    </KsTooltip>
    <KsTooltip
        v-if="canRemove"
        placement="top"
        :content="$t('filter.remove_condition_group')"
    >
        <KsButton
            link
            class="remove-group-btn"
            :class="{'filters-hidden': hidden}"
            :aria-label="$t('filter.remove_condition_group')"
            @click="$emit('remove')"
        >
            ✕
        </KsButton>
    </KsTooltip>
</template>

<script setup lang="ts">
    import KsTooltip from "../../../../Feedback/KsTooltip.vue"

    withDefaults(defineProps<{
        canRemove: boolean;
        canUnwrap?: boolean;
        hidden?: boolean;
    }>(), {
        canUnwrap: false,
        hidden: false,
    })

    defineEmits<{
        unwrap: [];
        remove: [];
    }>()
</script>

<style lang="scss" scoped>
.remove-group-btn {
    margin: 0 !important;
    font-size: var(--ks-font-size-xs);
    color: var(--ks-content-secondary);
    flex-shrink: 0;
    padding: 0 0.25rem;

    &:hover {
        color: var(--ks-content-primary);
        text-decoration: underline;
    }

    &.filters-hidden {
        display: none;
    }
}
</style>
