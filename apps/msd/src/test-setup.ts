import { configure } from '@testing-library/react';

// CI runners are far slower than a dev machine; the default 1 s wait fails tests that are correct.
configure({ asyncUtilTimeout: 5000 });
