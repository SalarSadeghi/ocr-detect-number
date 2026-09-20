import { useEffect, useState } from 'react';

export function OfflineStatus() {
  const [message, setMessage] = useState('در حال آماده‌سازی استفادهٔ آفلاین…');

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let disposed = false;
    const show = (text: string) => { if (!disposed) setMessage(text); };
    if (!('serviceWorker' in navigator)) {
      show('ذخیرهٔ آفلاین در این مرورگر در دسترس نیست.');
      return;
    }
    const ready = (worker: ServiceWorker) => {
      // Older workers did not cache OCR; activation alone is not proof of readiness.
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => channel.port1.close(), 5000);
      channel.port1.onmessage = (event: MessageEvent<boolean>) => {
        window.clearTimeout(timeout);
        channel.port1.close();
        show(event.data
          ? 'آمادهٔ استفادهٔ آفلاین؛ می‌توانید اینترنت را قطع کنید.'
          : 'فایل‌های آفلاین کامل نیستند؛ با اتصال اینترنت برنامه را دوباره آماده کنید.');
      };
      worker.postMessage('CHECK_OFFLINE_READY', [channel.port2]);
    };
    const watch = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const changed = () => {
        if (worker.state === 'activated') ready(worker);
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          show('نسخهٔ جدید آماده است؛ برای اجرای آن همهٔ پنجره‌های برنامه را ببندید و دوباره باز کنید.');
        }
        if (worker.state === 'redundant') {
          show('آماده‌سازی آفلاین کامل نشد؛ اتصال و فضای دستگاه را بررسی و صفحه را تازه کنید.');
        }
      };
      worker.addEventListener('statechange', changed);
      changed();
    };
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: 'none',
    }).then((registration) => {
      if (registration.active?.state === 'activated') ready(registration.active);
      watch(registration.installing ?? registration.waiting);
      registration.addEventListener('updatefound', () => watch(registration.installing));
    }).catch(() => show('آماده‌سازی آفلاین انجام نشد؛ با اتصال اینترنت صفحه را دوباره باز کنید.'));
    return () => { disposed = true; };
  }, []);

  if (!import.meta.env.PROD) return null;
  return <p className="privacy-note" role="status">{message}</p>;
}

