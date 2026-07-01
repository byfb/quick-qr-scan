import { createScannerApp } from "./create-scanner-app";

const root = document.querySelector<HTMLElement>("[data-role='scanner-root']");

if (root) {
  createScannerApp(root);
}
