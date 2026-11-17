<script setup lang="ts">
import { useSongWiki } from "@/composables/useSongWiki";
import { useTrackMenu } from "@/composables/useTrackMenu";
import { navigateToAlbum, navigateToArtist } from "@/utils/navigate";
import * as player from "@/core/player";
import SongList from "@/components/list/SongList.vue";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id ?? ""));
const {
  track,
  publishTime,
  wiki,
  sheets,
  similarTracks,
  similarLoading,
  loading,
  failed,
  partialFailure,
  load,
  loadSheet,
} = useSongWiki(id);
const publishDate = computed(() =>
  publishTime.value ? new Date(publishTime.value).toLocaleDateString(locale.value) : "",
);
const menu = useTrackMenu(track, { hidePlayActions: true });
const previewImage = ref("");
const previewOpen = computed({
  get: () => !!previewImage.value,
  set: (open: boolean) => {
    if (!open) previewImage.value = "";
  },
});
const story = computed(() => wiki.value?.story);
const firstListen = computed(() => story.value?.musicFirstListenDto);
const firstListenDate = computed(() => {
  if (firstListen.value?.date) return firstListen.value.date;
  const time = firstListen.value?.listenTime;
  return time ? new Date(time).toLocaleDateString(locale.value) : "";
});
const hasStory = computed(
  () =>
    !!(firstListen.value || story.value?.musicTotalPlayDto || story.value?.musicLikeSongDto?.like),
);
const hasContent = computed(
  () =>
    !!(
      hasStory.value ||
      wiki.value?.basicInfo.length ||
      wiki.value?.awards.length ||
      wiki.value?.credentials.length ||
      sheets.value.length ||
      similarLoading.value ||
      similarTracks.value.length
    ),
);
watch([id, track], () => {
  previewImage.value = "";
});

/** 返回来源页面；直接进入时回到首页 */
const goBack = (): void => {
  if (window.history.state?.back) router.back();
  else router.push("/");
};

/** 播放当前百科对应的歌曲，不替换用户整个队列 */
const play = (): void => {
  if (track.value) void player.playNow(track.value);
};
</script>

