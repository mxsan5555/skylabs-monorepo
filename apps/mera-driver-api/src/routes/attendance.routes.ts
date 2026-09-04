import { makeStubRouter } from '../lib/stubRouter';

// Stub only — real Attendance CRUD is out of scope for this build. Proves the
// `requirePermission('attendance', 'view')` gate wires up end to end.
export default makeStubRouter('attendance');
