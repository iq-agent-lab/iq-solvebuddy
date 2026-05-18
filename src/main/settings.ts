// .env 파일을 안전하게 읽고/쓰는 헬퍼
// UI에서 들어온 설정을 process.env와 .env 양쪽에 반영.
// 시크릿(API_KEY, TOKEN)은 OS native keychain으로 암호화 — macOS Keychain /
// Windows DPAPI / Linux libsecret. Electron의 safeStorage API 사용.
//
// .env 파일 형식:
//   ANTHROPIC_API_KEY=ENC:base64_blob...      ← 암호화됨
//   ANTHROPIC_MODEL=claude-sonnet-4-6         ← 평문 (일반 설정)
//   GITHUB_TOKEN=ENC:base64_blob...           ← 암호화됨
//   ...
//
// process.env에는 항상 평문이 들어감 — translator/annotator/github가 그대로 사용.

import * as fs from 'fs/promises';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { AppSettings, SettingsView } from '../types';

// Re-export so ipc.ts can keep importing from './settings'
export { AppSettings, SettingsView };

// 암호화된 값임을 표시하는 prefix. legacy 평문(prefix 없음)도 호환.
const ENC_PREFIX = 'ENC:';

function envPath(): string {
  // 패키지된 앱: userData 디렉토리에 저장 (asar는 read-only이므로)
  //   macOS: ~/Library/Application Support/iq-leetbuddy/.env
  //   Windows: %APPDATA%/iq-leetbuddy/.env
  //   Linux: ~/.config/iq-leetbuddy/.env
  // 개발 모드: 프로젝트 루트
  //
  // 참고: v1.0+ 도구 이름이 iq-solvebuddy로 바뀌었지만 userData 폴더는
  // 'iq-leetbuddy' 그대로 — main/index.ts의 `app.setName('iq-leetbuddy')` 로
  // 명시 유지. 기존 사용자의 .env / cache / persist:leetcode 손실 방지.
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), '.env');
  }
  return path.join(__dirname, '../../.env');
}

const MANAGED_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'GITHUB_TOKEN',
  'GITHUB_OWNER',
  'GITHUB_REPO',
  'GITHUB_BRANCH',
  'GITHUB_AUTO_CREATE_REPO',
] as const;

type ManagedKey = (typeof MANAGED_KEYS)[number];

const SECRET_KEYS = new Set<string>(['ANTHROPIC_API_KEY', 'GITHUB_TOKEN']);

// ─── 암호화 / 복호화 ──────────────────────────────────────────
// safeStorage는 OS-native:
//   macOS: Keychain (Security.framework)
//   Windows: DPAPI (current user scope)
//   Linux: libsecret / kwallet / gnome-keyring (best available)
// Linux 환경에 키스토어 없으면 isEncryptionAvailable() === false → fallback to plaintext

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

// renderer/checkConfig에서 사용 — keychain 사용 가능 여부 노출.
// false면 시크릿이 평문 저장됨 → settings 모달에 경고 표시.
export function isKeychainAvailable(): boolean {
  return canEncrypt();
}

function maybeEncrypt(key: string, value: string): string {
  if (!SECRET_KEYS.has(key)) return value;
  if (!value) return value;
  if (value.startsWith(ENC_PREFIX)) return value; // 이미 암호화됨
  if (!canEncrypt()) return value; // fallback (Linux without keystore 등)
  try {
    const encrypted = safeStorage.encryptString(value);
    return ENC_PREFIX + encrypted.toString('base64');
  } catch {
    return value; // 실패 시 평문 fallback (보안 < 사용성)
  }
}

function maybeDecrypt(key: string, value: string): string {
  if (!SECRET_KEYS.has(key)) return value;
  if (!value) return value;
  if (!value.startsWith(ENC_PREFIX)) return value; // legacy plaintext or non-secret
  if (!canEncrypt()) return ''; // 복호화 불가 → 빈 값 (사용자 재입력 필요)
  try {
    const blob = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
    return safeStorage.decryptString(blob);
  } catch {
    // 다른 컴퓨터/계정에서 만든 .env를 가져왔거나, OS 키스토어 손상 등
    return '';
  }
}

