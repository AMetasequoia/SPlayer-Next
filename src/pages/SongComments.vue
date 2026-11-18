<script setup lang="ts">
import type { Track } from "@shared/types/player";
import { songsByIds } from "@/apis/song/netease";
import { isNeteaseCommentTarget } from "@shared/utils/comments";
import NeteaseComments from "@/components/list/NeteaseComments.vue";
import * as player from "@/core/player";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const id = computed(() => (typeof route.params.id === "string" ? route.params.id : ""));
const target = computed(() => ({ type: "song" as const, id: id.value }));
const track = shallowRef<Track | null>(null);
const loading = ref(false);
const failed = ref(false);
let version = 0;

/** 读取路由对应的歌曲快照，不跟随当前播放歌曲变化 */
const load = async (): Promise<void> => {
  const token = ++version;
  track.value = null;
  failed.value = false;
  loading.value = false;
  if (!isNeteaseCommentTarget(target.value)) {
    failed.value = true;
    return;
  }
  loading.value = true;
  try {
    const list = await songsByIds([id.value]);
    if (token !== version) return;
    const song = list.find((item) => item.id === id.value);
    if (!song) throw new Error("song not found");
    track.value = song;
  } catch {
    if (token === version) failed.value = true;
  } finally {
    if (token === version) loading.value = false;
  }
};

/** 播放当前评论目标，不读取正在播放的其他歌曲 */
const play = (): void => {
  if (track.value) player.playNow(track.value);
};

/** 返回上一页，直接打开时回到首页 */
const goBack = (): void => {
  if (window.history.length > 1) router.back();
  else void router.replace("/");
};

watch(id, () => void load(), { immediate: true, flush: "sync" });
onBeforeUnmount(() => {
  version++;
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex shrink-0 items-center gap-3 px-5 pb-3">
      <SButton circle variant="text" :title="t('common.back')" @click="goBack">
        <IconLucideArrowLeft class="size-5" />
      </SButton>
      <h1 class="text-xl font-bold">{{ t("comments.name") }}</h1>
    </div>
    <div v-if="loading" class="flex flex-1 items-center justify-center gap-2" role="status">
      <SLoading />
      {{ t("common.loading") }}
    </div>
    <div
      v-else-if="failed"
      class="flex flex-1 flex-col items-center justify-center gap-4"
      role="alert"
    >
      <p>{{ t("comments.songFailed") }}</p>
      <SButton @click="load">{{ t("common.retry") }}</SButton>
    </div>
    <template v-else-if="track">
      <header class="mx-5 mb-2 flex shrink-0 items-center gap-4 rounded-xl bg-primary/8 p-4">
        <SImg :src="track.cover" :alt="track.title" class="size-16 shrink-0 rounded-xl" />
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-xl font-semibold">{{ track.title }}</h2>
          <p class="mt-1 truncate text-sm text-on-surface-variant">
            {{ track.artists.map((artist) => artist.name).join(" / ") }}
          </p>
        </div>
        <SButton variant="secondary" circle :title="t('wiki.play')" @click="play">
          <IconLucidePlay class="size-5" />
        </SButton>
      </header>
      <NeteaseComments :key="id" :target="target" class="flex-1" />
    </template>
  </div>
</template>
