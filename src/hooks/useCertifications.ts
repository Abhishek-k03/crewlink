import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type CertificationListParams, certificationsApi } from '@/api/certifications';
import type { CertificationInput } from '@/domain/schemas';

import { certificationKeys } from './queryKeys';

export function useCertifications(params: CertificationListParams = {}) {
  return useQuery({
    queryKey: certificationKeys.list(params),
    queryFn: () => certificationsApi.list(params),
  });
}

export function useCreateCertification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CertificationInput) => certificationsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: certificationKeys.all }),
  });
}

export function useDeleteCertification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => certificationsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: certificationKeys.all }),
  });
}
