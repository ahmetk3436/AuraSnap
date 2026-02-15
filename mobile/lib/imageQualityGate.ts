import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import Constants from 'expo-constants';
import { NativeModulesProxy } from 'expo-modules-core';
import jpeg from 'jpeg-js';

export type QualityIssueCode =
  | 'LOW_RESOLUTION'
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'FACE_TOO_FAR'
  | 'FACE_TOO_CLOSE'
  | 'HEAD_ANGLE'
  | 'LOW_LIGHT'
  | 'OVEREXPOSED'
  | 'LOW_CONTRAST'
  | 'BLURRY';

export interface QualityMetrics {
  brightness: number;
  contrast: number;
  blurVariance: number;
  faceCount: number;
  faceAreaRatio: number;
  faceYaw: number | null;
  faceRoll: number | null;
  shortSide: number;
}

export interface QualityGateResult {
  ok: boolean;
  score: number;
  issues: QualityIssueCode[];
  message: string;
  metrics: QualityMetrics;
  faceDetectionAvailable: boolean;
}

const MESSAGE_BY_ISSUE: Record<QualityIssueCode, string> = {
  LOW_RESOLUTION: 'Photo resolution is too low. Move closer and try again.',
  NO_FACE: 'No clear face detected. Center your face and retry.',
  MULTIPLE_FACES: 'Multiple faces detected. Keep only one face in frame.',
  FACE_TOO_FAR: 'Face is too far. Move closer to the camera.',
  FACE_TOO_CLOSE: 'Face is too close. Move slightly back.',
  HEAD_ANGLE: 'Keep your head straight and look at the camera.',
  LOW_LIGHT: 'Lighting is too dark. Move to a brighter area.',
  OVEREXPOSED: 'Lighting is too strong. Avoid direct bright light.',
  LOW_CONTRAST: 'Image contrast is low. Improve lighting and retry.',
  BLURRY: 'Image looks blurry. Hold steady and retake the photo.',
};

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function extractPixelMetrics(base64: string): { brightness: number; contrast: number; blurVariance: number } {
  const decoded = jpeg.decode(base64ToBytes(base64), { useTArray: true });
  const { width, height, data } = decoded;
  const size = width * height;
  const luminance = new Float32Array(size);

  let sum = 0;
  for (let i = 0, p = 0; i < size; i += 1, p += 4) {
    const y = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
    luminance[i] = y;
    sum += y;
  }

  const mean = sum / size;
  let varianceSum = 0;
  for (let i = 0; i < size; i += 1) {
    const d = luminance[i] - mean;
    varianceSum += d * d;
  }
  const contrast = Math.sqrt(varianceSum / size);

  let lapSum = 0;
  let lapSqSum = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const lap =
        4 * luminance[idx] -
        luminance[idx - 1] -
        luminance[idx + 1] -
        luminance[idx - width] -
        luminance[idx + width];
      lapSum += lap;
      lapSqSum += lap * lap;
      n += 1;
    }
  }
  const lapMean = n > 0 ? lapSum / n : 0;
  const blurVariance = n > 0 ? lapSqSum / n - lapMean * lapMean : 0;

  return {
    brightness: mean,
    contrast,
    blurVariance,
  };
}

function firstIssueMessage(issues: QualityIssueCode[]): string {
  if (issues.length === 0) {
    return 'Photo quality is good.';
  }
  return MESSAGE_BY_ISSUE[issues[0]];
}

function loadFaceDetector():
  | null
  | {
      detectFacesAsync: (uri: string, options?: any) => Promise<any>;
      FaceDetectorMode?: { fast: number; accurate: number };
      FaceDetectorLandmarks?: { none: number; all: number };
      FaceDetectorClassifications?: { none: number; all: number };
    } {
  try {
    if (Constants.appOwnership === 'expo' || !(NativeModulesProxy as any)?.ExpoFaceDetector) {
      // Expo Go: module can be unavailable; skip face gate safely.
      return null;
    }
    // `expo-face-detector` is not always available in Expo Go; keep runtime resilient.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-face-detector');
  } catch {
    return null;
  }
}

