import { describe, expect, it, vi } from "vitest";
import { setupPwaControls } from "./pwa-controls";

function createRoot(): HTMLDivElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <div data-role="offline-status"></div>
    <button data-action="refresh-app" type="button"></button>
  `;
  return root;
}

describe("PWA controls", () => {
  it("shows offline cache unavailable when service workers are missing", async () => {
    const root = createRoot();

    await setupPwaControls(root, { serviceWorker: undefined });

    expect(root.querySelector("[data-role='offline-status']")?.textContent).toBe("Offline cache unavailable");
    expect(root.querySelector<HTMLButtonElement>("[data-action='refresh-app']")?.disabled).toBe(true);
  });

  it("registers the service worker and reports offline readiness", async () => {
    const root = createRoot();
    const register = vi.fn().mockResolvedValue({ active: {}, update: vi.fn() });

    await setupPwaControls(root, {
      serviceWorker: {
        register,
        addEventListener: vi.fn(),
      } as unknown as ServiceWorkerContainer,
    });

    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(root.querySelector("[data-role='offline-status']")?.textContent).toBe("Offline ready");
    expect(root.querySelector<HTMLButtonElement>("[data-action='refresh-app']")?.disabled).toBe(false);
  });

  it("forces a waiting update to activate from the refresh button", async () => {
    const root = createRoot();
    const postMessage = vi.fn();
    const update = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue({
      waiting: { postMessage },
      update,
    });

    await setupPwaControls(root, {
      serviceWorker: {
        register,
        addEventListener: vi.fn(),
      } as unknown as ServiceWorkerContainer,
    });

    root.querySelector<HTMLButtonElement>("[data-action='refresh-app']")?.click();
    await Promise.resolve();

    expect(update).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(root.querySelector("[data-role='offline-status']")?.textContent).toBe("Applying update");
  });
});
