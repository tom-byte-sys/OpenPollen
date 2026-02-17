import { afterEach, beforeEach } from "vitest";
import { HiveAgentApp } from "../app.ts";

// oxlint-disable-next-line typescript/unbound-method
const originalConnect = HiveAgentApp.prototype.connect;

export function mountApp(pathname: string) {
  window.history.replaceState({}, "", pathname);
  const app = document.createElement("hiveagent-app") as HiveAgentApp;
  document.body.append(app);
  return app;
}

export function registerAppMountHooks() {
  beforeEach(() => {
    HiveAgentApp.prototype.connect = () => {
      // no-op: avoid real gateway WS connections in browser tests
    };
    window.__HIVEAGENT_CONTROL_UI_BASE_PATH__ = undefined;
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    HiveAgentApp.prototype.connect = originalConnect;
    window.__HIVEAGENT_CONTROL_UI_BASE_PATH__ = undefined;
    localStorage.clear();
    document.body.innerHTML = "";
  });
}
