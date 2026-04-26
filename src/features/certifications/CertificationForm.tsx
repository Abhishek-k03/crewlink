import { zodResolver } from '@hookform/resolvers/zod';
import { Paperclip } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { errorTextClasses, fieldClasses } from '@/components/ui/formStyles';
import { certificationInputSchema } from '@/domain/schemas';
import { CERTIFICATION_TYPES, type CertificationDocument } from '@/domain/types';

import { formatBytes, MAX_DOCUMENT_BYTES, readDocument } from './documentFile';

type CertificationFormValues = z.infer<typeof certificationInputSchema>;

const inputClasses = `${fieldClasses} w-full`;

interface CertificationFormProps {
  crewId: string;
  pending: boolean;
  onSubmit: (values: CertificationFormValues) => Promise<void>;
  onCancel: () => void;
}

export function CertificationForm({
  crewId,
  pending,
  onSubmit,
  onCancel,
}: CertificationFormProps) {
  const [document, setDocument] = useState<CertificationDocument | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CertificationFormValues>({
    resolver: zodResolver(certificationInputSchema),
    defaultValues: {
      crewId,
      type: 'STCW',
      issueDate: '',
      expiryDate: '',
      issuingAuthority: '',
    },
  });

  const handleFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) {
      setDocument(null);
      return;
    }
    try {
      setDocument(await readDocument(file));
    } catch (error) {
      setDocument(null);
      setFileError(error instanceof Error ? error.message : 'Could not read that file.');
    }
  };

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(document ? { ...values, document } : values);
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          const message = messages?.[0];
          if (message) setError(field as keyof CertificationFormValues, { message });
        }
        return;
      }
      throw error;
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" {...register('crewId')} />

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Type
        <select {...register('type')} className={inputClasses}>
          {CERTIFICATION_TYPES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Issue date
          <input type="date" {...register('issueDate')} className={inputClasses} />
          {errors.issueDate && (
            <span className={errorTextClasses}>{errors.issueDate.message}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Expiry date
          <input type="date" {...register('expiryDate')} className={inputClasses} />
          {errors.expiryDate && (
            <span className={errorTextClasses}>{errors.expiryDate.message}</span>
          )}
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Issuing authority
        <input {...register('issuingAuthority')} className={inputClasses} />
        {errors.issuingAuthority && (
          <span className={errorTextClasses}>
            {errors.issuingAuthority.message}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Scan (optional, max {formatBytes(MAX_DOCUMENT_BYTES)})
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(event) => void handleFile(event.target.files?.[0])}
          className="text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-elevated file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
        />
        {document && (
          <span className="flex items-center gap-1.5 text-xs font-normal text-muted">
            <Paperclip className="size-3" aria-hidden />
            {document.fileName} · {formatBytes(document.sizeBytes)}
          </span>
        )}
        {fileError && <span className={errorTextClasses}>{fileError}</span>}
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          Add certification
        </Button>
      </div>
    </form>
  );
}
