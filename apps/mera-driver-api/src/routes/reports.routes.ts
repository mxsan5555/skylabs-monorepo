import { makeStubRouter } from '../lib/stubRouter';

// Stub only — real Reports CRUD is out of scope for this build. Proves the
// `requirePermission('reports', 'view')` gate wires up end to end.
export default makeStubRouter('reports');
