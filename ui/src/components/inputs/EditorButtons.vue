<template>
    <div v-if="!isNamespace && (isAllowedEdit || canDelete)">
        <KsDropdown>
            <KsButton type="default" :disabled="isReadOnly">
                <DotsVertical title="" />
                {{ $t("actions") }}
            </KsButton>
            <template #dropdown>
                <KsDropdownMenu class="m-dropdown-menu">
                    <KsDropdownItem
                        v-if="isAllowedEdit"
                        :icon="Download"
                        size="large"
                        @click="forwardEvent('export')"
                    >
                        {{ $t("flow_export") }}
                    </KsDropdownItem>
                    <KsDropdownItem
                        v-if="!isCreating && canDelete"
                        :icon="Delete"
                        size="large"
                        @click="forwardEvent('delete-flow', $event)"
                    >
                        {{ $t("delete") }}
                    </KsDropdownItem>

                    <KsDropdownItem
                        v-if="!isCreating"
                        :icon="ContentCopy"
                        size="large"
                        @click="forwardEvent('copy', $event)"
                    >
                        {{ $t("copy") }}
                    </KsDropdownItem>
                </KsDropdownMenu>
            </template>
        </KsDropdown>
    </div>
    <div data-onboarding-target="flow-save-button">
        <!--
            Save & execute keeps the single primary button: no draft variant in this mode -
            this is the onboarding "execute" entry point and is not affected by the default
            save preference.
        -->
        <el-button
            v-if="showSaveAndExecute && (isNamespace || isAllowedEdit)"
            :icon="ContentSave"
            @click="forwardEvent('save-and-execute', $event)"
            :type="playgroundStore.enabled ? undefined : 'primary'"
            :class="{
                'el-button--playground': playgroundStore.enabled,
                'onboarding-save-execute-button': true,
            }"
            :disabled="hasErrors || !canSave"
            class="edit-flow-save-button"
            id="execute-button"
        >
            {{ $t("save_and_execute") }}
        </el-button>

        <!--
            Regular save: a split-button dropdown.
            - The main button performs the user's preferred default action (Save or Save as
              draft) and emits the corresponding event.
            - The dropdown menu lists both options. Picking one in the menu only changes the
              default - it updates the main button label and persists the preference, but
              does NOT trigger the action; the user has to click the main button to execute.
        -->
        <el-dropdown
            v-else-if="isNamespace || isAllowedEdit"
            splitButton
            :type="playgroundStore.enabled ? undefined : 'primary'"
            :class="{'el-button--playground': playgroundStore.enabled}"
            :disabled="hasErrors || !canSave"
            class="edit-flow-save-button"
            @click="onMainSaveClick($event)"
            @command="onDropdownCommand"
        >
            <component :is="currentActionMeta.icon" class="me-1" />
            {{ $t(currentActionMeta.labelKey) }}
            <template #dropdown>
                <el-dropdown-menu>
                    <el-dropdown-item
                        v-for="opt in saveActionOptions"
                        :key="opt.value"
                        :command="opt.value"
                        :class="{'is-active': currentAction === opt.value}"
                    >
                        <component :is="opt.icon" class="me-2" />
                        {{ $t(opt.labelKey) }}
                    </el-dropdown-item>
                </el-dropdown-menu>
            </template>
        </el-dropdown>
    </div>