export async function evaluateImageQuality(
  imageUri: string,
  width?: number,
  height?: number
): Promise<QualityGateResult> {
  const issues: QualityIssueCode[] = [];
  let score = 100;
  let faceDetectionAvailable = true;

  const shortSide = Math.min(width ?? 0, height ?? 0);
  if (shortSide > 0 && shortSide < 480) {
    issues.push('LOW_RESOLUTION');
    score -= 20;
  }

  let faceCount = 0;
  let faceAreaRatio = 0;
  let faceYaw: number | null = null;
  let faceRoll: number | null = null;

  const detector = loadFaceDetector();
  if (!detector?.detectFacesAsync) {
    faceDetectionAvailable = false;
  } else {
    try {
      const faceRes = await detector.detectFacesAsync(imageUri, {
        mode: detector.FaceDetectorMode?.fast,
        detectLandmarks: detector.FaceDetectorLandmarks?.none,
        runClassifications: detector.FaceDetectorClassifications?.none,
      });

      faceCount = faceRes.faces?.length ?? 0;
      if (faceCount === 0) {
        issues.push('NO_FACE');
        score -= 35;
      } else if (faceCount > 1) {
        issues.push('MULTIPLE_FACES');
        score -= 20;
      } else {
        const face = faceRes.faces[0];
        const imageArea = Math.max((faceRes.image?.width ?? width ?? 1) * (faceRes.image?.height ?? height ?? 1), 1);
        const faceArea = (face.bounds.size.width || 0) * (face.bounds.size.height || 0);
        faceAreaRatio = faceArea / imageArea;
        faceYaw = typeof face.yawAngle === 'number' ? face.yawAngle : null;
        faceRoll = typeof face.rollAngle === 'number' ? face.rollAngle : null;

        if (faceAreaRatio < 0.09) {
          issues.push('FACE_TOO_FAR');
          score -= 16;
        } else if (faceAreaRatio > 0.65) {
          issues.push('FACE_TOO_CLOSE');
          score -= 10;
        }
        if ((faceYaw !== null && Math.abs(faceYaw) > 25) || (faceRoll !== null && Math.abs(faceRoll) > 20)) {
          issues.push('HEAD_ANGLE');
          score -= 10;
        }
      }
    } catch {
      // Face detector can fail in some environments; continue with non-face gates.
      faceDetectionAvailable = false;
    }
  }

  let brightness = 0;
  let contrast = 0;
  let blurVariance = 0;
  try {
    const mini = await manipulateAsync(
      imageUri,
      [{ resize: { width: 192 } }],
      { compress: 0.7, format: SaveFormat.JPEG, base64: true }
    );
    if (mini.base64) {
      const metrics = extractPixelMetrics(mini.base64);
      brightness = metrics.brightness;
      contrast = metrics.contrast;
      blurVariance = metrics.blurVariance;

      if (brightness < 52) {
        issues.push('LOW_LIGHT');
        score -= 14;
      } else if (brightness > 210) {
        issues.push('OVEREXPOSED');
        score -= 10;
      }
      if (contrast < 17) {
        issues.push('LOW_CONTRAST');
        score -= 9;
      }
      if (blurVariance < 70) {
        issues.push('BLURRY');
        score -= 18;
      }
    }
  } catch {
    // Keep flow resilient if image decode fails on unusual file formats.
  }

  score = clamp(score, 0, 100);
  const ok = issues.length === 0 || (issues.length === 1 && issues[0] === 'LOW_CONTRAST');

  return {
    ok,
    score,
    issues,
    message: firstIssueMessage(issues),
    metrics: {
      brightness,
      contrast,
      blurVariance,
      faceCount,
      faceAreaRatio,
      faceYaw,
      faceRoll,
      shortSide,
    },
    faceDetectionAvailable,
  };
}
