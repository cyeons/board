import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppBar } from "./components/AppBar";
import { PageSkeleton } from "./components/ui/Skeleton";
import { ApiFailure } from "./lib/api";
import { blockStrayFileDrops } from "./lib/drop";
import { installErrorReporting } from "./lib/errors";
import "./styles/tokens.css";

installErrorReporting();
blockStrayFileDrops();

const DesignSample = lazy(() => import("./routes/DesignSample"));
const Login = lazy(() => import("./features/admin/Login"));
const AdminHome = lazy(() => import("./features/admin/AdminHome"));
const CourseAdmin = lazy(() => import("./features/admin/CourseAdmin"));
const Storage = lazy(() => import("./features/admin/Storage"));
const Guide = lazy(() => import("./routes/Guide"));
const CourseShell = lazy(() => import("./features/entry/CourseShell"));

const queryClient = new QueryClient({
  queryCache: new QueryCache(),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiFailure && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

function App() {
  return (
    <>
      <AppBar />
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          {import.meta.env.DEV && <Route path="__design" element={<DesignSample />} />}
          <Route path="admin" element={<Login />} />
          <Route path="admin/home" element={<AdminHome />} />
          <Route path="admin/c/:slug" element={<CourseAdmin />} />
          <Route path="admin/storage" element={<Storage />} />
          <Route index element={<Guide />} />
          {/* 과정 안의 화면은 CourseShell이 화면 전환과 함께 그린다 */}
          <Route path=":slug/*" element={<CourseShell />} />
          <Route path="*" element={<Guide />} />
        </Routes>
      </Suspense>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <BrowserRouter basename="/board">
          <App />
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
