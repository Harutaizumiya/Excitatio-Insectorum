import type { ReactElement } from "react";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import { App as AntApp, Spin } from "antd";
import { ClassroomSystemProvider } from "@/components/providers/classroom-system-provider";
import { Toaster } from "@/components/ui/sonner";

// Lazy-loaded Pages & Layouts
const HomeRedirect = lazy(() => import("@/features/classroom/home-redirect").then((m) => ({ default: m.HomeRedirect })));
const LoginPage = lazy(() => import("@/pages/login-page"));
const NotFound = lazy(() => import("@/pages/not-found"));
const AdminShell = lazy(() => import("@/features/admin/admin-shell").then((m) => ({ default: m.AdminShell })));
const AdminPage = lazy(() => import("@/features/admin/admin-pages").then((m) => ({ default: m.AdminPage })));
const TeacherSurface = lazy(() => import("@/features/classroom/teacher-surface").then((m) => ({ default: m.TeacherSurface })));
const TeacherHistorySurface = lazy(() => import("@/features/classroom/teacher-surface").then((m) => ({ default: m.TeacherHistorySurface })));
const DisplaySurface = lazy(() => import("@/features/classroom/display-surface").then((m) => ({ default: m.DisplaySurface })));
const DisplayBindSurface = lazy(() => import("@/features/classroom/display-bind-surface").then((m) => ({ default: m.DisplayBindSurface })));
const InviteQuerySurface = lazy(() => import("@/features/classroom/invite-query-surface").then((m) => ({ default: m.InviteQuerySurface })));
const InviteSurface = lazy(() => import("@/features/classroom/invite-surface").then((m) => ({ default: m.InviteSurface })));

function RouteLoading(): ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
      <Spin size="large" />
    </div>
  );
}

function InviteParamRoute(): ReactElement {
  const { token } = useParams<{ token: string }>();
  return <InviteSurface token={token ?? ""} />;
}

export function App(): ReactElement {
  return (
    <BrowserRouter>
      <AntApp>
        <ClassroomSystemProvider>
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/login" element={<LoginPage />} />

              {/* Admin Shell Routes */}
              <Route path="/admin" element={<AdminShell><AdminPage route="overview" /></AdminShell>} />
              <Route path="/admin/students" element={<AdminShell><AdminPage route="students" /></AdminShell>} />
              <Route path="/admin/seating" element={<AdminShell><AdminPage route="seating" /></AdminShell>} />
              <Route path="/admin/schedule" element={<AdminShell><AdminPage route="schedule" /></AdminShell>} />
              <Route path="/admin/teachers" element={<AdminShell><AdminPage route="teachers" /></AdminShell>} />
              <Route path="/admin/score-rules" element={<AdminShell><AdminPage route="score-rules" /></AdminShell>} />
              <Route path="/admin/score-records" element={<AdminShell><AdminPage route="score-records" /></AdminShell>} />
              <Route path="/admin/display-devices" element={<AdminShell><AdminPage route="display-devices" /></AdminShell>} />

              {/* Teacher Routes */}
              <Route path="/teacher" element={<TeacherSurface />} />
              <Route path="/teacher/history" element={<TeacherHistorySurface />} />

              {/* Display Routes */}
              <Route path="/display" element={<DisplaySurface />} />
              <Route path="/display/bind" element={<DisplayBindSurface />} />

              {/* Invite Routes */}
              <Route path="/invite" element={<InviteQuerySurface />} />
              <Route path="/invite/:token" element={<InviteParamRoute />} />

              {/* 404 Fallback */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <Toaster richColors position="top-center" />
        </ClassroomSystemProvider>
      </AntApp>
    </BrowserRouter>
  );
}

export default App;