// ─── load: 부팅 시 .env → process.env (평문으로 set) ─────────────
// dotenv는 이미 main/index.ts에서 호출됨. 이 함수는 그 후에 호출돼서
// process.env의 시크릿 값을 in-place로 decrypt.
export function decryptProcessEnvSecrets(): void {
  for (const key of SECRET_KEYS) {
    const val = process.env[key];
    if (!val) continue;
    const plain = maybeDecrypt(key, val);
    if (plain) {
      process.env[key] = plain;
    } else if (val.startsWith(ENC_PREFIX)) {
      // 복호화 실패 → 사용자가 재입력해야. 일단 비움 (translator가 throw)
      delete process.env[key];
    }
  }
}

// ─── view ─────────────────────────────────────────────────────
// 시크릿은 노출하지 않고 has-* 플래그로 존재 여부만 알림
export function getSettingsView(): SettingsView {
  return {
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    GITHUB_TOKEN: '',
    GITHUB_OWNER: process.env.GITHUB_OWNER || '',
    GITHUB_REPO: process.env.GITHUB_REPO || '',
    GITHUB_BRANCH: process.env.GITHUB_BRANCH || 'main',
    GITHUB_AUTO_CREATE_REPO: process.env.GITHUB_AUTO_CREATE_REPO === 'true',
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasGithubToken: !!process.env.GITHUB_TOKEN,
  };
}

// ─── save ─────────────────────────────────────────────────────
// .env 파일에 변경사항 반영. 시크릿 키(API_KEY, TOKEN)의 빈 문자열은 "변경 안 함".
// 파일엔 암호화 형태로, process.env엔 평문으로 set.
export async function saveSettings(updates: AppSettings): Promise<void> {
  const fileUpdates: Record<string, string> = {};       // .env 파일에 쓸 값 (시크릿은 encrypted)
  const processEnvUpdates: Record<string, string> = {}; // process.env에 set할 값 (모두 평문)

  for (const [key, value] of Object.entries(updates)) {
    if (!MANAGED_KEYS.includes(key as ManagedKey)) continue;
    if (typeof value !== 'string') continue;
    // 시크릿이 빈 문자열로 들어오면 기존 값 보존
    if (SECRET_KEYS.has(key) && value === '') continue;
    fileUpdates[key] = maybeEncrypt(key, value);
    processEnvUpdates[key] = value;
  }

  let content = '';
  try {
    content = await fs.readFile(envPath(), 'utf-8');
  } catch {
    try {
      await fs.mkdir(path.dirname(envPath()), { recursive: true });
    } catch {}
  }

  const lines = content.split('\n');
  const seen = new Set<string>();

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const match = trimmed.match(/^([A-Z_]+)=/);
    if (!match) return line;
    const key = match[1];
    if (fileUpdates[key] !== undefined) {
      seen.add(key);
      return `${key}=${fileUpdates[key]}`;
    }
    return line;
  });

  for (const [key, value] of Object.entries(fileUpdates)) {
    if (!seen.has(key)) newLines.push(`${key}=${value}`);
  }

  await fs.writeFile(envPath(), newLines.join('\n'), 'utf-8');
  Object.assign(process.env, processEnvUpdates);
}

// ─── 자동 마이그레이션 ────────────────────────────────────────
// 부팅 시 .env에 평문 시크릿이 있으면 OS keychain encrypted로 변환.
// canEncrypt() 가능한 환경에서만 동작. 실패해도 무해.
export async function migrateSecretsIfNeeded(): Promise<void> {
  if (!canEncrypt()) return;

  let content = '';
  try {
    content = await fs.readFile(envPath(), 'utf-8');
  } catch {
    return; // .env 없으면 마이그레이션할 것도 없음
  }

  // 평문 시크릿이 하나라도 있는지 확인
  const plaintextSecrets: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z_]+)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!SECRET_KEYS.has(key)) continue;
    if (!rawValue) continue;
    if (rawValue.startsWith(ENC_PREFIX)) continue; // 이미 암호화
    plaintextSecrets[key] = rawValue;
  }

  if (Object.keys(plaintextSecrets).length === 0) return;

  console.log(
    `[migration] ${Object.keys(plaintextSecrets).join(', ')} 평문 발견 → OS keychain으로 암호화`
  );

  // saveSettings 통해 .env 재작성 — encrypt 자동 적용
  await saveSettings(plaintextSecrets as AppSettings);
}
