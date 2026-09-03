import { useEffect, useRef, useState } from 'react';
import { OutlinedButton, Icon, LinearProgress } from '@skylabs-monorepo/shared-ui/react';
import {
  uploadImage as apiUploadImage,
  deleteImage as apiDeleteImage,
  reorderImages as apiReorderImages,
  setPrimaryImage as apiSetPrimaryImage,
  uploadVideo as apiUploadVideo,
  deleteVideo as apiDeleteVideo,
  resolveMediaUrl,
  type MediaEntityType,
  type MediaImage,
  type MediaVideo,
} from '../../api/media';
import { compressImageToRange, ImageCompressionError } from '../../utils/image-compression';
import { ApiRequestError } from '../../api/rbac/client';
import './media-uploader.css';

const VIDEO_MAX_BYTES = 1 * 1024 * 1024;

interface StagedImage {
  key: string;
  file: File;
  previewUrl: string;
  error?: string;
}

interface StagedVideo {
  file: File;
  previewUrl: string;
  error?: string;
}

/**
 * The one reusable media-management UI for Deal, Product, and Therapist — multiple images
 * (preview, primary, reorder, replace, delete) + a single optional video (upload, preview,
 * replace, delete). Only `api/media.ts`'s entity-parameterized calls differ per entity; the UI
 * and behavior are identical everywhere this is used.
 *
 * `entityId` is nullable because the admin create-dialogs for all three entities submit the
 * whole form in one step — files picked before the entity exists are compressed + staged
 * locally (with an object-URL preview) and automatically uploaded the moment `entityId`
 * transitions from null to a real id (i.e. right after the parent form's own create call
 * resolves), so the vendor experiences one continuous "fill form, add photos, save" flow
 * instead of a confusing two-step create-then-edit-for-media dance.
 */
