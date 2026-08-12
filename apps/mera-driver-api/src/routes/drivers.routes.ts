import { makeStubRouter } from '../lib/stubRouter';

// Stub only — real Drivers CRUD is out of scope for this build. Proves the
// `requirePermission('drivers', 'view')` gate wires up end to end.
export default makeStubRouter('drivers');