<template>
  <div class="h-full overflow-y-auto px-5 pb-8 pt-2">
    <div class="mb-5 flex items-center gap-3">
      <SButton circle variant="text" :title="t('common.back')" @click="goBack">
        <IconLucideArrowLeft class="size-5" />
      </SButton>
      <h1 class="text-xl font-bold">{{ t("wiki.title") }}</h1>
    </div>
    <div
      v-if="loading"
      class="flex justify-center gap-3 py-20 text-on-surface-variant"
      role="status"
    >
      <SLoading />
      {{ t("common.loading") }}
    </div>
    <div v-else-if="failed" class="space-y-4 py-20 text-center" role="alert">
      <p>{{ t("wiki.loadFailed") }}</p>
      <SButton @click="load">{{ t("common.retry") }}</SButton>
    </div>
    <div v-else-if="track && wiki" class="space-y-8">
      <header class="flex flex-wrap gap-6">
        <SImg :src="track.cover" :alt="track.title" class="size-48 shrink-0 rounded-xl" />
        <div class="flex min-w-0 flex-1 flex-col justify-center gap-3">
          <h2 class="text-3xl font-bold break-words">{{ track.title }}</h2>
          <div class="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
            <IconLucideUserRound class="size-4" />
            <template v-for="(artist, index) in track.artists" :key="artist.id ?? index">
              <span v-if="index">/</span>
              <button
                v-if="artist.id"
                class="hover:text-primary"
                @click="navigateToArtist(artist.name, { source: 'netease', artistId: artist.id })"
              >
                {{ artist.name }}
              </button>
              <span v-else>{{ artist.name }}</span>
            </template>
          </div>
          <div v-if="track.album" class="flex items-center gap-2 text-sm text-on-surface-variant">
            <IconLucideDisc3 class="size-4" />
            <button
              v-if="track.album.id"
              class="hover:text-primary"
              @click="
                navigateToAlbum(track.album.name, { source: 'netease', albumId: track.album.id })
              "
            >
              {{ track.album.name }}
            </button>
            <span v-else>{{ track.album.name }}</span>
          </div>
          <div
            v-if="publishDate"
            class="flex items-center gap-2 text-sm text-on-surface-variant"
            :title="t('wiki.publishDate')"
          >
            <IconLucideCalendarDays class="size-4" />
            {{ publishDate }}
          </div>
          <div class="mt-2 flex gap-2">
            <SButton type="primary" round @click="play">
              <IconLucidePlay class="mr-2 size-4" />
              {{ t("wiki.play") }}
            </SButton>
            <SDropdownMenu :items="menu.items.value" @select="menu.handleSelect">
              <template #trigger>
                <SButton circle :title="t('songList.context.more')">
                  <IconLucideEllipsis class="size-4" />
                </SButton>
              </template>
            </SDropdownMenu>
          </div>
        </div>
      </header>

      <SAlert v-if="partialFailure" type="warning">
        {{ t("wiki.partialFailure") }}
        <SButton variant="text" size="small" @click="load">{{ t("common.retry") }}</SButton>
      </SAlert>

      <section v-if="hasStory" class="space-y-3">
        <h2 class="text-lg font-semibold">{{ t("wiki.story") }}</h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SCard v-if="firstListen" :title="t('wiki.firstListen')">
            <p>
              {{
                [firstListen.season, firstListen.period, firstListenDate]
                  .filter(Boolean)
                  .join(" · ")
              }}
            </p>
            <p v-if="firstListen.meetDurationDesc" class="mt-2 text-sm text-on-surface-variant">
              {{ firstListen.meetDurationDesc }}
            </p>
          </SCard>
          <SCard v-if="story?.musicTotalPlayDto" :title="t('wiki.playCount')">
            <p>{{ t("wiki.playCountValue", { count: story.musicTotalPlayDto.playCount ?? 0 }) }}</p>
            <p class="mt-2 text-sm text-on-surface-variant">{{ story.musicTotalPlayDto.text }}</p>
          </SCard>
          <SCard v-if="story?.musicLikeSongDto?.like" :title="t('wiki.liked')">
            <p>{{ story.musicLikeSongDto.text }}</p>
            <p class="mt-2 text-sm text-on-surface-variant">{{ story.musicLikeSongDto.redDesc }}</p>
          </SCard>
        </div>
      </section>

      <section v-if="wiki.basicInfo.length" class="space-y-3">
        <h2 class="text-lg font-semibold">{{ t("wiki.basicInfo") }}</h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SCard v-for="(item, index) in wiki.basicInfo" :key="index" :title="item.label">
            <div v-if="item.tags?.length" class="flex flex-wrap gap-2">
              <STag v-for="tag in item.tags" :key="tag" round>{{ tag }}</STag>
            </div>
            <p v-else>{{ item.value }}</p>
          </SCard>
        </div>
      </section>

      <section v-if="sheets.length" class="space-y-3">
        <h2 class="text-lg font-semibold">{{ t("wiki.sheets") }}</h2>
        <details
          v-for="(sheet, index) in sheets"
          :key="sheet.id"
          class="rounded-lg border border-primary/15 p-4"
          @toggle="($event.target as HTMLDetailsElement).open && loadSheet(sheet.id)"
        >
          <summary class="cursor-pointer">
            {{
              [sheet.name || t("wiki.sheetNumber", { count: index + 1 }), sheet.playVersion]
                .filter(Boolean)
                .join(" · ")
            }}
          </summary>
          <div v-if="sheet.loading" class="flex justify-center p-6"><SLoading /></div>
          <div v-else-if="sheet.error" class="pt-4 text-sm" role="alert">
            {{ t("wiki.sheetFailed") }}
            <SButton size="small" @click="loadSheet(sheet.id)">{{ t("common.retry") }}</SButton>
          </div>
          <div v-else-if="sheet.images.length" class="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <button
              v-for="(image, page) in sheet.images"
              :key="image"
              :title="t('wiki.preview')"
              @click="previewImage = image"
            >
              <img
                :src="image"
                :alt="`${sheet.name} ${page + 1}`"
                class="max-h-64 w-full rounded object-contain"
                loading="lazy"
                decoding="async"
              />
            </button>
          </div>
          <p v-else-if="sheet.loaded" class="pt-4 text-sm text-on-surface-variant">
            {{ t("wiki.noPreview") }}
          </p>
        </details>
      </section>

      <section v-if="wiki.awards.length || wiki.credentials.length" class="space-y-3">
        <h2 class="text-lg font-semibold">{{ t("wiki.achievements") }}</h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SCard v-for="(item, index) in [...wiki.awards, ...wiki.credentials]" :key="index">
            <div class="flex items-center gap-3">
              <SImg
                v-if="item.image"
                :src="item.image"
                :alt="item.title"
                class="size-12 shrink-0 rounded-md"
              />
              <div class="min-w-0">
                <p class="font-medium">{{ item.title }}</p>
                <p class="text-sm text-on-surface-variant">{{ item.subTitle }}</p>
              </div>
            </div>
          </SCard>
        </div>
      </section>

      <section v-if="similarLoading || similarTracks.length" class="space-y-3">
        <h2 class="text-lg font-semibold">{{ t("wiki.similarSongs") }}</h2>
        <div
          v-if="similarLoading"
          class="flex items-center gap-2 py-4 text-on-surface-variant"
          role="status"
        >
          <SLoading />
          {{ t("common.loading") }}
        </div>
        <div v-else :style="{ height: `${Math.min(480, similarTracks.length * 64 + 48)}px` }">
          <SongList :items="similarTracks" source="netease" />
        </div>
      </section>
      <p v-if="!hasContent && !partialFailure" class="py-12 text-center text-on-surface-variant">
        {{ t("wiki.empty") }}
      </p>
    </div>
    <SDialog
      v-model:open="previewOpen"
      :title="t('wiki.preview')"
      width="min(900px, 90vw)"
      destroy-on-close
    >
      <img
        v-if="previewImage"
        :src="previewImage"
        :alt="t('wiki.preview')"
        class="w-full"
        decoding="async"
      />
    </SDialog>
  </div>
</template>