export function MediaUploader({
  entityType,
  entityId,
  branchId,
  selfService,
  vendorId,
  existingImages,
  existingVideo,
  hideVideo,
  token,
  onImagesChange,
  onVideoChange,
}: {
  entityType: MediaEntityType;
  entityId: string | null;
  branchId?: string;
  /** Vendor/Product only — see api/media.ts's `EntityRef.selfService` doc comment. */
  selfService?: boolean;
  /** Product (admin-on-behalf) only — see api/media.ts's `EntityRef.vendorId` doc comment. */
  vendorId?: string;
  existingImages: MediaImage[];
  existingVideo: MediaVideo | null;
  /** Category only — the backend has no video adapter registered for `entityType="category"`
   *  (image-only, see `media.service.ts`'s adapter config map), so hitting `/video` for it would
   *  404/error. Hides the entire Video section (upload button + hidden file input) rather than
   *  merely leaving it unwired, so there's no dead control a category editor could click into an
   *  error. Every other entity keeps the section (defaults to `false`). */
  hideVideo?: boolean;
  token: string | null;
  onImagesChange?: (images: MediaImage[]) => void;
  onVideoChange?: (video: MediaVideo | null) => void;
}) {
  const [images, setImages] = useState<MediaImage[]>(existingImages);
  const [video, setVideo] = useState<MediaVideo | null>(existingVideo);
  const [staged, setStaged] = useState<StagedImage[]>([]);
  const [stagedVideo, setStagedVideo] = useState<StagedVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const previousEntityId = useRef(entityId);

  const ref = { entityType, entityId: entityId ?? '', branchId, selfService, vendorId };

  useEffect(() => {
    setImages(existingImages);
  }, [entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setVideo(existingVideo);
  }, [entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The moment the parent's own create-call resolves and hands us a real entityId, flush
  // whatever the vendor already picked before that point.
  useEffect(() => {
    if (!previousEntityId.current && entityId) {
      void flushStaged(entityId);
    }
    previousEntityId.current = entityId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function flushStaged(readyEntityId: string) {
    const liveRef = { entityType, entityId: readyEntityId, branchId, selfService, vendorId };
    setBusy(true);
    for (const item of staged) {
      try {
        const compressed = await compressImageToRange(item.file);
        const res = await apiUploadImage(token, liveRef, compressed, item.file.name);
        setImages((prev) => {
          const next = [...prev, res.data];
          onImagesChange?.(next);
          return next;
        });
        setStaged((prev) => prev.filter((s) => s.key !== item.key));
      } catch (err) {
        setStaged((prev) => prev.map((s) => (s.key === item.key ? { ...s, error: describeError(err) } : s)));
      }
    }
    if (stagedVideo && !hideVideo) {
      try {
        const res = await apiUploadVideo(token, liveRef, stagedVideo.file, stagedVideo.file.name);
        setVideo(res.data);
        onVideoChange?.(res.data);
        setStagedVideo(null);
      } catch (err) {
        setStagedVideo((prev) => (prev ? { ...prev, error: describeError(err) } : prev));
      }
    }
    setBusy(false);
  }

  function describeError(err: unknown): string {
    return err instanceof ApiRequestError || err instanceof ImageCompressionError ? err.message : 'Upload failed.';
  }

  async function handleImagesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError('');
    const picked = Array.from(files);

    if (!entityId) {
      const newStaged: StagedImage[] = picked.map((file) => ({
        key: `${file.name}-${file.size}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setStaged((prev) => [...prev, ...newStaged]);
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    setBusy(true);
    for (const file of picked) {
      try {
        const compressed = await compressImageToRange(file);
        const res = await apiUploadImage(token, ref, compressed, file.name);
        setImages((prev) => {
          const next = [...prev, res.data];
          onImagesChange?.(next);
          return next;
        });
      } catch (err) {
        setError(describeError(err));
      }
    }
    setBusy(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  async function handleVideoSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError('');
    const file = files[0];
    if (file.size > VIDEO_MAX_BYTES) {
      setError('Video size must not exceed 1 MB.');
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }

    if (!entityId) {
      setStagedVideo({ file, previewUrl: URL.createObjectURL(file) });
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }

    setBusy(true);
    try {
      const res = await apiUploadVideo(token, ref, file, file.name);
      setVideo(res.data);
      onVideoChange?.(res.data);
    } catch (err) {
      setError(describeError(err));
    }
    setBusy(false);
    if (videoInputRef.current) videoInputRef.current.value = '';
  }

  async function removeImage(imageId: string) {
    setBusy(true);
    setError('');
    try {
      await apiDeleteImage(token, ref, imageId);
      setImages((prev) => {
        const next = prev.filter((img) => img.id !== imageId);
        onImagesChange?.(next);
        return next;
      });
    } catch (err) {
      setError(describeError(err));
    }
    setBusy(false);
  }

  async function makePrimary(imageId: string) {
    setBusy(true);
    setError('');
    try {
      await apiSetPrimaryImage(token, ref, imageId);
      setImages((prev) => {
        const next = prev.map((img) => ({ ...img, isPrimary: img.id === imageId }));
        onImagesChange?.(next);
        return next;
      });
    } catch (err) {
      setError(describeError(err));
    }
    setBusy(false);
  }

  async function move(imageId: string, direction: -1 | 1) {
    const index = images.findIndex((img) => img.id === imageId);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    setImages(reordered);
    onImagesChange?.(reordered);
    setBusy(true);
    setError('');
    try {
      await apiReorderImages(token, ref, reordered.map((img) => img.id));
    } catch (err) {
      setError(describeError(err));
    }
    setBusy(false);
  }

  async function removeVideo() {
    setBusy(true);
    setError('');
    try {
      await apiDeleteVideo(token, ref);
      setVideo(null);
      onVideoChange?.(null);
    } catch (err) {
      setError(describeError(err));
    }
    setBusy(false);
  }

  return (
    <fieldset className="media-uploader">
      <legend>Media</legend>

      <div className="media-uploader__section">
        <p className="field-hint">Images</p>
        {busy && <LinearProgress indeterminate />}
        <div className="media-uploader__grid">
          {images.map((img, i) => (
            <figure className="media-uploader__thumb" key={img.id}>
              <img src={resolveMediaUrl(img.storageKey)} alt="" />
              {img.isPrimary && <span className="media-uploader__badge">★ Primary</span>}
              <figcaption>
                <span className="media-uploader__filename">{img.originalFilename ?? 'image'}</span>
                <span className="media-uploader__filesize">{Math.round(img.sizeBytes / 1024)} KB</span>
              </figcaption>
              <div className="media-uploader__actions">
                {!img.isPrimary && (
                  <OutlinedButton onClick={() => makePrimary(img.id)} disabled={busy}>
                    <Icon slot="icon" aria-hidden="true">star</Icon>
                    Set primary
                  </OutlinedButton>
                )}
                <OutlinedButton onClick={() => move(img.id, -1)} disabled={busy || i === 0} aria-label="Move earlier">
                  <Icon slot="icon" aria-hidden="true">arrow_upward</Icon>
                </OutlinedButton>
                <OutlinedButton onClick={() => move(img.id, 1)} disabled={busy || i === images.length - 1} aria-label="Move later">
                  <Icon slot="icon" aria-hidden="true">arrow_downward</Icon>
                </OutlinedButton>
                <OutlinedButton onClick={() => removeImage(img.id)} disabled={busy}>
                  <Icon slot="icon" aria-hidden="true">delete</Icon>
                  Remove
                </OutlinedButton>
              </div>
            </figure>
          ))}
          {staged.map((item) => (
            <figure className="media-uploader__thumb media-uploader__thumb--staged" key={item.key}>
              <img src={item.previewUrl} alt="" />
              <figcaption>
                <span className="media-uploader__filename">{item.file.name}</span>
                <span className="media-uploader__filesize">Pending — will upload on save</span>
              </figcaption>
              {item.error && <p className="error-state" role="alert">{item.error}</p>}
              <div className="media-uploader__actions">
                <OutlinedButton onClick={() => setStaged((prev) => prev.filter((s) => s.key !== item.key))}>
                  <Icon slot="icon" aria-hidden="true">delete</Icon>
                  Remove
                </OutlinedButton>
              </div>
            </figure>
          ))}
        </div>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => handleImagesSelected(e.target.files)}
        />
        <OutlinedButton onClick={() => imageInputRef.current?.click()} disabled={busy}>
          <Icon slot="icon" aria-hidden="true">add_photo_alternate</Icon>
          Upload images
        </OutlinedButton>
        <p className="field-hint">JPG, PNG, or WEBP — 30 KB to 80 KB each (compressed automatically).</p>
      </div>

      {!hideVideo && (
        <div className="media-uploader__section">
          <p className="field-hint">Video</p>
          {(video || stagedVideo) && (
            <div className="media-uploader__video">
              <video controls src={video ? resolveMediaUrl(video.storageKey) : stagedVideo?.previewUrl} />
              <div className="media-uploader__actions">
                <span className="media-uploader__filename">
                  {video?.originalFilename ?? stagedVideo?.file.name ?? 'video'}
                  {stagedVideo && ' — will upload on save'}
                </span>
                <OutlinedButton onClick={() => videoInputRef.current?.click()} disabled={busy}>
                  <Icon slot="icon" aria-hidden="true">videocam</Icon>
                  Replace video
                </OutlinedButton>
                <OutlinedButton onClick={video ? removeVideo : () => setStagedVideo(null)} disabled={busy}>
                  <Icon slot="icon" aria-hidden="true">delete</Icon>
                  Remove video
                </OutlinedButton>
              </div>
              {stagedVideo?.error && <p className="error-state" role="alert">{stagedVideo.error}</p>}
            </div>
          )}
          <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => handleVideoSelected(e.target.files)} />
          {!video && !stagedVideo && (
            <>
              <OutlinedButton onClick={() => videoInputRef.current?.click()} disabled={busy}>
                <Icon slot="icon" aria-hidden="true">videocam</Icon>
                Upload video
              </OutlinedButton>
              <p className="field-hint">MP4, WEBM, or MOV — up to 1 MB.</p>
            </>
          )}
        </div>
      )}

      {error && <p className="error-state" role="alert">{error}</p>}
    </fieldset>
  );
}
