<script setup lang="ts">
import type { Track } from "@shared/types/player";
import { songsByIds } from "@/apis/song/netease";
import { useUserStore } from "@/stores/user";
import { toast } from "@/composables/useToast";

const props = defineProps<{ open: boolean; track: Track }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const { t } = useI18n();
const user = useUserStore();

const targetId = ref("");
const candidate = shallowRef<Track | null>(null);
const verifying = ref(false);
const submitting = ref(false);
const error = ref("");
const userId = user.profile?.userId;
let verifyVersion = 0;
let disposed = false;

const normalizedId = computed(() => targetId.value.trim());
const validTarget = computed(
  () => /^[1-9]\d*$/.test(normalizedId.value) && normalizedId.value !== props.track.id,
);
const canSubmit = computed(
  () =>
    user.isLoggedIn &&
    user.profile?.userId === userId &&
    !!candidate.value &&
    candidate.value.id === normalizedId.value &&
    !verifying.value &&
    !submitting.value,
);

watch(
  targetId,
  () => {
    verifyVersion++;
    candidate.value = null;
    verifying.value = false;
    error.value = "";
  },
  { flush: "sync" },
);

watch(
  () => user.profile?.userId,
  (nextUserId) => {
    if (nextUserId !== userId) emit("update:open", false);
  },
);

onBeforeUnmount(() => {
  disposed = true;
  verifyVersion++;
});

/** 验证目标歌曲 ID，并仅展示当前输入对应的详情 */
const verify = async (): Promise<void> => {
  if (verifying.value || submitting.value) return;
  candidate.value = null;
  error.value = "";
  if (!/^[1-9]\d*$/.test(normalizedId.value)) {
    error.value = t("cloud.match.invalidId");
    return;
  }
  if (normalizedId.value === props.track.id) {
    error.value = t("cloud.match.sameId");
    return;
  }
  const id = normalizedId.value;
  const version = ++verifyVersion;
  verifying.value = true;
  try {
    const tracks = await songsByIds([id]);
    if (disposed || !props.open || version !== verifyVersion) return;
    candidate.value = tracks.find((track) => track.id === id) ?? null;
    if (!candidate.value) error.value = t("cloud.match.notFound");
  } catch (err) {
    if (disposed || !props.open || version !== verifyVersion) return;
    error.value = err instanceof Error && err.message ? err.message : t("cloud.match.verifyFailed");
  } finally {
    if (version === verifyVersion) verifying.value = false;
  }
};

/** 提交已验证的匹配关系，再按服务端结果刷新云盘 */
const confirm = async (): Promise<void> => {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const refreshed = await user.matchCloudTrack(
      props.track.cloudId ?? props.track.id,
      candidate.value!.id,
    );
    if (disposed || !props.open || user.profile?.userId !== userId) return;
    if (refreshed) toast.success(t("cloud.match.success"));
    else toast.warning(t("cloud.match.refreshFailed"));
    emit("update:open", false);
  } catch (err) {
    if (disposed || !props.open || user.profile?.userId !== userId) return;
    toast.error(err instanceof Error && err.message ? err.message : t("cloud.match.failed"));
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <SDialog
    :open="open"
    :title="t('cloud.match.title')"
    width="480px"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="flex flex-col gap-4">
      <div class="text-sm font-medium truncate" :title="track.title">{{ track.title }}</div>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-on-surface-variant">{{ t("cloud.match.originalId") }}</span>
        <SInput :model-value="track.cloudId ?? track.id" disabled />
      </label>
      <div class="flex flex-col gap-1">
        <div class="flex items-end gap-2">
          <label class="flex flex-1 min-w-0 flex-col gap-1">
            <span class="text-xs text-on-surface-variant">{{ t("cloud.match.targetId") }}</span>
            <SInput
              v-model="targetId"
              :placeholder="t('cloud.match.placeholder')"
              :disabled="submitting"
              :status="error ? 'error' : 'default'"
              clearable
              @keydown.enter.prevent="verify"
            />
          </label>
          <SButton
            :disabled="!validTarget || !!candidate || submitting"
            :loading="verifying"
            @click="verify"
          >
            {{ t(candidate ? "cloud.match.verified" : "cloud.match.verify") }}
          </SButton>
        </div>
        <p v-if="error" role="alert" class="text-xs text-red-500">{{ error }}</p>
      </div>
      <div v-if="candidate" class="flex items-center gap-3 rounded-lg bg-on-surface/5 p-3">
        <SImg :src="candidate.cover" class="size-14 shrink-0 rounded-md" />
        <div class="min-w-0 flex flex-col gap-1">
          <div class="font-medium truncate" :title="candidate.title">{{ candidate.title }}</div>
          <div class="text-xs text-on-surface-variant truncate">
            {{ candidate.artists.map((artist) => artist.name).join(" / ") }}
          </div>
          <div v-if="candidate.album?.name" class="text-xs text-on-surface-variant truncate">
            {{ candidate.album.name }}
          </div>
          <div class="text-xs text-on-surface-variant">ID: {{ candidate.id }}</div>
        </div>
      </div>
    </div>
    <template #footer="{ close }">
      <SButton variant="tertiary" :disabled="submitting" @click="close">
        {{ t("common.cancel") }}
      </SButton>
      <SButton type="primary" :disabled="!canSubmit" :loading="submitting" @click="confirm">
        {{ t("cloud.match.confirm") }}
      </SButton>
    </template>
  </SDialog>
</template>
