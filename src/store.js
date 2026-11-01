// 아주 단순한 JSON 파일 저장소 (data/db.json)
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { EMPLOYEES, KNOWLEDGE, OWNER } from './seed.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function fresh() {
  return {
    owner: OWNER,
    employees: structuredClone(EMPLOYEES),
    knowledge: structuredClone(KNOWLEDGE),
    orders: [],
    tasks: [],
    briefing: null,
    settings: { autoBriefing: true, briefingTime: '08:00', notifyReview: true, notifyBriefing: true, notifyWeekly: true, minutesPerTask: 40, slideTheme: 'lavender' },
    kakao: null, // { refreshToken, nickname, connectedAt, lastError }
    weeklyReviews: {}, // 주간 보고서 총평 { [주 시작일]: { text, at } }
    auth: null, // { passwordHash }
    sessions: [],
    google: null, // { refreshToken, email, scopes, connectedAt, folderId }
  };
}

function load() {
  if (!existsSync(DB_FILE)) return fresh();
  try {
    const base = fresh();
    const saved = JSON.parse(readFileSync(DB_FILE, 'utf8'));
    return { ...base, ...saved, settings: { ...base.settings, ...(saved.settings || {}) } };
  } catch (err) {
    console.error('⚠️  data/db.json 을 읽지 못해 새로 시작합니다:', err.message);
    return fresh();
  }
}

export const db = load();

export function save() {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DB_FILE);
}

export const uid = (prefix) => `${prefix}-${randomUUID().slice(0, 8)}`;
export const now = () => new Date().toISOString();
