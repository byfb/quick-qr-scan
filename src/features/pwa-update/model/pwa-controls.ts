interface PwaControlsDependencies {
  serviceWorker?: Pick<ServiceWorkerContainer, "register" | "addEventListener">;
  reload?: () => void;
  scriptUrl?: string;
}

interface PwaRegistration {
  active?: ServiceWorker | object | null;
  installing?: ServiceWorker | null;
  waiting?: Pick<ServiceWorker, "postMessage"> | null;
  update?: () => Promise<unknown>;
  addEventListener?: ServiceWorkerRegistration["addEventListener"];
}

export async function setupPwaControls(root: HTMLElement, dependencies: PwaControlsDependencies = {}): Promise<void> {
  const status = root.querySelector<HTMLElement>("[data-role='offline-status']");
  const refreshButton = root.querySelector<HTMLButtonElement>("[data-action='refresh-app']");
  const serviceWorker = dependencies.serviceWorker ?? globalThis.navigator?.serviceWorker;
  const scriptUrl = dependencies.scriptUrl ?? "/sw.js";

  const setStatus = (message: string): void => {
    if (status) {
      status.textContent = message;
    }
  };

  const setRefreshEnabled = (enabled: boolean): void => {
    if (refreshButton) {
      refreshButton.disabled = !enabled;
    }
  };

  if (!serviceWorker) {
    setStatus("Offline cache unavailable");
    setRefreshEnabled(false);
    return;
  }

  let didReload = false;
  serviceWorker.addEventListener?.("controllerchange", () => {
    if (didReload) {
      return;
    }
    didReload = true;
    const reload = dependencies.reload ?? (() => globalThis.location.reload());
    reload();
  });

  let registration: PwaRegistration;
  try {
    registration = (await serviceWorker.register(scriptUrl)) as PwaRegistration;
  } catch {
    setStatus("Offline cache unavailable");
    setRefreshEnabled(false);
    return;
  }

  setRefreshEnabled(true);
  setStatus(registration.waiting ? "Update ready" : "Offline ready");

  watchInstallingWorker(registration, setStatus);
  registration.addEventListener?.("updatefound", () => {
    watchInstallingWorker(registration, setStatus);
  });

  refreshButton?.addEventListener("click", () => {
    void refreshApp(registration, setStatus, setRefreshEnabled);
  });
}

async function refreshApp(
  registration: PwaRegistration,
  setStatus: (message: string) => void,
  setRefreshEnabled: (enabled: boolean) => void,
): Promise<void> {
  setStatus("Checking for update");
  setRefreshEnabled(false);

  const updatePromise = registration.update?.().catch(() => undefined);
  if (activateWaitingWorker(registration, setStatus)) {
    return;
  }

  await updatePromise;
  if (activateWaitingWorker(registration, setStatus)) {
    return;
  }

  setStatus("Offline ready");
  setRefreshEnabled(true);
}

function watchInstallingWorker(registration: PwaRegistration, setStatus: (message: string) => void): void {
  const worker = registration.installing;
  if (!worker) {
    return;
  }

  setStatus("Saving offline app");
  worker.addEventListener?.("statechange", () => {
    if (worker.state === "installed") {
      setStatus(registration.waiting ? "Update ready" : "Offline ready");
    }
  });
}

function activateWaitingWorker(registration: PwaRegistration, setStatus: (message: string) => void): boolean {
  if (!registration.waiting) {
    return false;
  }

  setStatus("Applying update");
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
  return true;
}
