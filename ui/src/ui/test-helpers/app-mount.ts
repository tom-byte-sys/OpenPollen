import { afterEach, beforeEach } from "vitest";
import { OpenPollenApp } from "../app.ts";

// oxlint-disable-next-line typescript/unbound-method
const originalConnect = OpenPollenApp.prototype.connect;

export function mountApp(pathname: string) {
  window.history.replaceState({}, "", pathname);
  const app = document.createElement("openpollen-app") as OpenPollenApp;
  document.body.append(app);
  return app;
}

export function registerAppMountHooks() {
  beforeEach(() => {
    OpenPollenApp.prototype.connect = () => {
      // no-op: avoid real gateway WS connections in browser tests
    };
    window.__OPENPOLLEN_CONTROL_UI_BASE_PATH__ = undefined;
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    OpenPollenApp.prototype.connect = originalConnect;
    window.__OPENPOLLEN_CONTROL_UI_BASE_PATH__ = undefined;
    localStorage.clear();
    document.body.innerHTML = "";
  });
}
