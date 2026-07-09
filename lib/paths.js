import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.join(__dirname, '..');
export const BOOKS_DIR = path.join(ROOT_DIR, 'books');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');
