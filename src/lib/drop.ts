import { type DragEvent, useRef, useState } from "react";

const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes("Files"));

/**
 * 파일을 끌어다 놓는 영역. 안쪽 요소를 지날 때마다 dragleave가 생겨 깜빡이지 않도록 들어간 횟수를 센다.
 * `onFiles`가 없으면 아무것도 하지 않는다.
 */
export function useFileDrop(onFiles: ((files: File[]) => void) | undefined) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  if (!onFiles) return { dragging: false, dropProps: {} };
  return {
    dragging,
    dropProps: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        depth.current += 1;
        setDragging(true);
      },
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      },
      onDrop: (e: DragEvent) => {
        depth.current = 0;
        setDragging(false);
        const files = [...(e.dataTransfer?.files ?? [])];
        if (!files.length) return;
        e.preventDefault();
        // 안쪽 영역(글쓰기 창)이 받았으면 바깥 영역(카드 상세)은 다시 받지 않는다
        e.stopPropagation();
        onFiles(files);
      },
    },
  };
}

/** 받는 영역 밖에 놓친 파일을 브라우저가 열어 버리면 쓰던 글이 사라지므로 막는다. */
export function blockStrayFileDrops() {
  const block = (e: globalThis.DragEvent) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  };
  window.addEventListener("dragover", block);
  window.addEventListener("drop", block);
}
