// src/hooks/use-upload-statement.ts
//
// Drop-in hook for the Upload XLSX panel in the log screen.
// Uses the same pattern as your other hooks — no useSWR since this is
// a one-shot mutation, not a cached read.

import { useCallback, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';

import { uploadStatement, type UploadResult } from '@/services/api';

type UploadState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'uploading'; filename: string }
  | { status: 'success'; result: UploadResult; filename: string }
  | { status: 'error'; message: string };

type UseUploadStatementReturn = {
  uploadState: UploadState;
  pickAndUpload: () => Promise<void>;
  reset: () => void;
};

export function useUploadStatement(
  onSuccess?: (result: UploadResult) => void,
): UseUploadStatementReturn {
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });

  const reset = useCallback(() => {
    setUploadState({ status: 'idle' });
  }, []);

  const pickAndUpload = useCallback(async () => {
    // ── 1. Open document picker ───────────────────────────────────────────
    setUploadState({ status: 'picking' });

    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: [
          // xlsx
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          // xls
          'application/vnd.ms-excel',
          // csv
          'text/csv',
          'text/comma-separated-values',
          // iOS/Android sometimes reports these as generic types
          'application/octet-stream',
          '*/*',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch (err) {
      setUploadState({ status: 'error', message: 'Could not open file picker.' });
      return;
    }

    // User cancelled
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

    // ── 2. Upload ─────────────────────────────────────────────────────────
    setUploadState({ status: 'uploading', filename });
    console.log("URI:", asset.uri);
    console.log("NAME:", filename);
    console.log("TYPE:", mimeType);
    try {
      const result = await uploadStatement(asset.uri, filename, mimeType);
      setUploadState({ status: 'success', result, filename });
      onSuccess?.(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setUploadState({ status: 'error', message });
    }
  }, [onSuccess]);

  return { uploadState, pickAndUpload, reset };
}