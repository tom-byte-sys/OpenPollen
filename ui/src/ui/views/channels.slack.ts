import { html, nothing } from "lit";
import type { SlackStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import { t } from "../i18n/index.ts";

export function renderSlackCard(params: {
  props: ChannelsProps;
  slack?: SlackStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, slack, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t('channels.slack.title')}</div>
      <div class="card-sub">${t('channels.slack.sub')}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t('channels.configuredLabel')}</span>
          <span>${slack?.configured ? t('common.yes') : t('common.no')}</span>
        </div>
        <div>
          <span class="label">${t('channels.runningLabel')}</span>
          <span>${slack?.running ? t('common.yes') : t('common.no')}</span>
        </div>
        <div>
          <span class="label">${t('channels.lastStart')}</span>
          <span>${slack?.lastStartAt ? formatRelativeTimestamp(slack.lastStartAt) : t('common.na')}</span>
        </div>
        <div>
          <span class="label">${t('channels.lastProbe')}</span>
          <span>${slack?.lastProbeAt ? formatRelativeTimestamp(slack.lastProbeAt) : t('common.na')}</span>
        </div>
      </div>

      ${
        slack?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${slack.lastError}
          </div>`
          : nothing
      }

      ${
        slack?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t('channels.probeButton')} ${slack.probe.ok ? t('channels.probeOk') : t('channels.probeFailed')} ·
            ${slack.probe.status ?? ""} ${slack.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "slack", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t('channels.probeButton')}
        </button>
      </div>
    </div>
  `;
}
