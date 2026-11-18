<script setup lang="ts">
import type { MusicCommentItem, NeteaseCommentTarget } from "@shared/types/comment";
import { useNeteaseComments } from "@/composables/useNeteaseComments";
import { formatDate } from "@/utils/time";
import { withPicSize } from "@/utils/format/netease";
import SVirtualList from "@/components/ui/SVirtualList.vue";

const props = defineProps<{ target: NeteaseCommentTarget }>();
const { t } = useI18n();
const {
  hot,
  comments,
  total,
  hasMore,
  trimmed,
  hotLoading,
  loading,
  hotError,
  error,
  pendingLikes,
  refresh,
  load,
  toggleLike,
} = useNeteaseComments(toRef(props, "target"));

type Row =
  | { key: string; kind: "heading"; label: string; count?: number }
  | { key: string; kind: "comment"; comment: MusicCommentItem }
  | { key: string; kind: "status"; section: "hot" | "new" };

const rows = computed<Row[]>(() => [
  { key: "hot-title", kind: "heading", label: t("comments.hot") },
  ...hot.value.map((comment): Row => ({ key: `hot:${comment.id}`, kind: "comment", comment })),
  { key: "hot-status", kind: "status", section: "hot" },
  { key: "new-title", kind: "heading", label: t("comments.all"), count: total.value },
  ...comments.value.map((comment): Row => ({ key: `new:${comment.id}`, kind: "comment", comment })),
  { key: "new-status", kind: "status", section: "new" },
]);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="netease-comments">
    <div
      class="flex shrink-0 items-center justify-between px-5 py-2 text-sm text-on-surface-variant"
    >
      <span>{{ t("comments.netease") }}</span>
      <SButton
        variant="text"
        size="small"
        :disabled="loading || hotLoading || pendingLikes.size > 0"
        :title="t('comments.refresh')"
        @click="refresh"
      >
        <template #icon><IconLucideRefreshCw /></template>
        {{ t("comments.refresh") }}
      </SButton>
    </div>
    <SVirtualList
      :items="rows"
      :item-height="160"
      :get-item-key="(row) => row.key"
      :padding-bottom="20"
      class="min-h-0 flex-1"
    >
      <template #default="{ item }">
        <div class="flow-root px-5">
          <h2
            v-if="item.kind === 'heading'"
            class="flex items-center gap-2 pb-3 pt-4 text-lg font-semibold"
          >
            {{ item.label }}
            <span v-if="item.count" class="text-sm font-normal text-on-surface-variant">
              {{ item.count }}
            </span>
          </h2>
          <SCard v-else-if="item.kind === 'comment'" class="mb-4" radius="lg">
            <div class="flex gap-3">
              <SImg
                v-if="item.comment.avatar"
                :src="withPicSize(item.comment.avatar, 100)"
                :alt="item.comment.userName"
                class="size-12 shrink-0 rounded-full"
              />
              <div v-else class="size-12 shrink-0 rounded-full bg-on-surface/8" />
              <div class="min-w-0 flex-1">
                <p class="whitespace-pre-wrap break-words leading-6 select-text">
                  <span class="font-semibold">
                    {{ item.comment.userName || t("comments.unknownUser") }}：
                  </span>
                  {{ item.comment.text }}
                </p>
                <div
                  v-for="(reply, index) in item.comment.reply"
                  :key="reply.id || index"
                  class="mt-2 rounded-lg bg-primary/8 px-3 py-2 text-sm text-on-surface-variant whitespace-pre-wrap break-words select-text"
                >
                  <span class="font-medium">
                    @{{ reply.userName || t("comments.unknownUser") }}：
                  </span>
                  {{ reply.text }}
                </div>
                <div v-if="item.comment.images?.length" class="mt-3 flex gap-2">
                  <SImg
                    v-for="image in item.comment.images"
                    :key="image"
                    :src="withPicSize(image)"
                    :alt="t('comments.image')"
                    class="size-28 rounded-lg"
                  />
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
                  <span v-if="item.comment.time" class="flex items-center gap-1">
                    <IconLucideClock class="size-3.5" />
                    {{ formatDate(item.comment.time) }}
                  </span>
                  <span v-if="item.comment.location" class="flex items-center gap-1">
                    <IconLucideMapPin class="size-3.5" />
                    {{ item.comment.location }}
                  </span>
                  <SButton
                    variant="text"
                    size="small"
                    class="ml-auto"
                    :type="item.comment.liked ? 'primary' : 'default'"
                    :title="t(item.comment.liked ? 'comments.unlike' : 'comments.like')"
                    :aria-label="t(item.comment.liked ? 'comments.unlike' : 'comments.like')"
                    :aria-pressed="item.comment.liked === true"
                    :loading="pendingLikes.has(item.comment.id)"
                    :disabled="loading || hotLoading"
                    @click="toggleLike(item.comment)"
                  >
                    <template #icon><IconLucideThumbsUp /></template>
                    {{ item.comment.likedCount ?? 0 }}
                  </SButton>
                </div>
              </div>
            </div>
          </SCard>
          <div v-else class="pb-4 text-sm text-on-surface-variant" aria-live="polite">
            <template v-if="item.section === 'hot'">
              <div
                v-if="hotLoading"
                class="flex items-center justify-center gap-2 py-5"
                role="status"
              >
                <SLoading />
                {{ t("comments.loading") }}
              </div>
              <div
                v-else-if="hotError"
                class="flex items-center justify-center gap-3 py-4"
                role="alert"
              >
                <span>{{ hotError }}</span>
                <SButton size="small" :disabled="pendingLikes.size > 0" @click="load('hot')">
                  {{ t("common.retry") }}
                </SButton>
              </div>
              <p v-else-if="!hot.length" class="py-4 text-center">{{ t("comments.emptyHot") }}</p>
            </template>
            <template v-else>
              <p v-if="trimmed" class="mb-3 text-center">{{ t("comments.trimmed") }}</p>
              <div v-if="error" class="flex items-center justify-center gap-3 py-4" role="alert">
                <span>{{ error }}</span>
                <SButton size="small" :disabled="pendingLikes.size > 0" @click="load('new')">
                  {{ t("common.retry") }}
                </SButton>
              </div>
              <div
                v-else-if="loading"
                class="flex items-center justify-center gap-2 py-5"
                role="status"
              >
                <SLoading />
                {{ t("comments.loading") }}
              </div>
              <p v-else-if="!comments.length" class="py-8 text-center">{{ t("comments.empty") }}</p>
              <div v-else-if="hasMore" class="flex justify-center py-3">
                <SButton
                  variant="secondary"
                  round
                  :disabled="pendingLikes.size > 0"
                  @click="load('new')"
                >
                  {{ t("comments.loadMore") }}
                </SButton>
              </div>
              <p v-else class="py-4 text-center">{{ t("comments.end") }}</p>
            </template>
          </div>
        </div>
      </template>
    </SVirtualList>
  </div>
</template>
