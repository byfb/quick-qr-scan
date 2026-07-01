import { icon } from "../../../shared/ui";

export const scannerWorkspaceMarkup = `
  <main class="app" data-text-select="off">
    <div class="shell">
      <section class="workspace" aria-label="Scanner workspace">
        <div class="primary-column">
          <section class="scanner-panel" aria-label="Camera scanner">
            <div class="camera-stage" data-role="camera-stage" role="button" tabindex="0" aria-label="Start scanner">
              <video data-role="video" playsinline autoplay muted></video>
              <canvas class="overlay" data-role="overlay"></canvas>
              <div class="guide" aria-hidden="true"><span></span></div>
              <div class="camera-empty" data-role="camera-empty">Tap camera view to start.</div>
            </div>
            <div class="camera-toolbar">
              <div class="button-row">
                <button class="btn ghost" data-action="stop" type="button" hidden>Stop Camera</button>
              </div>
              <div class="status-pill" data-role="status">Ready</div>
              <div class="capability-pills" data-role="capabilities"></div>
              <button class="icon-btn history-trigger" data-action="toggle-history" type="button" aria-label="Open recent scans" title="Recent scans">
                ${icon("list")}
              </button>
            </div>
          </section>

          <details class="controls-panel" data-role="camera-controls">
            <summary>Camera controls</summary>
            <div class="controls-grid">
              <label class="control" data-role="zoom-control" hidden>
                Zoom
                <input data-action="zoom" type="range" min="1" max="1" step="0.1" value="1" />
              </label>
              <label class="control" data-role="torch-control" hidden>
                Torch
                <button class="btn ghost" data-action="torch" type="button">Off</button>
              </label>
              <label class="control">
                Decode brightness
                <input data-action="brightness" type="range" min="-40" max="60" step="1" value="0" />
              </label>
              <label class="control">
                Decode contrast
                <input data-action="contrast" type="range" min="0.8" max="1.8" step="0.05" value="1" />
              </label>
              <label class="control toggle-control">
                <span>Auto-open links</span>
                <span class="switch-row">
                  <input data-action="auto-open-links" type="checkbox" />
                  <span>Open http/https scan results automatically after each successful scan.</span>
                </span>
              </label>
              <div class="control">
                Reset
                <button class="btn ghost" data-action="reset-camera" type="button">Reset Camera</button>
              </div>
            </div>
          </details>

          <section class="result-panel" aria-label="Latest result">
            <div class="result-value muted" data-role="result">No result yet.</div>
            <div class="result-meta" data-role="result-meta"></div>
            <div class="result-actions">
              <button class="icon-btn" data-action="copy-selected" type="button" hidden aria-label="Copy selected result" title="Copy">
                ${icon("copy")}
              </button>
              <button class="icon-btn" data-action="open-selected" type="button" hidden aria-label="Open selected result" title="Open">
                ${icon("open")}
              </button>
              <button class="icon-btn" data-action="delete-selected" type="button" hidden aria-label="Delete selected result" title="Delete">
                ${icon("trash")}
              </button>
            </div>
          </section>
        </div>

        <div class="history-edge" data-role="history-edge" data-state="closed" aria-hidden="true"></div>
        <aside class="history-panel" data-role="history-drawer" data-state="closed" aria-label="Recent scans" aria-hidden="true">
          <div class="drawer-actions">
            <button class="icon-btn" data-action="close-history" type="button" aria-label="Close recent scans" title="Close">
              ${icon("close")}
            </button>
            <button class="icon-btn danger" data-action="clear-history" type="button" aria-label="Clear all scans" title="Clear all">
              ${icon("trash")}
            </button>
          </div>
          <div class="history-list" data-role="history"></div>
        </aside>
      </section>
    </div>
    <div data-role="modal-root"></div>
    <canvas class="processing-canvas" data-role="processing"></canvas>
  </main>
`;
