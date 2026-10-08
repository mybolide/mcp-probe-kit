export interface HistoryDocument {
  number: number;
  path: string;
  content: string;
  sessionKey?: string;
  createdAt?: string;
  updatedAt?: string;
  sealed?: boolean;
}

export interface ScanReport {
  documents: HistoryDocument[];
  numbers: number[];
  missingNumbers: number[];
  duplicateSessionKeys: string[];
  invalidFiles: string[];
  emptyFiles: string[];
}

export interface CheckpointRecord {
  turn_id: string;
  timestamp: string;
  user_intent: string;
  raw_user_input: string;
  revision: number;
  supersedes?: string;
  content_hash: string;
  findings: string[];
  decisions: string[];
  files_changed: string[];
  tests: string[];
  runtime_state: string[];
  remaining_issues: string[];
  next_actions: string[];
  notes: string;
}

export interface InitialInputRecord {
  raw_user_input: string;
  captured_at: string;
  revision: number;
  supersedes?: string;
  content_hash: string;
}

export interface ManifestEntry {
  number: number;
  path: string;
  title: string;
  created_at: string;
  updated_at: string;
  bytes: number;
  sha256: string;
  keywords: string[];
}

export interface MemoryManifest {
  version: number;
  archive_revision: string;
  entries: ManifestEntry[];
}

export interface MemoryReference {
  number: number;
  path: string;
  reason: string;
}

export interface MemoryState {
  version: number;
  state_revision: number;
  archive_revision: string;
  generated_at: string;
  current_session?: MemoryReference;
  current_focus: string;
  recent_changes: string[];
  open_items: string[];
  references: MemoryReference[];
}

export interface SearchHit {
  number: number;
  path: string;
  title: string;
  score: number;
  snippet: string;
  sha256: string;
  updated_at: string;
}

export function emptyScanReport(): ScanReport {
  return {
    documents: [],
    numbers: [],
    missingNumbers: [],
    duplicateSessionKeys: [],
    invalidFiles: [],
    emptyFiles: [],
  };
}

export function latestNumber(report: ScanReport): number | undefined {
  return report.numbers.length ? report.numbers[report.numbers.length - 1] : undefined;
}

export function sequenceValid(report: ScanReport): boolean {
  return (
    report.missingNumbers.length === 0
    && report.duplicateSessionKeys.length === 0
    && report.invalidFiles.length === 0
    && report.emptyFiles.length === 0
  );
}

export function totalBytes(report: ScanReport): number {
  return report.documents.reduce((sum, doc) => sum + Buffer.byteLength(doc.content, 'utf8'), 0);
}
