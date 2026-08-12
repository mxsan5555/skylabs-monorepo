import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import type { SkyDataTableAction, SkyDataTableColumn, SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { RbacApiService } from '../../../../core/rbac/rbac-api.service';

interface AuditLogRow {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: string;
  after: string;
  createdAt: string;
}

const COLUMNS: SkyDataTableColumn[] = [
  { key: 'createdAt', label: 'When', sortable: true },
  { key: 'actorUserId', label: 'Actor' },
  { key: 'action', label: 'Action' },
  { key: 'targetType', label: 'Target type' },
  { key: 'targetId', label: 'Target ID' },
];

const ACTIONS: SkyDataTableAction[] = [
  { icon: 'visibility', label: 'View details', event: '__view_detail__' },
];

/**
 * Audit Logs (`/account/administration/audit-logs`): `GET /rbac/audit-logs`
 * with real server-side pagination and an optional `targetUserId` filter
 * (matches the route's actual query params — see `rbac.routes.ts`). Row
 * "View details" opens `sky-data-table`'s built-in detail drawer, which shows
 * every field of the row (including the pre-stringified before/after JSON).
 */
@Component({
  selector: 'md-administration-audit-logs',
  imports: [AdminPage],
  templateUrl: './audit-logs.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AdministrationAuditLogs {
  private readonly rbac = inject(RbacApiService);

  protected readonly rows = signal<AuditLogRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected targetUserId = '';
  private appliedTargetUserId = '';

  protected readonly columnsJson = JSON.stringify(COLUMNS);
  protected readonly actionsJson = JSON.stringify(ACTIONS);
  protected readonly rowsJson = computed(() => JSON.stringify(this.rows()));

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.rbac.auditLogs(this.appliedTargetUserId || undefined, this.page(), this.pageSize()).subscribe({
      next: (res) => {
        this.rows.set(
          res.items.map((e) => ({
            actorUserId: e.actorUserId,
            action: e.action,
            targetType: e.targetType,
            targetId: e.targetId,
            before: e.before ? JSON.stringify(e.before) : '—',
            after: e.after ? JSON.stringify(e.after) : '—',
            createdAt: e.createdAt,
          })),
        );
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Could not load audit logs.');
      },
    });
  }

  protected onParamsChange(event: Event): void {
    const detail = (event as CustomEvent<SkyDataTableParamsDetail>).detail;
    this.page.set(detail.page);
    this.pageSize.set(detail.pageSize);
    this.load();
  }

  protected applyTargetUserFilter(): void {
    this.appliedTargetUserId = this.targetUserId.trim();
    this.page.set(1);
    this.load();
  }

  protected clearTargetUserFilter(): void {
    this.targetUserId = '';
    this.appliedTargetUserId = '';
    this.page.set(1);
    this.load();
  }
}
