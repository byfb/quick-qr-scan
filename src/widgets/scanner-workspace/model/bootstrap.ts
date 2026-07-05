import { createScannerApp } from "./create-scanner-app";
import { setupPwaControls } from "../../../features/pwa-update";

const root = document.querySelector<HTMLElement>("[data-role='scanner-root']");

if (root) {
  createScannerApp(root);
  void setupPwaControls(root);
}
