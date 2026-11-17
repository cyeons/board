import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./api";
import { type LectureData, keys } from "./cache";

export type Tab = "material" | "assignment";
export type Sort = "newest" | "oldest" | "likes";

export const lectureOptions = (lectureId: string) =>
  queryOptions({
    queryKey: keys.lecture(lectureId),
    queryFn: () => unwrap(api.lectures[":id"].$get({ param: { id: lectureId } })) as Promise<LectureData>,
  });

export const postsOptions = (cardId: string, tab: Tab, sort: Sort) =>
  queryOptions({
    queryKey: keys.posts(cardId, tab, tab === "material" ? "order" : sort),
    queryFn: () => unwrap(api.cards[":id"].posts.$get({ param: { id: cardId }, query: tab === "material" ? { tab } : { tab, sort } })),
  });

/** 강의 정보. 시작 전 화면은 웹소켓이 없으므로 주기적으로 확인해 시작되면 저절로 열린다. */
export const useLecture = (lectureId: string) =>
  useQuery({
    ...lectureOptions(lectureId),
    refetchInterval: (q) => (q.state.data?.locked ? 20_000 : false),
  });

export const useCourseData = (slug: string) =>
  useQuery({
    queryKey: keys.course(slug),
    queryFn: () => unwrap(api.courses[":slug"].$get({ param: { slug } })),
  });

/**
 * 누르기 시작하면(pointerdown) 다음 화면의 데이터와 화면 조각을 미리 받는다.
 * 손가락을 떼는 동안 대부분 받아 두어, 화면이 바뀌자마자 내용이 보인다.
 */
export function usePrefetch() {
  const qc = useQueryClient();
  return {
    lecture: (lectureId: string) => {
      void import("../features/lecture/LecturePage");
      void qc.prefetchQuery(lectureOptions(lectureId));
    },
    card: (cardId: string) => {
      void import("../features/card/CardDetail");
      void qc.prefetchQuery(postsOptions(cardId, "material", "newest"));
    },
  };
}
