import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { SkyDataTableFilterOption, SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import type { MemberStatus, Vendor } from '../../../../api/rbac/vendors';
import {
  DOCUMENTS_LABEL,
  DOCUMENTS_TONE,
  MEMBER_STATUS_LABEL,
  MEMBER_STATUS_TONE,
  REVIEW_FLAG_LABEL,
  documentsChipLabel,
  dueDateLabel,
} from './member-status';

export type MemberSortField = 'businessName' | 'status' | 'documentsDueAt';

export interface MemberTableParams {
  page: number;
  pageSize: number;
  search: string;
  /** Value of the table's Filter select; '' means All. See FILTER_OPTIONS. */
  filter: string;
  sort?: MemberSortField;
  dir: 'asc' | 'desc';
}

/** Table column key to the API sort field. Columns not listed here are not sortable. */
const SORT_FIELD_BY_COLUMN: Record<string, MemberSortField> = {
  'Business Name': 'businessName',
  Status: 'status',
  Due: 'documentsDueAt',
};

/** Lifecycle states staff can filter by. The default list hides Archived (deleted) members; this
 *  filter is where staff find them to restore (item 6). */
export const FILTERABLE_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED'] as const satisfies readonly MemberStatus[];

/** Non-status filter values; members.tsx maps each one to its list query. */
export const DOCUMENTS_FILTER = 'documents';
export const REVIEW_FILTER = 'review';

/** The table's one Filter select, grouped by what it filters on. One choice at a time. */
export const FILTER_OPTIONS: SkyDataTableFilterOption[] = [
  ...FILTERABLE_STATUSES.map((value) => ({ group: 'Status', label: MEMBER_STATUS_LABEL[value], value })),
  { group: 'Documents', label: DOCUMENTS_LABEL.incomplete, value: DOCUMENTS_FILTER },
  { group: 'Review', label: REVIEW_FLAG_LABEL, value: REVIEW_FILTER },
];
const FILTER_OPTIONS_JSON = JSON.stringify(FILTER_OPTIONS);

interface MemberListProps {
  members: Vendor[];
  /** Called with the member id when a row's "Open" action is used. The parent navigates. */
  onSelect: (id: string) => void;
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onParamsChange: (params: MemberTableParams) => void;
}

/** Counts read "5 of 18" when only some items are live, "18" when all are or live is unknown. */
export function formatCount(live: number | undefined, total: number | undefined): string {
  const all = total ?? 0;
  if (live === undefined || live === all) return String(all);
  return `${live} of ${all}`;
}

/** Cell label to tone, built from the same label and tone tables the detail page uses. */
const STATUS_MAP = Object.fromEntries(
  (Object.keys(MEMBER_STATUS_LABEL) as MemberStatus[]).map((status) => [MEMBER_STATUS_LABEL[status], MEMBER_STATUS_TONE[status]]),
);
const DOCUMENTS_MAP = Object.fromEntries(
  (Object.keys(DOCUMENTS_LABEL) as (keyof typeof DOCUMENTS_LABEL)[]).map((state) => [DOCUMENTS_LABEL[state], DOCUMENTS_TONE[state]]),
);

const COLUMNS = JSON.stringify([
  { key: 'Business Name', label: 'Business', sortable: true },
  { key: 'Owner', label: 'Owner' },
  { key: 'Status', label: 'Status', type: 'status', statusStyle: 'tonal', statusMap: STATUS_MAP, sortable: true },
  { key: 'Documents', label: 'Documents', type: 'status', statusStyle: 'tonal', statusMap: DOCUMENTS_MAP },
  { key: 'Due', label: 'Due', sortable: true },
  { key: 'Branch Count', label: 'Branches' },
  { key: 'Deal Count', label: 'Deals' },
  { key: 'Therapist Count', label: 'Therapists' },
  { key: 'Product Count', label: 'Products' },
]);

const ACTIONS = JSON.stringify([{ icon: 'chevron_right', label: 'Open member', event: 'select' }]);

/** Flat row for sky-data-table. 'Member ID' is not a column; the row action reads it. */
function toRow(member: Vendor): Record<string, string | number> {
  const live = member.liveCounts;
  const all = member._count;
  return {
    'Member ID': member.id,
    'Business Name': member.businessName || member.owner?.name || 'New member',
    Owner: member.owner?.name ?? 'Not assigned',
    Status: MEMBER_STATUS_LABEL[member.status] ?? member.status,
    Documents: documentsChipLabel(member.documentsSummary),
    Due: dueDateLabel(member.documentsSummary),
    'Branch Count': formatCount(live?.branches, all?.branches),
    'Deal Count': formatCount(live?.deals, all?.deals),
    'Therapist Count': formatCount(live?.therapists, all?.therapists),
    'Product Count': formatCount(live?.products, all?.products),
  };
}

/** Member list. Presenter only: paging, search and the fetch belong to the parent. */
export function MemberList({ members, onSelect, total, page, pageSize, loading, onParamsChange }: MemberListProps) {
  const tableRef = useRef<HTMLElement>(null);
  const rows = useMemo(() => JSON.stringify(members.map(toRow)), [members]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onParams = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      onParamsChange({
        page: detail.page,
        pageSize: detail.pageSize,
        search: detail.search,
        filter: detail.filter,
        sort: SORT_FIELD_BY_COLUMN[detail.sortKey],
        dir: detail.sortDir === 'desc' ? 'desc' : 'asc',
      });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      if (detail.action !== 'select') return;
      const id = detail.row['Member ID'];
      if (typeof id === 'string' && id) onSelect(id);
    };
    el.addEventListener('sky-dt-params-change', onParams);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParams);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [onParamsChange, onSelect]);

  return (
    <sky-data-table
      ref={tableRef as RefObject<HTMLElement>}
      caption={`Members (${total})`}
      columns={COLUMNS}
      rows={rows}
      total={total}
      page={page}
      page-size={pageSize}
      loading={loading}
      searchable
      search-placeholder="Search members…"
      filter-label="Filter"
      filter-options={FILTER_OPTIONS_JSON}
      actions={ACTIONS}
    />
  );
}

export default MemberList;
