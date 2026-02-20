import { html, nothing } from "lit";
import type { GatewaySessionRow, SessionsListResult } from "../types.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { t } from "../i18n/index.ts";
import { pathForTab } from "../navigation.ts";
import { formatSessionTokens } from "../presenter.ts";

export type SessionsProps = {
  loading: boolean;
  result: SessionsListResult | null;
  error: string | null;
  activeMinutes: string;
  limit: string;
  includeGlobal: boolean;
  includeUnknown: boolean;
  basePath: string;
  onFiltersChange: (next: {
    activeMinutes: string;
    limit: string;
    includeGlobal: boolean;
    includeUnknown: boolean;
  }) => void;
  onRefresh: () => void;
  onPatch: (
    key: string,
    patch: {
      label?: string | null;
      thinkingLevel?: string | null;
      verboseLevel?: string | null;
      reasoningLevel?: string | null;
    },
  ) => void;
  onDelete: (key: string) => void;
  deleteConfirmKey: string | null;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onSessionClick: (key: string) => void;
};

export function renderSessions(props: SessionsProps) {
  const rows = props.result?.sessions ?? [];
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t('sessions.title')}</div>
          <div class="card-sub">${t('sessions.subtitle')}</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? t('common.loading') : t('common.refresh')}
        </button>
      </div>

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      <div class="muted" style="margin-top: 12px;">
        ${props.result ? t('sessions.store', { path: props.result.path }) : ""}
      </div>

      <div class="table" style="margin-top: 16px;">
        <div class="table-head">
          <div>${t('sessions.colKey')}</div>
          <div>${t('sessions.colLabel')}</div>
          <div>${t('sessions.colKind')}</div>
          <div>${t('sessions.colUpdated')}</div>
          <div>${t('sessions.colTokens')}</div>
          <div>${t('sessions.colActions')}</div>
        </div>
        ${
          rows.length === 0
            ? html`
                <div class="muted">${t('sessions.noSessions')}</div>
              `
            : rows.map((row) =>
                renderRow(row, props.basePath, props.onPatch, props.onDelete, props.onSessionClick, props.loading),
              )
        }
      </div>
    </section>

    ${renderDeleteConfirmDialog(props.deleteConfirmKey, props.onDeleteConfirm, props.onDeleteCancel)}
  `;
}

function renderDeleteConfirmDialog(
  key: string | null,
  onConfirm: () => void,
  onCancel: () => void,
) {
  if (!key) {
    return nothing;
  }
  return html`
    <div class="exec-approval-overlay" role="dialog" aria-modal="true" aria-live="polite" @click=${(e: Event) => {
      if (e.target === e.currentTarget) onCancel();
    }}>
      <div class="exec-approval-card">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">${t('sessions.deleteConfirmTitle')}</div>
            <div class="exec-approval-sub">${t('sessions.deleteConfirmMessage')}</div>
          </div>
        </div>
        <div class="exec-approval-command mono">${key}</div>
        <div class="exec-approval-actions">
          <button class="btn danger" @click=${onConfirm}>
            ${t('common.delete')}
          </button>
          <button class="btn" @click=${onCancel}>
            ${t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderRow(
  row: GatewaySessionRow,
  basePath: string,
  onPatch: SessionsProps["onPatch"],
  onDelete: SessionsProps["onDelete"],
  onSessionClick: SessionsProps["onSessionClick"],
  disabled: boolean,
) {
  const updated = row.updatedAt ? formatRelativeTimestamp(row.updatedAt) : t('common.na');
  const displayName =
    typeof row.displayName === "string" && row.displayName.trim().length > 0
      ? row.displayName.trim()
      : null;
  const label = typeof row.label === "string" ? row.label.trim() : "";
  const showDisplayName = Boolean(displayName && displayName !== row.key && displayName !== label);
  const canLink = row.kind !== "global";
  const chatUrl = canLink
    ? `${pathForTab("chat", basePath)}?session=${encodeURIComponent(row.key)}`
    : null;

  return html`
    <div class="table-row">
      <div class="mono session-key-cell">
        ${canLink ? html`<a href=${chatUrl} class="session-link" @click=${(e: Event) => { e.preventDefault(); onSessionClick(row.key); }}>${row.key}</a>` : row.key}
        ${showDisplayName ? html`<span class="muted session-key-display-name">${displayName}</span>` : nothing}
      </div>
      <div>
        <input
          .value=${row.label ?? ""}
          ?disabled=${disabled}
          placeholder="${t('common.optional')}"
          @change=${(e: Event) => {
            const value = (e.target as HTMLInputElement).value.trim();
            onPatch(row.key, { label: value || null });
          }}
        />
      </div>
      <div>${row.kind}</div>
      <div>${updated}</div>
      <div>${formatSessionTokens(row)}</div>
      <div>
        <button class="btn danger" ?disabled=${disabled} @click=${() => onDelete(row.key)}>
          ${t('common.delete')}
        </button>
      </div>
    </div>
  `;
}
