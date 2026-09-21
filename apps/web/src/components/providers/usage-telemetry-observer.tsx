import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { reportUsageEventBestEffort, type UsageClientType } from '@/lib';
import { getActiveClassId } from '@/lib/session';
import { useClassroomService } from './classroom-system-provider';

interface PageTelemetryContext {
  clientType: UsageClientType;
  module: string;
  auth: 'user' | 'display';
}

function pageTelemetryContext(pathname: string): PageTelemetryContext | null {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return {
      clientType: 'ADMIN_WEB',
      module: pathname.split('/')[2] || 'overview',
      auth: 'user',
    };
  }
  if (pathname === '/teacher' || pathname.startsWith('/teacher/')) {
    return { clientType: 'TEACHER_MOBILE', module: 'teacher', auth: 'user' };
  }
  if (pathname === '/display' || pathname.startsWith('/display/')) {
    return { clientType: 'DISPLAY', module: 'display', auth: 'display' };
  }
  return null;
}

function safeErrorCode(value: unknown): string {
  if (value instanceof Error && value.name) return value.name.slice(0, 100);
  return 'UNHANDLED_CLIENT_ERROR';
}

export function UsageTelemetryObserver() {
  const { pathname } = useLocation();
  const service = useClassroomService();

  useEffect(() => {
    const context = pageTelemetryContext(pathname);
    if (!context || pathname.startsWith('/display')) return;
    void reportUsageEventBestEffort(
      (input, options) => service.reportUsageEvent(input, options),
      {
        eventName: 'page.viewed',
        clientType: context.clientType,
        classId: getActiveClassId() ?? undefined,
        module: context.module,
        page: pathname,
        appVersion: import.meta.env.VITE_APP_VERSION || 'web',
        browser: navigator.userAgent.slice(0, 255),
      },
      { auth: context.auth },
    );
  }, [pathname, service]);

  useEffect(() => {
    const reportError = (errorCode: string) => {
      const context = pageTelemetryContext(window.location.pathname);
      if (!context) return;
      void reportUsageEventBestEffort(
        (input, options) => service.reportUsageEvent(input, options),
        {
          eventName: 'client.unhandled_error',
          clientType: context.clientType,
          classId: context.auth === 'user' ? (getActiveClassId() ?? undefined) : undefined,
          result: 'FAILURE',
          module: 'runtime',
          page: window.location.pathname,
          appVersion: import.meta.env.VITE_APP_VERSION || 'web',
          browser: navigator.userAgent.slice(0, 255),
          errorCode,
        },
        { auth: context.auth },
      );
    };

    const handleError = (event: ErrorEvent) => reportError(safeErrorCode(event.error));
    const handleRejection = (event: PromiseRejectionEvent) =>
      reportError(safeErrorCode(event.reason));
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [service]);

  return null;
}
