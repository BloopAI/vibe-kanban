import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '@clerk/clerk-react';
import type {
  OrganizationMembershipResource,
  PublicUserData,
} from '@clerk/types';

export type PublicUserSummary = Pick<
  PublicUserData,
  'firstName' | 'lastName' | 'identifier' | 'imageUrl' | 'hasImage'
>;

type MembershipWithPublicData = {
  publicUserData?: PublicUserData | null;
};

const findMemberById = (
  members: MembershipWithPublicData[],
  userId: string
): PublicUserData | null => {
  for (const member of members) {
    if (member.publicUserData?.userId === userId) {
      return member.publicUserData;
    }
  }
  return null;
};

export const useClerkPublicUserData = (
  userId?: string | null
): {
  data: PublicUserSummary | null;
  isLoading: boolean;
  isError: boolean;
} => {
  const { organization } = useOrganization();
  const effectiveUserId = userId ?? null;
  const organizationId = organization?.id ?? null;

  const query = useQuery({
    queryKey: ['clerk', 'public-user', organizationId, effectiveUserId],
    enabled: Boolean(effectiveUserId) && Boolean(organization),
    queryFn: async (): Promise<PublicUserSummary | null> => {
      if (!organization || !effectiveUserId) {
        return null;
      }

      const orgWithOptionalGetter = organization as unknown as {
        getMembership?: (
          targetUserId: string
        ) => Promise<{ publicUserData?: PublicUserData } | null>;
        getMemberships: () => Promise<{
          data: Array<{ publicUserData?: PublicUserData | null }>;
        }>;
      };

      try {
        if (orgWithOptionalGetter.getMembership) {
          const membership =
            await orgWithOptionalGetter.getMembership(effectiveUserId);
          const publicData = membership?.publicUserData;
          if (publicData) {
            return {
              firstName: publicData.firstName,
              lastName: publicData.lastName,
              identifier: publicData.identifier,
              imageUrl: publicData.imageUrl,
              hasImage: publicData.hasImage,
            };
          }
        }

        const memberships = await orgWithOptionalGetter.getMemberships();
        const publicData = findMemberById(
          (memberships.data ?? []) as OrganizationMembershipResource[],
          effectiveUserId
        );
        if (!publicData) {
          return null;
        }

        return {
          firstName: publicData.firstName,
          lastName: publicData.lastName,
          identifier: publicData.identifier,
          imageUrl: publicData.imageUrl,
          hasImage: publicData.hasImage,
        };
      } catch (error) {
        return null;
      }
    },
    staleTime: 10 * 1000 * 60,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading || query.isFetching,
    isError: query.isError,
  };
};
