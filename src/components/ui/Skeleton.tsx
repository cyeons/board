/** 불러오는 동안 실제 모양 자리에 두는 뼈대. 화면 읽기 프로그램에는 숨긴다. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/** 카드 스트림 자리 */
export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="불러오는 중이에요">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-card bg-surface p-4">
          <Skeleton className="size-14 rounded-[30%]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 화면 전체 자리: 제목과 카드 몇 장 */
export function PageSkeleton({ width = 720 }: { width?: number }) {
  return (
    <div className="mx-auto space-y-6 px-[var(--gutter)] pt-[calc(24px+var(--safe-top))]" style={{ maxWidth: width }}>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-2/3" />
      </div>
      <CardListSkeleton />
    </div>
  );
}

/** 게시물 목록 자리 */
export function PostListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="불러오는 중이에요">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-post bg-surface p-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/4" />
              <Skeleton className="h-3 w-1/6" />
            </div>
          </div>
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}
