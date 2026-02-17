import { html, nothing } from "lit";
import type { DiscordStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import { t } from "../i18n/index.ts";

export function renderDiscordCard(params: {
  props: ChannelsProps;
  discord?: DiscordStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, discord, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t('channels.discord.title')}</div>
      <div class="card-sub">${t('channels.discord.sub')}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t('channels.configuredLabel')}</span>
          <span>${discord?.configured ? t('common.yes') : t('common.no')}</span>
        </div>
        <div>
          <span class="label">${t('channels.runningLabel')}</span>
          <span>${discord?.running ? t('common.yes') : t('common.no')}</span>
        </div>
        <div>
          <span class="label">${t('channels.lastStart')}</span>
          <span>${discord?.lastStartAt ? formatRelativeTimestamp(discord.lastStartAt) : t('common.na')}</span>
        </div>
        <div>
          <span class="label">${t('channels.lastProbe')}</span>
          <span>${discord?.lastProbeAt ? formatRelativeTimestamp(discord.lastProbeAt) : t('common.na')}</span>
        </div>
      </div>

      ${
        discord?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${discord.lastError}
          </div>`
          : nothing
      }

      ${
        discord?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t('channels.probeButton')} ${discord.probe.ok ? t('channels.probeOk') : t('channels.probeFailed')} ·
            ${discord.probe.status ?? ""} ${discord.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "discord", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t('channels.probeButton')}
        </button>
      </div>
    </div>
  `;
}
