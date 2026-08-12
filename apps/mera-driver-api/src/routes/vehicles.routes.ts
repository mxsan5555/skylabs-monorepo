import { makeStubRouter } from '../lib/stubRouter';

// Stub only — real Vehicles CRUD is out of scope for this build. Proves the
// `requirePermission('vehicles', 'view')` gate wires up end to end.
export default makeStubRouter('vehicles');
