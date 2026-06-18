// src/hooks/use-upload-statement.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';

import { uploadStatement, type UploadResult } from '@/services/api';
import { API_BASE_URL } from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UploadPhase =
  | 'transactions'  // inserting raw rows
  | 'daily';        // upserting daily aggregates

export type UploadProgress = {
  phase: UploadPhase;
  done: number;
  total: number;
  /** 0–100 */
  pct: number;
};

export type UploadDedup = {
  skipped: number;
  kept: number;
};

type UploadState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'uploading'; filename: string }
  | { status: 'processing'; filename: string; total: number; dedup: UploadDedup | null; progress: UploadProgress | null }
  | { status: 'success';    filename: string; result: UploadResult }
  | { status: 'error';      message: string };

type UseUploadStatementReturn = {
  uploadState: UploadState;
  pickAndUpload: () => Promise<void>;
  reset: () => void;
};

// ─── WS URL helper ────────────────────────────────────────────────────────────
// Converts http(s):// base URL to ws(s)://

function wsUrl(jobId: string): string {
  const base = API_BASE_URL.replace(/^http/, 'ws');
  return `${base}/ws/upload/${jobId}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUploadStatement(
  onSuccess?: (result: UploadResult) => void,
): UseUploadStatementReturn {
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const wsRef = useRef<WebSocket | null>(null);

  // Keep onSuccess ref current so pickAndUpload never captures a stale closure.
  // This lets pickAndUpload's dep array be [] while always calling the latest cb.
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  // Clean up any open socket on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const reset = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setUploadState({ status: 'idle' });
  }, []);

  const pickAndUpload = useCallback(async () => {
    // ── 1. Pick file ──────────────────────────────────────────────────────
    setUploadState({ status: 'picking' });

    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'text/comma-separated-values',
          'application/octet-stream',
          '*/*',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch {
      setUploadState({ status: 'error', message: 'Could not open file picker.' });
      return;
    }

    if (picked.canceled || !picked.assets?.length) {
      setUploadState({ status: 'idle' });
      return;
    }

    const asset    = picked.assets[0];
    const filename = asset.name ?? 'statement.xlsx';
    const mimeType =
      asset.mimeType ??
      (filename.endsWith('.csv')
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    setUploadState({ status: 'uploading', filename });

    // ── 2. POST file → get job_id ─────────────────────────────────────────
    let jobId: string;
    try {
      const { job_id } = await uploadStatement(asset.uri, filename, mimeType);
      jobId = job_id;
    } catch (err) {
      setUploadState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Upload failed. Please try again.',
      });
      return;
    }

    // ── 3. Open WebSocket and track progress ──────────────────────────────
    setUploadState({
      status: 'processing',
      filename,
      total: 0,
      dedup: null,
      progress: null,
    });

    const ws = new WebSocket(wsUrl(jobId));
    wsRef.current = ws;

    // Tracks whether onmessage already moved us to a terminal state so that
    // the onclose fallback doesn't overwrite a legitimate complete/error.
    let settled = false;

    ws.onmessage = (evt) => {
      let event: Record<string, any>;
      try {
        event = JSON.parse(evt.data as string);
      } catch {
        return;
      }

      switch (event.event) {
        case 'started':
          setUploadState((prev) =>
            prev.status === 'processing'
              ? { ...prev, total: event.total as number }
              : prev,
          );
          break;

        case 'dedup':
          setUploadState((prev) =>
            prev.status === 'processing'
              ? {
                  ...prev,
                  dedup: {
                    skipped: event.skipped as number,
                    kept:    event.kept    as number,
                  },
                }
              : prev,
          );
          break;

        case 'progress': {
          const done  = event.done  as number;
          const total = event.total as number;
          const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
          setUploadState((prev) =>
            prev.status === 'processing'
              ? {
                  ...prev,
                  progress: {
                    phase: event.phase as UploadPhase,
                    done,
                    total,
                    pct,
                  },
                }
              : prev,
          );
          break;
        }

        case 'complete':
          settled = true;
          ws.close();
          wsRef.current = null;
          setUploadState({
            status:   'success',
            filename,
            result:   event.result as UploadResult,
          });
          onSuccessRef.current?.(event.result as UploadResult);
          break;

        case 'error':
          settled = true;
          ws.close();
          wsRef.current = null;
          setUploadState({
            status:  'error',
            message: (event.message as string) || 'Processing failed.',
          });
          break;
      }
    };

    ws.onerror = () => {
      // onerror is always followed by onclose in React Native / browsers.
      // We set settled here so onclose knows this was a connection error
      // (not an unexpected close), and we let onclose do the single
      // state transition to avoid a double-set race.
      settled = true;
      wsRef.current = null;
      setUploadState({
        status:  'error',
        message: 'Lost connection to server during processing.',
      });
    };

    ws.onclose = () => {
      wsRef.current = null;
      // Only act if nothing else (complete / error event / onerror) already
      // moved us to a terminal state. This guards against the onerror → onclose
      // double-fire clobbering the more descriptive error message.
      if (!settled) {
        setUploadState((prev) =>
          prev.status === 'processing'
            ? { status: 'error', message: 'Connection closed before processing completed.' }
            : prev,
        );
      }
    };
  }, []); // stable — onSuccess is accessed via ref

  return { uploadState, pickAndUpload, reset };
}