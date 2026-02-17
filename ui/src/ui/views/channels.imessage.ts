import { html, nothing } from "lit";
import type { IMessageStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import { t } from "../i18n/index.ts";

export function renderIMessageCard(params: {
  props: ChannelsProps;
  imessage?: IMessageStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, imessage, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t('channels.imessage.title')}</div>
      <div class="card-sub">${t('channels.imessage.sub')}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t('channels.configuredLabel')}</span>
          <span>${imessage?.configured ? t('common.yes') : t('common.no')}</span>
        </div>
        <div>
          <span class="label">${t('channels.runningLabel')}</span>
          <span>${imessage?.running ? t('common.yes') : t('common.no')}</span>
        </div>
        <div>
          <span class="label">${t('channels.lastStart')}</span>
          <span>${imessage?.lastStartAt ? formatRelativeTimestamp(imessage.lastStartAt) : t('common.na')}</span>
        </div>
        <div>
          <span class="label">${t('channels.lastProbe')}</span>
          <span>${imessage?.lastProbeAt ? formatRelativeTimestamp(imessage.lastProbeAt) : t('common.na')}</span>
        </div>
      </div>

      ${
        imessage?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${imessage.lastError}
          </div>`
          : nothing
      }

      ${
        imessage?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t('channels.probeButton')} ${imessage.probe.ok ? t('channels.probeOk') : t('channels.probeFailed')} ·
            ${imessage.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "imessage", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t('channels.probeButton')}
        </button>
      </div>
    </div>
  `;
}
