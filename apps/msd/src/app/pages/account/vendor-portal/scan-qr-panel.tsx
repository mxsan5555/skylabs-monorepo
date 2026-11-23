import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { FilledButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';

/**
 * D40 — vendor "Scan QR" entry point (`/account/vendor-orders?tab=scan`). Decodes the camera
 * feed client-side (`jsqr`, no network round trip for the decode itself) looking for a voucher
 * code, then routes to the SAME `/account/vendor-orders/verify/:code` confirmation screen the
 * existing manual-entry/"Open Voucher" lookup already reaches — one confirmation UI and one
 * "Confirm Redemption" action for every redemption path, camera or manual, never a second parallel
 * flow. The manual code field here is the camera's fallback for a denied/unavailable permission,
 * not a duplicate of the Verify & Complete tab's own lookup.
 *
 * The camera `MediaStream` is stopped on unmount — which covers tab switch, since `MemberOrdersPage`
 * only renders the active tab's panel — and the decode loop (`requestAnimationFrame`) is cancelled
 * the same way. `navigatedRef` is the busy-guard: once one decode (or manual submit) has fired the
 * navigation, every later frame/submit is a no-op, so a jittery scan can never fire it twice.
 */
export function ScanQrPanel() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const navigatedRef = useRef(false);

  const [cameraError, setCameraError] = useState('');
  const [manualCode, setManualCode] = useState('');

  const goToVoucher = useCallback((code: string) => {
    const trimmed = code.trim();
    if (!trimmed || navigatedRef.current) return;
    navigatedRef.current = true;
    navigate(`/account/vendor-orders/verify/${encodeURIComponent(trimmed)}`);
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    function tick() {
      if (cancelled || navigatedRef.current) return;
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
          if (result?.data) {
            goToVoucher(result.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera is not available on this device. Use manual entry below.');
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
        if (!cancelled) setCameraError('Camera access was denied or unavailable. Use manual entry below.');
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [goToVoucher]);

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    goToVoucher(manualCode);
  };

  return (
    <section aria-labelledby="scan-qr-title" className="panel">
      <h2 id="scan-qr-title" className="section-title">Scan QR</h2>
      <p className="field-hint">Point the camera at the customer&apos;s voucher QR code.</p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a live decode viewfinder, not media content */}
      <video ref={videoRef} className="scan-qr-video" muted playsInline aria-hidden="true" />
      <canvas ref={canvasRef} hidden />
      {cameraError && <p className="error-state" role="alert">{cameraError}</p>}

      <h3 className="section-title">Or enter the voucher code</h3>
      <form className="voucher-lookup-row member-action-row" onSubmit={submitManual}>
        <OutlinedTextField label="Voucher code" value={manualCode} onInput={(e: Event) => setManualCode((e.target as HTMLInputElement).value)} />
        <FilledButton type="submit" disabled={!manualCode.trim()}>Open Voucher</FilledButton>
      </form>
    </section>
  );
}

export default ScanQrPanel;
