// Adds DOM matchers (toBeInTheDocument, toHaveTextContent, ...) to Vitest's expect.
import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';

// Testing Library only auto-registers cleanup when Vitest globals are enabled;
// they are not, so without this every render would stack onto the previous DOM.
// Guarded because this setup file also runs for node-environment domain tests.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);
}
