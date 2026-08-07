import { makeStubRouter } from '../lib/stubRouter';

// Stub only — real Payments CRUD is out of scope for this build. Proves the
// `requirePermission('payments', 'view')` gate wires up end to end.
export default makeStubRouter('payments');
