import { describe, it, expect } from 'vitest';
import { validateMediaFile, IMAGE_MIN_BYTES, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from './media-validation.service';
import { ApiError } from '../lib/http';

/** A byte-exact, magic-byte-valid JPEG buffer padded to `size` bytes. */
function jpegBuffer(size: number): Buffer {
  const buffer = Buffer.alloc(size, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

/** A byte-exact, magic-byte-valid MP4 buffer (ISO-BMFF `ftyp` box, major brand `isom`, so it
 *  reads as MP4 not MOV) padded to `size` bytes. */
function mp4Buffer(size: number): Buffer {
  const buffer = Buffer.alloc(size, 0);
  buffer.write('ftyp', 4, 'ascii');
  buffer.write('isom', 8, 'ascii');
  return buffer;
}

describe('validateMediaFile — image size boundary table', () => {
  it.each([
    [20 * 1024, false],
    [IMAGE_MIN_BYTES, true],
    [50 * 1024, true],
    [IMAGE_MAX_BYTES, true],
    [IMAGE_MAX_BYTES + 1024, false],
  ])('%i bytes -> pass=%s', (size, shouldPass) => {
    const buffer = jpegBuffer(size);
    if (shouldPass) {
      expect(() => validateMediaFile(buffer, 'image')).not.toThrow();
    } else {
      expect(() => validateMediaFile(buffer, 'image')).toThrow(ApiError);
    }
  });

  it('rejects with the exact spec message when out of range', () => {
    try {
      validateMediaFile(jpegBuffer(20 * 1024), 'image');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe('Image size must be between 30 KB and 80 KB.');
    }
  });
});

describe('validateMediaFile — video size boundary table', () => {
  it.each([
    [900 * 1024, true],
    [VIDEO_MAX_BYTES, true],
    [VIDEO_MAX_BYTES + 1024, false],
  ])('%i bytes -> pass=%s', (size, shouldPass) => {
    const buffer = mp4Buffer(size);
    if (shouldPass) {
      expect(() => validateMediaFile(buffer, 'video')).not.toThrow();
    } else {
      expect(() => validateMediaFile(buffer, 'video')).toThrow(ApiError);
    }
  });

  it('rejects with the exact spec message when over 1MB', () => {
    try {
      validateMediaFile(mp4Buffer(VIDEO_MAX_BYTES + 1024), 'video');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe('Video size must not exceed 1 MB.');
    }
  });
});

describe('validateMediaFile — magic-byte / format enforcement', () => {
  it('rejects a file whose declared name looks like an image but whose bytes are not a real image (renamed text file)', () => {
    const fakeBuffer = Buffer.alloc(50 * 1024, 0);
    fakeBuffer.write('this is just plain text, not an image', 0, 'ascii');
    expect(() => validateMediaFile(fakeBuffer, 'image')).toThrow(ApiError);
  });

  it('rejects a valid video file submitted as an image (wrong kind, even though the bytes are a real recognized format)', () => {
    const buffer = mp4Buffer(50 * 1024);
    expect(() => validateMediaFile(buffer, 'image')).toThrow('Images must be JPG, JPEG, PNG, or WEBP.');
  });

  it('rejects a valid image file submitted as a video', () => {
    const buffer = jpegBuffer(500 * 1024);
    expect(() => validateMediaFile(buffer, 'video')).toThrow('Videos must be MP4, WEBM, or MOV.');
  });

  it('accepts a valid PNG image', () => {
    const buffer = Buffer.alloc(50 * 1024, 0);
    buffer.write(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('binary'), 0, 'binary');
    expect(() => validateMediaFile(buffer, 'image')).not.toThrow();
  });

  it('accepts a valid WEBP image', () => {
    const buffer = Buffer.alloc(50 * 1024, 0);
    buffer.write('RIFF', 0, 'ascii');
    buffer.write('WEBP', 8, 'ascii');
    expect(() => validateMediaFile(buffer, 'image')).not.toThrow();
  });

  it('accepts a valid WEBM video', () => {
    const buffer = Buffer.alloc(500 * 1024, 0);
    buffer.write(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).toString('binary'), 0, 'binary');
    expect(() => validateMediaFile(buffer, 'video')).not.toThrow();
  });

  it('accepts a valid MOV video', () => {
    const buffer = Buffer.alloc(500 * 1024, 0);
    buffer.write('ftyp', 4, 'ascii');
    buffer.write('qt  ', 8, 'ascii');
    expect(() => validateMediaFile(buffer, 'video')).not.toThrow();
  });
});
