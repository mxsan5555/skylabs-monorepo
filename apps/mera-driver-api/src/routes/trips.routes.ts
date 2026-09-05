import { makeStubRouter } from '../lib/stubRouter';

// Stub only — real Trips CRUD is out of scope for this build. Proves the
// `requirePermission('trips', 'view')` gate wires up end to end.
export default makeStubRouter('trips');
