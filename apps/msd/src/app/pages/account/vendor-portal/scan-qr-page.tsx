import { useNavigate } from 'react-router-dom';
import { Icon, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import { ScanQrPanel } from './scan-qr-panel';

/** `/account/vendor-orders/scan` — a thin page shell around `ScanQrPanel` (title + back button);
 *  the camera/scan/check logic all lives in the panel. */
export function ScanQrPage() {
  const navigate = useNavigate();

  return (
    <div className="admin-page admin-page--wide member-portal">
      <title>Scan QR · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <h1>Scan QR</h1>
        <OutlinedButton onClick={() => navigate('/account/vendor-orders')}>
          <Icon slot="icon" aria-hidden="true">arrow_back</Icon>
          Back to orders
        </OutlinedButton>
      </header>
      <ScanQrPanel />
    </div>
  );
}

export default ScanQrPage;
