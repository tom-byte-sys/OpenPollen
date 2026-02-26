import { html } from "lit";
import type { GatewayHelloOk } from "../gateway.ts";
import type { UiSettings } from "../storage.ts";
import { formatRelativeTimestamp, formatDurationHuman } from "../format.ts";
import { t } from "../i18n/index.ts";
import { formatNextRun } from "../presenter.ts";

export type OverviewProps = {
  connected: boolean;
  hello: GatewayHelloOk | null;
  settings: UiSettings;
  password: string;
  lastError: string | null;
  presenceCount: number;
  sessionsCount: number | null;
  cronEnabled: boolean | null;
  cronNext: number | null;
  lastChannelsRefresh: number | null;
  onSettingsChange: (next: UiSettings) => void;
  onPasswordChange: (next: string) => void;
  onSessionKeyChange: (next: string) => void;
  onConnect: () => void;
  onRefresh: () => void;
};

export function renderOverview(props: OverviewProps) {
  const snapshot = props.hello?.snapshot as
    | {
        uptimeMs?: number;
        policy?: { tickIntervalMs?: number };
        authMode?: "none" | "token" | "password" | "trusted-proxy";
      }
    | undefined;
  const uptime = snapshot?.uptimeMs ? formatDurationHuman(snapshot.uptimeMs) : t('common.na');
  const tick = snapshot?.policy?.tickIntervalMs ? `${snapshot.policy.tickIntervalMs}ms` : t('common.na');
  const authMode = snapshot?.authMode;
  const isTrustedProxy = authMode === "trusted-proxy";
  const authHint = (() => {
    if (props.connected || !props.lastError) {
      return null;
    }
    const lower = props.lastError.toLowerCase();
    const authFailed = lower.includes("unauthorized") || lower.includes("connect failed");
    if (!authFailed) {
      return null;
    }
    const hasToken = Boolean(props.settings.token.trim());
    const hasPassword = Boolean(props.password.trim());
    if (!hasToken && !hasPassword) {
      return html`
        <div class="muted" style="margin-top: 8px">
          ${t('overview.authRequired')}
          <div style="margin-top: 6px">
            <span class="mono">openpollen dashboard --no-open</span> → ${t('overview.openControlUi')}<br />
            <span class="mono">openpollen doctor --generate-gateway-token</span> → ${t('overview.setToken')}
          </div>
          <div style="margin-top: 6px">
            <a
              class="session-link"
              href="https://github.com/anthropics/openpollen/web/dashboard"
              target="_blank"
              rel="noreferrer"
              title="${t('overview.docsControlUiAuth')}"
              >${t('overview.docsControlUiAuth')}</a
            >
          </div>
        </div>
      `;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t('overview.authFailed')}
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://github.com/anthropics/openpollen/web/dashboard"
            target="_blank"
            rel="noreferrer"
            title="${t('overview.docsControlUiAuth')}"
            >${t('overview.docsControlUiAuth')}</a
          >
        </div>
      </div>
    `;
  })();
  const insecureContextHint = (() => {
    if (props.connected || !props.lastError) {
      return null;
    }
    const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : true;
    if (isSecureContext) {
      return null;
    }
    const lower = props.lastError.toLowerCase();
    if (!lower.includes("secure context") && !lower.includes("device identity required")) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t('overview.insecureContext')}
        <span class="mono">http://127.0.0.1:18789</span> ${t('overview.insecureContextHttp')}
        <div style="margin-top: 6px">
          ${t('overview.insecureContextWorkaround')}
          <span class="mono">gateway.controlUi.allowInsecureAuth: true</span> (token-only).
        </div>
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://github.com/anthropics/openpollen/gateway/tailscale"
            target="_blank"
            rel="noreferrer"
            title="${t('overview.docsTailscale')}"
            >${t('overview.docsTailscale')}</a
          >
          <span class="muted"> · </span>
          <a
            class="session-link"
            href="https://github.com/anthropics/openpollen/web/control-ui#insecure-http"
            target="_blank"
            rel="noreferrer"
            title="${t('overview.docsInsecureHttp')}"
            >${t('overview.docsInsecureHttp')}</a
          >
        </div>
      </div>
    `;
  })();

  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">${t('overview.gatewayAccess')}</div>
        <div class="card-sub">${t('overview.gatewayAccessSub')}</div>
        <div class="form-grid" style="margin-top: 16px;">
          <label class="field">
            <span>${t('overview.wsUrl')}</span>
            <input
              .value=${props.settings.gatewayUrl}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSettingsChange({ ...props.settings, gatewayUrl: v });
              }}
              placeholder="ws://100.x.y.z:18789"
            />
          </label>
          ${
            isTrustedProxy
              ? ""
              : html`
                <label class="field">
                  <span>${t('overview.gatewayToken')}</span>
                  <input
                    .value=${props.settings.token}
                    @input=${(e: Event) => {
                      const v = (e.target as HTMLInputElement).value;
                      props.onSettingsChange({ ...props.settings, token: v });
                    }}
                    placeholder="OPENPOLLEN_GATEWAY_TOKEN"
                  />
                </label>
                <label class="field">
                  <span>${t('overview.password')}</span>
                  <input
                    type="password"
                    .value=${props.password}
                    @input=${(e: Event) => {
                      const v = (e.target as HTMLInputElement).value;
                      props.onPasswordChange(v);
                    }}
                    placeholder="${t('overview.passwordPlaceholder')}"
                  />
                </label>
              `
          }
          <label class="field">
            <span>${t('overview.defaultSessionKey')}</span>
            <input
              .value=${props.settings.sessionKey}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSessionKeyChange(v);
              }}
            />
          </label>
        </div>
        <div class="row" style="margin-top: 14px;">
          <button class="btn" @click=${() => props.onConnect()}>${t('common.connect')}</button>
          <button class="btn" @click=${() => props.onRefresh()}>${t('common.refresh')}</button>
          <span class="muted">${isTrustedProxy ? t('overview.trustedProxy') : t('overview.connectApply')}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">${t('overview.snapshot')}</div>
        <div class="card-sub">${t('overview.snapshotSub')}</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">${t('overview.status')}</div>
            <div class="stat-value ${props.connected ? "ok" : "warn"}">
              ${props.connected ? t('common.connected') : t('common.disconnected')}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">${t('overview.uptime')}</div>
            <div class="stat-value">${uptime}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t('overview.tickInterval')}</div>
            <div class="stat-value">${tick}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t('overview.lastChannelsRefresh')}</div>
            <div class="stat-value">
              ${props.lastChannelsRefresh ? formatRelativeTimestamp(props.lastChannelsRefresh) : t('common.na')}
            </div>
          </div>
        </div>
        ${
          props.lastError
            ? html`<div class="callout danger" style="margin-top: 14px;">
              <div>${props.lastError}</div>
              ${authHint ?? ""}
              ${insecureContextHint ?? ""}
            </div>`
            : html`
                <div class="callout" style="margin-top: 14px">
                  ${t('overview.channelsCta')}
                </div>
              `
        }
      </div>
    </section>

    <section class="grid grid-cols-3" style="margin-top: 18px;">
      <div class="card stat-card">
        <div class="stat-label">${t('overview.instances')}</div>
        <div class="stat-value">${props.presenceCount}</div>
        <div class="muted">${t('overview.instancesSub')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t('overview.sessions')}</div>
        <div class="stat-value">${props.sessionsCount ?? t('common.na')}</div>
        <div class="muted">${t('overview.sessionsSub')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t('overview.cron')}</div>
        <div class="stat-value">
          ${props.cronEnabled == null ? t('common.na') : props.cronEnabled ? t('common.enabled') : t('common.disabled')}
        </div>
        <div class="muted">${t('overview.cronNext')} ${formatNextRun(props.cronNext)}</div>
      </div>
    </section>

    <!-- Notes section hidden: Tailscale/Session/Cron features not yet implemented -->
  `;
}
