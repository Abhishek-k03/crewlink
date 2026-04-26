import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { errorTextClasses, fieldClasses } from '@/components/ui/formStyles';
import { type CrewInput, crewInputSchema } from '@/domain/schemas';
import { CREW_STATUSES, type CrewMember, RANKS } from '@/domain/types';

const inputClasses = `${fieldClasses} w-full`;

interface CrewFormProps {
  member?: CrewMember;
  pending: boolean;
  onSubmit: (values: CrewInput) => Promise<void>;
  onCancel: () => void;
}

export function CrewForm({ member, pending, onSubmit, onCancel }: CrewFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CrewInput>({
    resolver: zodResolver(crewInputSchema),
    defaultValues: {
      name: member?.name ?? '',
      rank: member?.rank ?? 'AB',
      nationality: member?.nationality ?? '',
      dateOfBirth: member?.dateOfBirth ?? '',
      status: member?.status ?? 'Available',
      email: member?.email ?? '',
      phone: member?.phone ?? '',
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          const message = messages?.[0];
          if (message) setError(field as keyof CrewInput, { message });
        }
        return;
      }
      throw error;
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name
        <input {...register('name')} className={inputClasses} />
        {errors.name && (
          <span className={errorTextClasses}>{errors.name.message}</span>
        )}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Rank
          <select {...register('rank')} className={inputClasses}>
            {RANKS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select {...register('status')} className={inputClasses}>
            {CREW_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Nationality
          <input {...register('nationality')} className={inputClasses} />
          {errors.nationality && (
            <span className={errorTextClasses}>{errors.nationality.message}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Date of birth
          <input type="date" {...register('dateOfBirth')} className={inputClasses} />
          {errors.dateOfBirth && (
            <span className={errorTextClasses}>{errors.dateOfBirth.message}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <input type="email" {...register('email')} className={inputClasses} />
          {errors.email && (
            <span className={errorTextClasses}>{errors.email.message}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Phone
          <input {...register('phone')} className={inputClasses} />
          {errors.phone && (
            <span className={errorTextClasses}>{errors.phone.message}</span>
          )}
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          {member ? 'Save changes' : 'Add crew member'}
        </Button>
      </div>
    </form>
  );
}
