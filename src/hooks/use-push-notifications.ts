import { useState, useEffect } from "react";
import { toast } from "sonner";

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if running on iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(iosDevice);

    // Check if running as installed PWA (Standalone mode)
    const standaloneMode = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    setIsStandalone(standaloneMode);

    // Register Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          setSwRegistration(reg);
        })
        .catch((err) => {
          console.error("Service Worker registration failed:", err);
        });
    }

    // Check notification permission
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  async function requestPermission() {
    if (!("Notification" in window)) {
      toast.error("Notifications are not supported in this browser.");
      return false;
    }

    if (isIOS && !isStandalone) {
      toast.info("On iPhone, tap Share (bottom icon) → 'Add to Home Screen' to enable push notifications.");
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        toast.success("Push notifications enabled!");
        return true;
      } else if (result === "denied") {
        toast.error("Notification permission denied. Enable in device settings.");
        return false;
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to request notification permission.");
    }
    return false;
  }

  async function sendTestNotification(title = "FinorAsset Test Notification", body = "Push notifications are working perfectly on your device! 🎉") {
    if (permission !== "granted") {
      const granted = await requestPermission();
      if (!granted) return;
    }

    try {
      if (swRegistration) {
        await swRegistration.showNotification(title, {
          body,
          icon: "/icon.svg",
          badge: "/icon.svg",
          vibrate: [100, 50, 100],
          data: { url: "/" },
        } as any);
        toast.success("Test push notification sent!");
      } else if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
          body,
          icon: "/icon.svg",
        });
        toast.success("Test notification displayed!");
      }
    } catch (err: any) {
      toast.error(err.message || "Could not trigger test notification.");
    }
  }

  return {
    permission,
    requestPermission,
    sendTestNotification,
    isStandalone,
    isIOS,
    swRegistration,
  };
}
