import { html, nothing } from "lit";
import type { GoogleChatStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import { t } from "../i18n/index.ts";

export function renderGoogleChatCard(params: {
  props: ChannelsProps;
  googleChat?: GoogleChatStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, googleChat, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t('channels.googlechat.title')}</div>
      <div class="card-sub">${t('channels.googlechat.sub')}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t('channels.configuredLabel')}</span>
          <span>${googleChat ? (googleChat.configured ? t('common.yes') : t('common.no')) : t('common.na')}</span>
        </div>
        <div>
          <span class="label">${t('channels.runningLabel')}</span>
          <span>${googleChat ? (googleChat.running ? t('common.yes') : t('common.no')) : t('common.na')}</span>
        </div>
        <div>
          <span class="label">${t('channels.googlechat.credential')}</span>
          <span>${googleChat?.credentialSource ?? t('common.na')}</span>
        </div>
        <div>
          <span class="label">${t('channels.googlechat.audience')}</span>
          <span>
            ${
              googleChat?.audienceType
                ? `${googleChat.audienceType}${googleChat.audience ? ` · ${googleChat.audience}` : ""}`
                : t('common.na')
            }
          </span>
        </div>
        <div>
          <span class="label">${t('channels.lastStart')}</span>
          <span>${googleChat?.lastStartAt ? formatRelativeTimestamp(googleChat.lastStartAt) : t('common.na')}</span>
        </div>
        <div>
          <span class="label">${t('channels.lastProbe')}</span>
          <span>${googleChat?.lastProbeAt ? formatRelativeTimestamp(googleChat.lastProbeAt) : t('common.na')}</span>
        </div>
      </div>

      ${
        googleChat?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${googleChat.lastError}
          </div>`
          : nothing
      }

      ${
        googleChat?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t('channels.probeButton')} ${googleChat.probe.ok ? t('channels.probeOk') : t('channels.probeFailed')} ·
            ${googleChat.probe.status ?? ""} ${googleChat.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "googlechat", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t('channels.probeButton')}
        </button>
      </div>
    </div>
  `;
}
