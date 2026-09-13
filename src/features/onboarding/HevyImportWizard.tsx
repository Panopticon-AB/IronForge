'use client';

import { importHevyHistoryAction } from '@/actions/integrations/hevy';
import { getErrorMessage } from '@/lib/error-message';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle, FileJson, Loader2, Upload } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

type ImportSummary = {
  importedWorkouts: number;
  duplicateWorkouts: number;
  unidentifiedWorkouts: number;
  logs: number;
};

const EMPTY_IMPORT_SUMMARY: ImportSummary = {
  importedWorkouts: 0,
  duplicateWorkouts: 0,
  unidentifiedWorkouts: 0,
  logs: 0,
};

export const HevyImportWizard = () => {
  const [file, setFile] = useState<File | null>(null);
  const [stats, setStats] = useState<{
    count: number;
    dateRange: string;
  } | null>(null);
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selected = acceptedFiles[0];
    if (selected?.type !== 'application/json') {
      toast.error('Please upload a valid JSON file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        const workouts = json.workouts || [];

        if (!Array.isArray(workouts)) {
          throw new Error('Invalid format: missing "workouts" array');
        }

        setFile(selected);
        setParsedData(workouts);
        setImportSummary(null);

        // Calculate stats
        const count = workouts.length;
        const dates = workouts.map((w: any) => new Date(w.start_time).getTime());
        const minDate = new Date(Math.min(...dates)).toLocaleDateString();
        const maxDate = new Date(Math.max(...dates)).toLocaleDateString();
        setStats({ count, dateRange: `${minDate} - ${maxDate}` });
      } catch (e) {
        toast.error('Failed to parse JSON file');
        console.error(e);
      }
    };
    reader.readAsText(selected);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: { 'application/json': ['.json'] },
  });

  const handleImport = async () => {
    if (!parsedData) return;
    setIsUploading(true);

    try {
      const BATCH_SIZE = 50;
      const batches = [];
      for (let i = 0; i < parsedData.length; i += BATCH_SIZE) {
        batches.push(parsedData.slice(i, i + BATCH_SIZE));
      }

      const summary = { ...EMPTY_IMPORT_SUMMARY };

      for (const batch of batches) {
        const result = await importHevyHistoryAction(batch);
        summary.importedWorkouts += result.importedWorkouts;
        summary.duplicateWorkouts += result.duplicateWorkouts;
        summary.unidentifiedWorkouts += result.unidentifiedWorkouts;
        summary.logs += result.logs;
      }

      setImportSummary(summary);
      setComplete(true);
      toast.success(
        `Imported ${summary.importedWorkouts} workouts; ${summary.duplicateWorkouts} already present.`,
      );
    } catch (e) {
      toast.error(`Import failed: ${getErrorMessage(e)}`);
    } finally {
      setIsUploading(false);
    }
  };

  if (complete) {
    return (
      <div className="text-center p-8 bg-zinc-900 border border-emerald-500/20 rounded-xl">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </motion.div>
        <h3 className="text-xl font-bold text-white mb-2">Import Complete!</h3>
        {importSummary ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-6 text-left">
              <div className="p-3 bg-black/20 rounded-lg">
                <div className="text-xs text-zinc-500 uppercase">Imported</div>
                <div className="text-2xl font-bold text-white">
                  {importSummary.importedWorkouts}
                </div>
              </div>
              <div className="p-3 bg-black/20 rounded-lg">
                <div className="text-xs text-zinc-500 uppercase">Already present</div>
                <div className="text-2xl font-bold text-white">
                  {importSummary.duplicateWorkouts}
                </div>
              </div>
              <div className="p-3 bg-black/20 rounded-lg">
                <div className="text-xs text-zinc-500 uppercase">Missing Hevy ID</div>
                <div className="text-2xl font-bold text-yellow-400">
                  {importSummary.unidentifiedWorkouts}
                </div>
              </div>
            </div>
            <p className="text-sm text-zinc-400 mb-2">
              {importSummary.logs} exercise logs were written.
            </p>
            {importSummary.unidentifiedWorkouts > 0 && (
              <p className="text-xs text-yellow-300/80 mb-6">
                Missing-ID workouts are included in Imported and used the legacy fallback. They did
                not receive exact provider-ID deduplication.
              </p>
            )}
          </>
        ) : (
          <p className="text-zinc-400 mb-6">Your workout history has been imported.</p>
        )}
        <button
          onClick={() => {
            setFile(null);
            setStats(null);
            setParsedData(null);
            setImportSummary(null);
            setComplete(false);
          }}
          className="text-sm text-emerald-400 hover:text-emerald-300 underline"
        >
          Import another file
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!file ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-magma bg-magma/5'
              : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="w-10 h-10 text-zinc-500 mx-auto mb-4" />
          <p className="text-lg font-medium text-white mb-1">
            {isDragActive ? 'Drop your legacy here...' : 'Drag & drop Hevy export (JSON)'}
          </p>
          <p className="text-sm text-zinc-500">or click to browse files</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-zinc-800 rounded-lg">
              <FileJson className="w-6 h-6 text-magma" />
            </div>
            <div>
              <h4 className="text-white font-medium">{file.name}</h4>
              <p className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={() => {
                setFile(null);
                setStats(null);
                setParsedData(null);
                setImportSummary(null);
              }}
              className="ml-auto text-xs text-red-400 hover:text-red-300"
            >
              Remove
            </button>
          </div>

          {stats && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-black/20 rounded-lg">
                <div className="text-sm text-zinc-500 mb-1">Workouts Found</div>
                <div className="text-2xl font-bold text-white">{stats.count}</div>
              </div>
              <div className="p-4 bg-black/20 rounded-lg">
                <div className="text-sm text-zinc-500 mb-1">Timeline</div>
                <div className="text-lg font-medium text-white">{stats.dateRange}</div>
              </div>
            </div>
          )}

          <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg flex items-start gap-3 mb-6">
            <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200/80">
              Identified Hevy workouts are deduplicated by Hevy workout ID. Workouts missing that ID
              use a legacy fallback and are reported separately after import.
            </div>
          </div>

          <button
            onClick={handleImport}
            disabled={isUploading}
            className="w-full py-3 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing Scrolls...
              </>
            ) : (
              'Confirm Import'
            )}
          </button>
        </div>
      )}
    </div>
  );
};
