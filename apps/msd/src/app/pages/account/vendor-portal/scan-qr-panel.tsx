import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { verifyVoucher } from '../../../../api/rbac/vouchers';
import { ApiRequestError } from '../../../../api/rbac/client';
import { scanResultCopy, UNKNOWN_QR_COPY } from './voucher-scan-copy';

/**
 * Vendor "Scan QR" page (`/account/vendor-orders/scan`) — camera-only, scan-only: there is no
 * manual code entry anywhere in this panel. Decodes the camera feed client-side (`jsqr`), then
 * runs the real server-side check (`verifyVoucher`) on every decode before navigating anywhere —
 * "Checking…" while that call is in flight. Only `VALID` navigates, to the Voucher Fulfilment
 * page (`/account/vendor-orders/verify/:code`), which re-verifies again on its own mount (never
 * trusts this screen's result). Every other result — or a 404 for a code that isn't a voucher at
 * all — shows its plain-language message inline and the camera keeps scanning for the next
 * customer; `checkingRef` is the busy-guard that makes "one request per scan" real (the decode
 * loop keeps running every frame, cheaply, but skips a new decode attempt while a check for the
 * last one is still in flight).
 *
 * The camera `MediaStream` is stopped on unmount — which covers navigating away or a tab switch,
 * since `MemberOrdersPage`'s predecessor only ever rendered the active panel, and this page is no
 * different.
 */
export function ScanQrPanel() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const checkingRef = useRef(false);
  const navigatedRef = useRef(false);

  const [cameraError, setCameraError] = useState('');
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [checking, setChecking] = useState(false);
  const [scanError, setScanError] = useState('');

  const checkCode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || checkingRef.current || navigatedRef.current) return;
      checkingRef.current = true;
      setChecking(true);
      setScanError('');
      try {
        const { data } = await verifyVoucher(token, trimmed);
        if (data.result === 'VALID') {
          navigatedRef.current = true;
          navigate(`/account/vendor-orders/verify/${encodeURIComponent(data.entitlement.voucherCode)}`);
          return;
        }
        setScanError(scanResultCopy(data.result, data.entitlement));
      } catch (err) {
        setScanError(err instanceof ApiRequestError && err.status === 404 ? UNKNOWN_QR_COPY : 'Could not check this voucher. Try again.');
      } finally {
        checkingRef.current = false;
        setChecking(false);
      }
    },
    [navigate, token],
  );

  useEffect(() => {
    let cancelled = false;

    function tick() {
      if (cancelled || navigatedRef.current) return;
      if (!checkingRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(imageData.data, imageData.width, imageData.height);
            if (result?.data) checkCode(result.data);
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Allow camera access to scan QR codes');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        tick();
      } catch {
        if (!cancelled) setCameraError('Allow camera access to scan QR codes');
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [checkCode, cameraAttempt]);

  return (
    <section aria-labelledby="scan-qr-title" className="panel">
      <h2 id="scan-qr-title" className="section-title">Point the camera at the customer&apos;s QR</h2>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a live decode viewfinder, not media content */}
      <video ref={videoRef} className="scan-qr-video" muted playsInline aria-hidden="true" />
      <canvas ref={canvasRef} hidden />

      {cameraError && (
        <div role="alert">
          <p className="error-state">{cameraError}</p>
          <OutlinedButton onClick={() => { setCameraError(''); setCameraAttempt((n) => n + 1); }}>Try again</OutlinedButton>
        </div>
      )}

      {!cameraError && checking && <p className="field-hint" role="status">Checking…</p>}
      {!cameraError && !checking && scanError && <p className="error-state" role="alert">{scanError}</p>}
    </section>
  );
}

export default ScanQrPanel;
