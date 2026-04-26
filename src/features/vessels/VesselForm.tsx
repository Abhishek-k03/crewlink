import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { errorTextClasses, fieldClasses } from '@/components/ui/formStyles';
import { vesselInputSchema } from '@/domain/schemas';
import { RANKS, type Vessel, VESSEL_STATUSES, VESSEL_TYPES } from '@/domain/types';

// `readyToSail` isn't a form field — it's a state transition the manning rule
// can refuse, with its own action on the list.
const vesselFormSchema = vesselInputSchema.omit({ readyToSail: true });
type VesselFormValues = z.infer<typeof vesselFormSchema>;

const EMPTY_MANNING: VesselFormValues['minimumSafeManning'] = {};

const inputClasses = `${fieldClasses} w-full`;

interface VesselFormProps {
  vessel?: Vessel;
  pending: boolean;
  onSubmit: (values: VesselFormValues) => Promise<void>;
  onCancel: () => void;
}

export function VesselForm({ vessel, pending, onSubmit, onCancel }: VesselFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<VesselFormValues>({
    resolver: zodResolver(vesselFormSchema),
    defaultValues: {
      name: vessel?.name ?? '',
      imoNumber: vessel?.imoNumber ?? '',
      flag: vessel?.flag ?? '',
      type: vessel?.type ?? 'Bulk Carrier',
      status: vessel?.status ?? 'In Service',
      minimumSafeManning: vessel?.minimumSafeManning ?? EMPTY_MANNING,
    },
  });

  const submit = handleSubmit(async (values) => {
    // A rank left blank means "no minimum", not zero and not NaN. Dropping the
    // key keeps the stored record honest about what was actually specified.
    const manning = Object.fromEntries(
      Object.entries(values.minimumSafeManning ?? {}).filter(
        ([, count]) => typeof count === 'number' && Number.isFinite(count) && count > 0,
      ),
    );

    try {
      await onSubmit({ ...values, minimumSafeManning: manning });
    } catch (error) {
      // The server validates with the same schema, but it also knows things the
      // form cannot -- such as whether an IMO number is already registered.
      if (error instanceof ApiError && error.fieldErrors) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          const message = messages?.[0];
          if (message) setError(field as keyof VesselFormValues, { message });
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
        {errors.name && <span className={errorTextClasses}>{errors.name.message}</span>}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          IMO number
          <input {...register('imoNumber')} inputMode="numeric" className={inputClasses} />
          {errors.imoNumber && (
            <span className={errorTextClasses}>{errors.imoNumber.message}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Flag
          <input {...register('flag')} className={inputClasses} />
          {errors.flag && (
            <span className={errorTextClasses}>{errors.flag.message}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Type
          <select {...register('type')} className={inputClasses}>
            {VESSEL_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select {...register('status')} className={inputClasses}>
            {VESSEL_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="rounded-md border border-line p-3">
        <legend className="px-1 text-sm font-medium">Minimum safe manning</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RANKS.map((rank) => (
            <label key={rank} className="flex flex-col gap-1 text-xs font-medium">
              {rank}
              <input
                type="number"
                min={0}
                {...register(`minimumSafeManning.${rank}`, {
                  // `valueAsNumber` turns an empty field into NaN, which fails
                  // validation with a message nobody can act on.
                  setValueAs: (value) => (value === '' || value === null ? undefined : Number(value)),
                })}
                className={`${inputClasses} px-2 py-1.5`}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          {vessel ? 'Save changes' : 'Add vessel'}
        </Button>
      </div>
    </form>
  );
}
