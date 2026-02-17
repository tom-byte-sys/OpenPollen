import { html, nothing } from "lit";
import type { WhatsAppStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatRelativeTimestamp, formatDurationHuman } from "../format.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import { t } from "../i18n/index.ts";

export function renderWhatsAppCard(params: {
  props: ChannelsProps;
  whatsapp?: WhatsAppStatus;
  accountCountLabel: unknown;
}) {
  const { props, whatsapp, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t('channels.whatsapp.title')}</div>
      <div class="card-sub">${t('channels.whatsapp.sub')}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t('channels.configuredLabel')}</span>
          <span>${whatsapp?.configured ? t('common.yes') : t('common.no')}</span>
        </div>
        <div>
          <span class="label">${t('channels.linkedLabel')}</span>
          <span>${whatsapp?.linked ? t('common.yes') : t('common.no')}</span>
        </div>
        <div>
          <span class="label">${t('channels.runningLabel')}</span>
          <span>${whatsapp?.running ? t('common.yes') : t('common.no')}</span>
        </div>
        <div>
          <span class="label">${t('common.connected')}</span>
          <span>${whatsapp?.connected ? t('common.yes') : t('common.no')}</span>
        </div>
        <div>
          <span class="label">${t('channels.lastConnectLabel')}</span>
          <span>
            ${whatsapp?.lastConnectedAt ? formatRelativeTimestamp(whatsapp.lastConnectedAt) : t('common.na')}
          </span>
        </div>
        <div>
          <span class="label">${t('channels.lastMessageLabel')}</span>
          <span>
            ${whatsapp?.lastMessageAt ? formatRelativeTimestamp(whatsapp.lastMessageAt) : t('common.na')}
          </span>
        </div>
        <div>
          <span class="label">${t('channels.authAgeLabel')}</span>
          <span>
            ${whatsapp?.authAgeMs != null ? formatDurationHuman(whatsapp.authAgeMs) : t('common.na')}
          </span>
        </div>
      </div>

      ${
        whatsapp?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${whatsapp.lastError}
          </div>`
          : nothing
      }

      ${
        props.whatsappMessage
          ? html`<div class="callout" style="margin-top: 12px;">
            ${props.whatsappMessage}
          </div>`
          : nothing
      }

      ${
        props.whatsappQrDataUrl
          ? html`<div class="qr-wrap">
            <img src=${props.whatsappQrDataUrl} alt="WhatsApp QR" />
          </div>`
          : nothing
      }

      <div class="row" style="margin-top: 14px; flex-wrap: wrap;">
        <button
          class="btn primary"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppStart(false)}
        >
          ${props.whatsappBusy ? t('channels.whatsapp.working') : t('channels.whatsapp.showQr')}
        </button>
        <button
          class="btn"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppStart(true)}
        >
          ${t('channels.whatsapp.relink')}
        </button>
        <button
          class="btn"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppWait()}
        >
          ${t('channels.whatsapp.waitForScan')}
        </button>
        <button
          class="btn danger"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppLogout()}
        >
          ${t('channels.whatsapp.logout')}
        </button>
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t('common.refresh')}
        </button>
      </div>

      ${renderChannelConfigSection({ channelId: "whatsapp", props })}
    </div>
  `;
}
