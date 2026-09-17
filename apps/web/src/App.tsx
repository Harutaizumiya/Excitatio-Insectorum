import type { ReactElement } from "react";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { App as AntApp, Spin } from "antd";
import { ClassroomSystemProvider } from "@/components/providers/classroom-system-provider";
import { UsageTelemetryObserver } from "@/components/providers/usage-telemetry-observer";
import { Toaster } from "@/components/ui/sonner";
import { getActiveClassId, getUserSession } from "@/lib/session";

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

function RequireAdminSession({ children }: { children: ReactElement }): ReactElement {
  if (!getUserSession() || !getActiveClassId()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AdminRoute({ children }: { children: ReactElement }): ReactElement {
  return (
    <RequireAdminSession>
      <AdminShell>{children}</AdminShell>
    </RequireAdminSession>
  );
}

export function App(): ReactElement {
  return (
    <BrowserRouter>
      <AntApp>
        <ClassroomSystemProvider>
          <UsageTelemetryObserver />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/login" element={<LoginPage />} />

              {/* Admin Shell Routes */}
              <Route path="/admin" element={<AdminRoute><AdminPage route="overview" /></AdminRoute>} />
              <Route path="/admin/students/committee" element={<AdminRoute><AdminPage route="students-committee" /></AdminRoute>} />
              <Route path="/admin/students" element={<AdminRoute><AdminPage route="students" /></AdminRoute>} />
              <Route path="/admin/seating" element={<AdminRoute><AdminPage route="seating" /></AdminRoute>} />
              <Route path="/admin/schedule" element={<AdminRoute><AdminPage route="schedule" /></AdminRoute>} />
              <Route path="/admin/teachers" element={<AdminRoute><AdminPage route="teachers" /></AdminRoute>} />
              <Route path="/admin/score-rules" element={<AdminRoute><AdminPage route="score-rules" /></AdminRoute>} />
              <Route path="/admin/score-records" element={<AdminRoute><AdminPage route="score-records" /></AdminRoute>} />
              <Route path="/admin/display-devices" element={<AdminRoute><AdminPage route="display-devices" /></AdminRoute>} />
              <Route path="/admin/feedback" element={<RequireAdminSession><Navigate to="/admin" replace /></RequireAdminSession>} />
              <Route path="/admin/analytics" element={<RequireAdminSession><Navigate to="/admin" replace /></RequireAdminSession>} />

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