</template>
<script setup lang="ts">
    import {computed, ref} from "vue"

    import DotsVertical from "vue-material-design-icons/DotsVertical.vue"

    import Delete from "vue-material-design-icons/Delete.vue"
    import ContentCopy from "vue-material-design-icons/ContentCopy.vue"
    import ContentSave from "vue-material-design-icons/ContentSave.vue"
    import Download from "vue-material-design-icons/Download.vue"
    import FileDocumentEditOutline from "vue-material-design-icons/FileDocumentEditOutline.vue"
    import {usePlaygroundStore} from "../../stores/playground"
    import {saveDefaultActions, storageKeys} from "../../utils/constants"

    const playgroundStore = usePlaygroundStore()

    const props = defineProps<{
        isCreating: boolean;
        isReadOnly: boolean;
        canDelete: boolean;
        isAllowedEdit: boolean;
        haveChange: boolean;
        flowHaveTasks: boolean;
        errors: string[] | undefined;
        warnings: string[] | undefined;
        isNamespace: boolean;
        showSaveAndExecute?: boolean;
    }>()

    const forwardEvent = defineEmits([
        "delete-flow",
        "copy",
        "save",
        "save-and-execute",
        "save-as-draft",
        "export",
    ])

    const hasErrors = computed(() => props.errors && props.errors.length > 0)

    const canSave = computed(() => {
        return props.haveChange || props.isCreating
    });

    type SaveAction = typeof saveDefaultActions[keyof typeof saveDefaultActions];

    const saveActionOptions: Array<{
        value: SaveAction;
        labelKey: string;
        icon: any;
        event: "save" | "save-as-draft";
    }> = [
        {value: saveDefaultActions.SAVE, labelKey: "save", icon: ContentSave, event: "save"},
        {value: saveDefaultActions.SAVE_AS_DRAFT, labelKey: "save_as_draft", icon: FileDocumentEditOutline, event: "save-as-draft"},
    ];

    function readDefault(): SaveAction {
        const stored = localStorage.getItem(storageKeys.SAVE_DEFAULT_ACTION) as SaveAction | null;
        return saveActionOptions.some(o => o.value === stored) ? (stored as SaveAction) : saveDefaultActions.SAVE;
    }

    const currentAction = ref<SaveAction>(readDefault());

    const currentActionMeta = computed(() =>
        saveActionOptions.find(o => o.value === currentAction.value) ?? saveActionOptions[0]
    );

    function onMainSaveClick(event: MouseEvent) {
        forwardEvent(currentActionMeta.value.event, event);
    }

    function onDropdownCommand(command: SaveAction) {
        // Selecting a menu item only switches the default - it does NOT trigger the action.
        // The user has to click the main button again to actually save.
        currentAction.value = command;
        localStorage.setItem(storageKeys.SAVE_DEFAULT_ACTION, command);
    }
</script>

<style scoped lang="scss">
    .onboarding-save-execute-button {
        position: relative;
        z-index: 1;
        animation: onboardingSaveExecutePulse 1s ease-in-out infinite alternate;
        will-change: transform, box-shadow;
    }

    @keyframes onboardingSaveExecutePulse {
        from {
            transform: translateZ(0) scale(1);
            box-shadow:
                0 0 0 0 color-mix(in srgb, var(--ks-button-background-primary) 42%, transparent),
                0 0 14px 4px color-mix(in srgb, var(--ks-button-background-primary) 28%, transparent);
        }

        to {
            transform: translateZ(0) scale(1.04);
            box-shadow:
                0 0 0 8px color-mix(in srgb, var(--ks-button-background-primary) 12%, transparent),
                0 0 22px 8px color-mix(in srgb, var(--ks-button-background-primary) 34%, transparent),
                0 0 36px 14px color-mix(in srgb, var(--ks-button-background-primary) 20%, transparent);
        }
    }

    :global(html.dark) .onboarding-save-execute-button {
        animation-name: onboardingSaveExecutePulseDark;
    }

    @keyframes onboardingSaveExecutePulseDark {
        from {
            transform: translateZ(0) scale(1);
            box-shadow:
                0 0 0 0 color-mix(in srgb, var(--ks-button-background-primary) 54%, transparent),
                0 0 16px 5px color-mix(in srgb, var(--ks-button-background-primary) 34%, transparent);
        }

        to {
            transform: translateZ(0) scale(1.035);
            box-shadow:
                0 0 0 10px color-mix(in srgb, var(--ks-button-background-primary) 14%, transparent),
                0 0 24px 9px color-mix(in srgb, var(--ks-button-background-primary) 40%, transparent),
                0 0 42px 16px color-mix(in srgb, var(--ks-button-background-primary) 24%, transparent);
        }
    }
</style>
